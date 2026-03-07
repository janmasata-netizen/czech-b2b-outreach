#!/usr/bin/env node
/**
 * IMAP Proxy Microservice
 * Bypasses n8n's buggy emailReadImap that marks emails as \Seen.
 * Uses imapflow with BODY.PEEK[] to never set \Seen flag.
 *
 * POST /check-inbox  { "credential_name": "Salesman IMAP 1" }
 * GET  /health       → { "status": "ok" }
 */
import http from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const MAX_BODY_SIZE = 1024 * 1024; // 1MB
const BEARER_TOKEN = process.env.PROXY_AUTH_TOKEN || '';

// Simple in-memory rate limiter (per IP, sliding window)
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '60', 10); // requests per minute
const rateBuckets = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  let bucket = rateBuckets.get(ip);
  if (!bucket) { bucket = []; rateBuckets.set(ip, bucket); }
  // Remove expired entries
  while (bucket.length > 0 && bucket[0] <= now - windowMs) bucket.shift();
  if (bucket.length >= RATE_LIMIT) return false;
  bucket.push(now);
  return true;
}
// Clean up old IPs every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.length === 0 || bucket[bucket.length - 1] < cutoff) rateBuckets.delete(ip);
  }
}, 300_000);

// Load credentials from config.json
let config;
try {
  config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf-8'));
} catch (e) {
  console.error('FATAL: Cannot read config.json:', e.message);
  process.exit(1);
}

/**
 * Fetch unseen emails from an IMAP mailbox using BODY.PEEK[] (never marks \Seen)
 * Returns array in n8n emailReadImap v2 "simple" format
 */
async function fetchUnseenEmails(creds) {
  const client = new ImapFlow({
    host: creds.host,
    port: creds.port || 993,
    secure: creds.port === 143 ? false : true,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
    connectionTimeout: 30000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  const emails = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Search for unseen messages
      const uids = await client.search({ seen: false }, { uid: true });

      if (uids && uids.length > 0) {
        // Fetch with BODY.PEEK[] — this NEVER sets \Seen
        for await (const msg of client.fetch(uids, {
          uid: true,
          source: true, // BODY.PEEK[] — raw RFC822 source
        })) {
          try {
            const parsed = await simpleParser(msg.source);

            // Format to match n8n emailReadImap v2 "simple" output exactly
            const email = {
              from: formatAddress(parsed.from),
              to: formatAddress(parsed.to),
              cc: formatAddress(parsed.cc),
              subject: parsed.subject || '',
              date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
              text: parsed.text || '',
              textHtml: parsed.html || '',
              messageId: parsed.messageId || '',
              headers: flattenHeaders(parsed.headers),
            };

            emails.push(email);
          } catch (parseErr) {
            console.error('Failed to parse email UID', msg.uid, ':', parseErr.message);
          }
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    // Always close the connection — prevents leaked IMAP sessions
    try { await client.logout(); } catch (_) {}
  }

  return emails;
}

/** Format mailparser address object to "Name <email>" string (matches n8n format) */
function formatAddress(addrObj) {
  if (!addrObj || !addrObj.value) return '';
  return addrObj.value.map(a => {
    if (a.name) return `${a.name} <${a.address}>`;
    return a.address || '';
  }).join(', ');
}

/** Flatten mailparser Headers Map to plain object (matches n8n headers format) */
function flattenHeaders(headers) {
  if (!headers) return {};
  const obj = {};
  for (const [key, value] of headers) {
    // n8n stores headers as lowercase key → string value
    obj[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return obj;
}

/** Check Bearer token if configured */
function checkAuth(req) {
  if (!BEARER_TOKEN) return true;
  const auth = req.headers['authorization'];
  return auth === `Bearer ${BEARER_TOKEN}`;
}

/** Read request body with size limit */
async function readBody(req) {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    throw new Error('Payload too large');
  }
  let body = '';
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) throw new Error('Payload too large');
    body += chunk;
  }
  return body;
}

/** HTTP request handler */
async function handleRequest(req, res) {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // Rate limit check
  const clientIp = req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
    res.end(JSON.stringify({ success: false, error: 'Too many requests' }));
    return;
  }

  // Health check (no auth needed)
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/check-inbox') {
    if (!checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Unauthorized', emails: [] }));
      return;
    }

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Payload too large', emails: [] }));
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid JSON', emails: [] }));
      return;
    }

    const credName = payload.credential_name;
    if (!credName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing credential_name', emails: [] }));
      return;
    }

    const creds = config.credentials?.[credName];
    if (!creds) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Unknown credential', emails: [] }));
      return;
    }

    try {
      const emails = await fetchUnseenEmails(creds);
      console.log(`[${new Date().toISOString()}] check-inbox: ${emails.length} unseen emails`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, emails }));
    } catch (err) {
      console.error(`[${new Date().toISOString()}] check-inbox ERROR:`, err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Internal server error', emails: [] }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

const server = http.createServer(handleRequest);
server.requestTimeout = 30000;
server.listen(PORT, '127.0.0.1', () => {
  const credCount = Object.keys(config.credentials || {}).length;
  console.log(`IMAP proxy listening on 127.0.0.1:${PORT} (${credCount} credentials configured)`);
});

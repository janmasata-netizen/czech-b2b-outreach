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
import https from 'https';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const MAX_BODY_SIZE = 1024 * 1024; // 1MB
const BEARER_TOKEN = process.env.PROXY_AUTH_TOKEN;
if (!BEARER_TOKEN || BEARER_TOKEN.length < 8) {
  console.error('FATAL: PROXY_AUTH_TOKEN must be set (min 8 chars). Set it in docker-compose.yml environment.');
  process.exit(1);
}

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
 * Fetch emails from an IMAP mailbox using BODY.PEEK[] (never marks \Seen)
 * Returns array in n8n emailReadImap v2 "simple" format
 * Searches ALL emails since N days ago — dedup handled by processed_reply_emails table
 * @param {object} creds - IMAP credentials
 * @param {number} sinceDays - Only fetch emails from the last N days (default: 7)
 */
async function fetchEmails(creds, sinceDays = 7) {
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
      // Search emails since N days ago (dedup handled by processed_reply_emails table)
      const since = new Date();
      since.setDate(since.getDate() - sinceDays);
      const uids = await client.search({ since }, { uid: true });

      if (uids && uids.length > 0) {
        // Post-filter: only keep emails within sinceDays (IMAP SINCE is date-only)
        const cutoff = new Date(Date.now() - sinceDays * 86400000);

        // Fetch with BODY.PEEK[] — this NEVER sets \Seen
        for await (const msg of client.fetch(uids, {
          uid: true,
          source: true, // BODY.PEEK[] — raw RFC822 source
        }, { uid: true })) {
          try {
            const parsed = await simpleParser(msg.source);

            // Skip emails older than the precise cutoff (IMAP SINCE rounds to day)
            if (parsed.date && parsed.date < cutoff) continue;

            // Lightweight output — match cascade only needs headers, not bodies
            const email = {
              from: formatAddress(parsed.from),
              to: formatAddress(parsed.to),
              cc: formatAddress(parsed.cc),
              subject: parsed.subject || '',
              date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
              text: (parsed.text || '').slice(0, 200),
              textHtml: '',
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

/**
 * Query Supabase for already-processed message IDs
 * Returns a Set of message_id strings
 */
async function getProcessedMessageIds() {
  const sbUrl = config.supabase_url;
  const sbKey = config.supabase_service_key;
  if (!sbUrl || !sbKey) return new Set();

  const url = `${sbUrl}/rest/v1/processed_reply_emails?select=message_id`;

  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const rows = JSON.parse(data);
          resolve(new Set(rows.map(r => r.message_id)));
        } catch {
          console.error('Failed to parse processed_reply_emails response');
          resolve(new Set());
        }
      });
    });
    req.on('error', (err) => {
      console.error('Supabase query error:', err.message);
      resolve(new Set()); // On error, return empty set (no dedup, safe fallback)
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(new Set());
    });
  });
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

/** Check Bearer token */
function checkAuth(req) {
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
      const sinceDays = parseFloat(payload.since_days) || 7;
      const allEmails = await fetchEmails(creds, sinceDays);

      // Dedup: filter out already-processed emails
      const processedIds = await getProcessedMessageIds();
      const newEmails = allEmails.filter(e => e.messageId && !processedIds.has(e.messageId));

      // Return max 1 unprocessed email to avoid n8n task runner crash on loop iteration 2+
      const emails = newEmails.slice(0, 1);

      console.log(`[${new Date().toISOString()}] check-inbox: ${allEmails.length} fetched, ${processedIds.size} processed, ${newEmails.length} new, returning ${emails.length} (last ${sinceDays}d)`);
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
// Bind 0.0.0.0 inside container — Docker port mapping restricts to host 127.0.0.1
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
server.listen(PORT, BIND_HOST, () => {
  const credCount = Object.keys(config.credentials || {}).length;
  console.log(`IMAP proxy listening on 127.0.0.1:${PORT} (${credCount} credentials configured)`);
});

// Graceful shutdown — let in-flight requests finish before exiting
function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully…`);
  server.close(() => {
    console.log('All connections closed, exiting.');
    process.exit(0);
  });
  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    console.error('Forced exit after 10s timeout');
    process.exit(1);
  }, 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

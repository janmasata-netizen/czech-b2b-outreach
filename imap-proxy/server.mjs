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

/** HTTP request handler */
async function handleRequest(req, res) {
  // CORS / health
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/check-inbox') {
    let body = '';
    for await (const chunk of req) body += chunk;

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
      res.end(JSON.stringify({ success: false, error: `Unknown credential: ${credName}`, emails: [] }));
      return;
    }

    try {
      const emails = await fetchUnseenEmails(creds);
      console.log(`[${new Date().toISOString()}] ${credName}: ${emails.length} unseen emails`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, emails }));
    } catch (err) {
      const detail = err.responseText || err.code || '';
      console.error(`[${new Date().toISOString()}] ${credName} ERROR:`, err.message, '| responseStatus:', err.responseStatus, '| responseText:', err.responseText, '| code:', err.code);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: detail ? `${err.message}: ${detail}` : err.message, emails: [] }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

const server = http.createServer(handleRequest);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`IMAP proxy listening on port ${PORT}`);
  console.log(`Configured credentials: ${Object.keys(config.credentials || {}).join(', ')}`);
});

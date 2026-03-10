#!/usr/bin/env node
/**
 * SMTP Proxy Microservice
 * Sends emails via nodemailer with proper Message-ID, In-Reply-To, References
 * using dedicated mailOptions fields (not headers object).
 *
 * POST /send-email  { credential_name, from, to, subject, html, replyTo, messageId, inReplyTo, references }
 * GET  /health      → { status: "ok" }
 */
import http from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createTransport } from 'nodemailer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3002;
const MAX_BODY_SIZE = 1024 * 1024; // 1MB
const BEARER_TOKEN = process.env.PROXY_AUTH_TOKEN || '';

// Simple in-memory rate limiter (per IP, sliding window)
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '120', 10); // requests per minute
const rateBuckets = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  let bucket = rateBuckets.get(ip);
  if (!bucket) { bucket = []; rateBuckets.set(ip, bucket); }
  while (bucket.length > 0 && bucket[0] <= now - windowMs) bucket.shift();
  if (bucket.length >= RATE_LIMIT) return false;
  bucket.push(now);
  return true;
}
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

// Cache transporter instances per credential name (with 30min TTL)
const transporters = new Map();
const TRANSPORTER_TTL = 30 * 60 * 1000;

function getTransporter(credName) {
  const cached = transporters.get(credName);
  if (cached && Date.now() - cached.createdAt < TRANSPORTER_TTL) return cached.transporter;

  const creds = config.credentials?.[credName];
  if (!creds) return null;

  // Close old transporter if exists
  if (cached) try { cached.transporter.close(); } catch (_) {}

  const transporter = createTransport({
    host: creds.host,
    port: creds.port || 465,
    secure: creds.secure !== undefined ? creds.secure : (creds.port === 465),
    auth: {
      user: creds.user,
      pass: creds.pass,
    },
    connectionTimeout: 30000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  transporters.set(credName, { transporter, createdAt: Date.now() });
  return transporter;
}

/** Validate email format */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Sanitize subject — reject header injection attempts */
function sanitizeSubject(subject) {
  if (!subject) return '';
  if (/[\r\n]/.test(subject)) throw new Error('Invalid subject (header injection attempt)');
  if (subject.length > 998) throw new Error('Subject too long');
  return subject;
}

/**
 * Send an email with proper threading headers
 */
async function sendEmail(payload) {
  const { credential_name, from, to, subject, html, replyTo, messageId, inReplyTo, references } = payload;

  if (!isValidEmail(to)) throw new Error('Invalid recipient email');
  const safeSubject = sanitizeSubject(subject);

  const transporter = getTransporter(credential_name);
  if (!transporter) {
    throw new Error(`Unknown credential: ${credential_name}`);
  }

  // Build mailOptions with dedicated fields for protected headers
  const mailOptions = {
    from,
    to,
    subject: safeSubject,
    html,
  };

  // Reply-To
  if (replyTo) {
    mailOptions.replyTo = replyTo;
  }

  // Message-ID — nodemailer's dedicated field (NOT in headers object)
  if (messageId) {
    // nodemailer expects messageId WITHOUT angle brackets — it adds them itself
    // But if already wrapped in <>, strip them to avoid double-wrapping
    mailOptions.messageId = messageId.replace(/^</, '').replace(/>$/, '');
  }

  // In-Reply-To — only set if non-empty (seq 1 has none)
  if (inReplyTo && inReplyTo.trim()) {
    mailOptions.inReplyTo = inReplyTo.trim();
  }

  // References — only set if non-empty (seq 1 has none)
  if (references && references.trim()) {
    mailOptions.references = references.trim();
  }

  const info = await transporter.sendMail(mailOptions);

  return {
    messageId: info.messageId,
    response: info.response,
  };
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

  if (req.method === 'POST' && req.url === '/send-email') {
    if (!checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
      return;
    }

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Payload too large' }));
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
      return;
    }

    // Validate required fields
    if (!payload.credential_name) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing credential_name' }));
      return;
    }
    if (!payload.to) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing to' }));
      return;
    }

    try {
      const result = await sendEmail(payload);
      console.log(`[${new Date().toISOString()}] Sent to ${payload.to} | MsgID: ${result.messageId}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, messageId: result.messageId, response: result.response }));
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Send FAILED to ${payload.to}:`, err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Send failed' }));
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
  console.log(`SMTP proxy listening on 127.0.0.1:${PORT} (${credCount} credentials configured)`);
});

// Graceful shutdown — let in-flight requests finish, close SMTP transporters
function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully…`);
  // Close all cached SMTP transporters
  for (const [name, { transporter }] of transporters) {
    try { transporter.close(); } catch (_) {}
  }
  transporters.clear();
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

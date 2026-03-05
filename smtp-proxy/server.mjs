#!/usr/bin/env node
/**
 * SMTP Proxy Microservice
 * Sends emails via nodemailer with proper Message-ID, In-Reply-To, References
 * using dedicated mailOptions fields (not headers object).
 *
 * This bypasses the n8n-nodes-better-send-mail bug where protected headers
 * set via mailOptions.headers get overwritten by nodemailer.
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

// Load credentials from config.json
let config;
try {
  config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf-8'));
} catch (e) {
  console.error('FATAL: Cannot read config.json:', e.message);
  process.exit(1);
}

// Cache transporter instances per credential name
const transporters = new Map();

function getTransporter(credName) {
  if (transporters.has(credName)) return transporters.get(credName);

  const creds = config.credentials?.[credName];
  if (!creds) return null;

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

  transporters.set(credName, transporter);
  return transporter;
}

/**
 * Send an email with proper threading headers
 */
async function sendEmail(payload) {
  const { credential_name, from, to, subject, html, replyTo, messageId, inReplyTo, references } = payload;

  const transporter = getTransporter(credential_name);
  if (!transporter) {
    throw new Error(`Unknown credential: ${credential_name}`);
  }

  // Build mailOptions with dedicated fields for protected headers
  const mailOptions = {
    from,
    to,
    subject,
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

/** HTTP request handler */
async function handleRequest(req, res) {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/send-email') {
    let body = '';
    for await (const chunk of req) body += chunk;

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
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

const server = http.createServer(handleRequest);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`SMTP proxy listening on port ${PORT}`);
  console.log(`Configured credentials: ${Object.keys(config.credentials || {}).join(', ')}`);
});

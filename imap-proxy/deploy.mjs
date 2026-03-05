#!/usr/bin/env node
/**
 * Deploy imap-proxy to VPS via SSH/SFTP
 * Usage: node deploy.mjs
 *
 * Uploads source files + config.json, builds Docker image on VPS, restarts container.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { VPS_IP } from '../n8n-workflows/env.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('ssh2');

const VPS_USER   = 'root';
const REMOTE_DIR = '/docker/imap-proxy';
const SSH_KEY    = join(fileURLToPath(import.meta.url), '..', '..', '.ssh', 'vps_deploy_key');

const LOCAL_DIR = join(fileURLToPath(import.meta.url), '..');

// Files to upload (relative to LOCAL_DIR)
const FILES = [
  'server.mjs',
  'package.json',
  'Dockerfile',
  'docker-compose.yml',
  'config.json',
];

/** SSH exec helper */
function execSSH(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '', errOut = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => errOut += d);
      stream.on('close', (code) => {
        if (code !== 0) reject(new Error(`cmd failed (${code}): ${errOut || out}`));
        else resolve(out.trim());
      });
    });
  });
}

async function deploy() {
  console.log('=== Deploying imap-proxy to VPS ===\n');

  const privateKey = readFileSync(SSH_KEY);
  const conn = new Client();

  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({
      host: VPS_IP, port: 22, username: VPS_USER,
      privateKey,
      readyTimeout: 15000,
    });
  });
  console.log('SSH connected');

  // Get SFTP handle
  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, s) => err ? reject(err) : resolve(s));
  });

  // Create remote directory
  await execSSH(conn, `mkdir -p ${REMOTE_DIR}`).catch(() => {});

  // Upload files
  for (const file of FILES) {
    const content = readFileSync(join(LOCAL_DIR, file));
    await new Promise((resolve, reject) => {
      const ws = sftp.createWriteStream(`${REMOTE_DIR}/${file}`);
      ws.on('error', reject);
      ws.on('close', resolve);
      ws.end(content);
    });
    console.log(`  Uploaded: ${file}`);
  }

  // Install dependencies on VPS (needed for npm ci in Docker build)
  console.log('\nBuilding Docker image...');
  try {
    const buildOutput = await execSSH(conn, `cd ${REMOTE_DIR} && docker compose build --no-cache 2>&1`);
    console.log('  Build output:', buildOutput.slice(-200));
  } catch (e) {
    console.error('  Build error:', e.message.slice(-300));
    // Try docker-compose (v1) fallback
    try {
      const fallback = await execSSH(conn, `cd ${REMOTE_DIR} && docker-compose build --no-cache 2>&1`);
      console.log('  Fallback build:', fallback.slice(-200));
    } catch (e2) {
      console.error('  Fallback also failed:', e2.message.slice(-300));
      conn.end();
      process.exit(1);
    }
  }

  // Start/restart container
  console.log('\nStarting container...');
  try {
    // Stop existing if running
    await execSSH(conn, `cd ${REMOTE_DIR} && docker compose down 2>&1`).catch(() => {});
    const upOutput = await execSSH(conn, `cd ${REMOTE_DIR} && docker compose up -d 2>&1`);
    console.log('  ', upOutput);
  } catch (e) {
    // docker-compose v1 fallback
    await execSSH(conn, `cd ${REMOTE_DIR} && docker-compose down 2>&1`).catch(() => {});
    const upOutput = await execSSH(conn, `cd ${REMOTE_DIR} && docker-compose up -d 2>&1`);
    console.log('  ', upOutput);
  }

  // Verify health
  console.log('\nVerifying health...');
  // Wait a moment for container startup
  await new Promise(r => setTimeout(r, 3000));
  try {
    const health = await execSSH(conn, `curl -s http://127.0.0.1:3001/health`);
    console.log('  Health check:', health);
  } catch (e) {
    console.warn('  Health check failed:', e.message);
    console.warn('  Container may still be starting — check manually: curl http://127.0.0.1:3001/health');
  }

  // Test n8n→proxy connectivity (Docker bridge gateway)
  console.log('\nTesting n8n→proxy connectivity...');
  try {
    const n8nContainer = (await execSSH(conn, `docker ps --filter name=n8n --format "{{.Names}}" | head -1`)).trim();
    if (n8nContainer) {
      const proxyHealth = await execSSH(conn, `docker exec ${n8nContainer} wget -qO- http://172.17.0.1:3001/health 2>&1`);
      console.log(`  n8n (${n8nContainer}) → proxy: ${proxyHealth}`);
    } else {
      console.warn('  Could not find n8n container — test manually');
    }
  } catch (e) {
    console.warn('  n8n→proxy test failed:', e.message.slice(0, 100));
    console.warn('  If 172.17.0.1 does not work, try host.docker.internal or a shared network');
  }

  conn.end();
  console.log('\nDeploy complete! Proxy at 127.0.0.1:3001 (VPS-local only)');
}

deploy().catch(e => { console.error('Deploy failed:', e.message); process.exit(1); });

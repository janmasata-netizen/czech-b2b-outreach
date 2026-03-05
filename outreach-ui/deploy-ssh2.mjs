#!/usr/bin/env node
/**
 * Deploy outreach-ui dist to VPS via SSH/SFTP (password-based, no sshpass needed)
 * Usage: VPS_PASS=yourpassword node deploy-ssh2.mjs
 */
import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Client } = require('ssh2');

const VPS_IP   = '72.62.53.244';
const VPS_USER = 'root';
const REMOTE_DIR = '/docker/outreach-ui/dist';
const DOCKER_CTR = 'outreach-ui-outreach-ui-1';
const SSH_KEY    = join(fileURLToPath(import.meta.url), '..', '..', '.ssh', 'vps_deploy_key');

const LOCAL_DIST = join(fileURLToPath(import.meta.url), '..', 'dist');
const VPS_PASS = process.env.VPS_PASS; // optional fallback

/** Recursively collect all files under a directory */
async function walkDir(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...await walkDir(full, base));
    else files.push({ local: full, remote: relative(base, full).replace(/\\/g, '/') });
  }
  return files;
}

/** SSH exec helper — returns stdout */
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
  const files = await walkDir(LOCAL_DIST);
  console.log(`Found ${files.length} files in dist/`);

  const conn = new Client();

  const privateKey = await readFile(SSH_KEY).catch(() => null);

  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({
      host: VPS_IP, port: 22, username: VPS_USER,
      readyTimeout: 15000,
      ...(privateKey ? { privateKey } : { password: VPS_PASS }),
    });
  });
  console.log('✓ SSH connected');

  // Get SFTP handle
  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, s) => err ? reject(err) : resolve(s));
  });

  // Ensure remote directories exist
  const dirs = new Set(files.map(f => {
    const parts = f.remote.split('/');
    parts.pop();
    return parts.join('/');
  }).filter(Boolean));

  // Create root dir
  await execSSH(conn, `mkdir -p ${REMOTE_DIR} && rm -rf ${REMOTE_DIR}/*`).catch(() => {});
  for (const d of dirs) {
    await new Promise((resolve) => {
      sftp.mkdir(`${REMOTE_DIR}/${d}`, () => resolve()); // ignore error if exists
    });
  }

  // Upload each file
  let done = 0;
  for (const { local, remote } of files) {
    const content = await readFile(local);
    await new Promise((resolve, reject) => {
      const ws = sftp.createWriteStream(`${REMOTE_DIR}/${remote}`);
      ws.on('error', reject);
      ws.on('close', resolve);
      ws.end(content);
    });
    done++;
    process.stdout.write(`\r  Uploading ${done}/${files.length}: ${remote.slice(-50).padEnd(50)}`);
  }
  console.log('\n✓ All files uploaded');

  // Restart Docker container
  console.log('Restarting Docker container...');
  try {
    const result = await execSSH(conn, `docker restart ${DOCKER_CTR} 2>&1 || docker compose -f /opt/outreach-ui/docker-compose.deploy.yml restart 2>&1`);
    console.log('✓ Docker restart:', result.trim());
  } catch (e) {
    console.warn('Docker restart warning:', e.message);
  }

  conn.end();
  console.log(`\n✓ Deployed! UI available at http://${VPS_IP}:32772`);
}

deploy().catch(e => { console.error('Deploy failed:', e.message); process.exit(1); });

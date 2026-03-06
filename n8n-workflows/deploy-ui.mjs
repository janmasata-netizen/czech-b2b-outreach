import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { VPS_IP } from './env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.resolve(__dirname, '../outreach-ui');
const DIST_DIR = path.join(UI_DIR, 'dist');
const REMOTE_DIR = '/docker/outreach-ui';

const SSH_CONFIG = {
  host: VPS_IP,
  port: 22,
  username: 'root',
  privateKey: fs.readFileSync(path.join(homedir(), '.ssh', 'vps_deploy_key')),
  readyTimeout: 20000,
};

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '', errOut = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => errOut += d);
      stream.on('close', (code) => {
        if (code !== 0) reject(new Error(`Command failed (${code}): ${errOut || cmd}`));
        else resolve(out.trim());
      });
    });
  });
}

function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, err => err ? reject(err) : resolve());
  });
}

function mkdirRemote(sftp, remotePath) {
  return new Promise((resolve) => {
    sftp.mkdir(remotePath, err => resolve()); // ignore if exists
  });
}

async function uploadDir(sftp, localDir, remoteDir) {
  await mkdirRemote(sftp, remoteDir);
  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);
    const remotePath = `${remoteDir}/${entry.name}`;
    if (entry.isDirectory()) {
      await uploadDir(sftp, localPath, remotePath);
    } else {
      process.stdout.write(`  uploading ${entry.name}...\r`);
      await uploadFile(sftp, localPath, remotePath);
    }
  }
}

function getSftp(conn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => err ? reject(err) : resolve(sftp));
  });
}

async function deploy() {
  console.log('Connecting to VPS...');
  const conn = new Client();

  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect(SSH_CONFIG);
  });

  console.log('Connected!');

  // 1. Create remote directory structure
  console.log('Creating remote directories...');
  await sshExec(conn, `mkdir -p ${REMOTE_DIR}/dist`);

  // 2. Upload files via SFTP
  console.log('Uploading dist/ ...');
  const sftp = await getSftp(conn);
  await uploadDir(sftp, DIST_DIR, `${REMOTE_DIR}/dist`);
  console.log('\ndist/ uploaded.');

  // 3. Upload nginx.conf
  console.log('Uploading nginx.conf...');
  await uploadFile(sftp, path.join(UI_DIR, 'nginx.conf'), `${REMOTE_DIR}/nginx.conf`);

  // 4. Write docker-compose.yml on remote
  console.log('Writing docker-compose.yml...');
  const composeContent = `services:
  outreach-ui:
    image: nginx:alpine
    ports:
      - "32772:80"
    volumes:
      - ./dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    restart: unless-stopped
`;
  await sshExec(conn, `cat > ${REMOTE_DIR}/docker-compose.yml << 'COMPOSE_EOF'\n${composeContent}\nCOMPOSE_EOF`);

  // 5. Start container
  console.log('Starting container...');
  const result = await sshExec(conn, `cd ${REMOTE_DIR} && docker compose up -d 2>&1`);
  console.log(result);

  // 6. Verify
  const ps = await sshExec(conn, 'docker ps --format "table {{.Names}}\\t{{.Ports}}\\t{{.Status}}"');
  console.log('\nRunning containers:');
  console.log(ps);

  conn.end();
  console.log('\nDone! UI is live at http://${VPS_IP}:32772');
}

deploy().catch(err => {
  console.error('Deploy failed:', err.message);
  process.exit(1);
});

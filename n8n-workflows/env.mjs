// Shared environment loader — reads secrets from ../.env.local
// No external dependencies (pure fs parsing).

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');

const env = {};
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

// n8n
export const N8N_BASE_URL = env.N8N_BASE_URL;                // http://IP:32770
export const N8N_API_KEY = env.N8N_API_KEY;
export const N8N_HOST = new URL(N8N_BASE_URL).hostname;       // IP only
export const N8N_PORT = parseInt(new URL(N8N_BASE_URL).port); // 32770

// Supabase
export const SUPABASE_URL = env.SUPABASE_URL;
export const SUPABASE_PROJECT_REF = env.SUPABASE_PROJECT_REF;
export const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
export const SUPABASE_MANAGEMENT_TOKEN = env.SUPABASE_MANAGEMENT_TOKEN;

// VPS
export const VPS_IP = env.VPS_IP;

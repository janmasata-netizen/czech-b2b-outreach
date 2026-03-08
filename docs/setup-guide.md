# Setup Guide

## Prerequisites

- **Node.js** v18+ (with npm)
- **Docker** & Docker Compose
- **GitHub CLI** (`gh`) — for PR workflow
- **SSH access** to the VPS (key at `~/.ssh/vps_deploy_key`)
- **Supabase account** with an active project
- **n8n** self-hosted instance (Docker on VPS)

## 1. Clone and Configure

### Clone the repository

```bash
git clone git@github.com:janmasata-netizen/czech-b2b-outreach.git
cd czech-b2b-outreach
```

### Environment setup

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local`:

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `N8N_BASE_URL` | n8n instance URL (e.g. `http://72.62.53.244:32770`) | VPS Docker config |
| `N8N_API_KEY` | n8n REST API key | n8n Settings > API |
| `N8N_MCP_BEARER` | Bearer token for webhook auth | Generate a random token, set in n8n |
| `SUPABASE_URL` | Supabase project URL | Supabase Dashboard > Settings > API |
| `SUPABASE_PROJECT_REF` | Project reference ID | Supabase Dashboard > Settings > General |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side service role key | Supabase Dashboard > Settings > API |
| `SUPABASE_MANAGEMENT_TOKEN` | Management API token | Supabase Dashboard > Access Tokens |
| `HOSTINGER_API_TOKEN` | Hostinger API token | Hostinger control panel |
| `VPS_IP` | VPS IP address | `72.62.53.244` |
| `VITE_SUPABASE_URL` | Frontend Supabase URL (same as SUPABASE_URL) | Same as above |
| `VITE_SUPABASE_ANON_KEY` | Frontend anon/public key | Supabase Dashboard > Settings > API |
| `VITE_N8N_WEBHOOK_URL` | Frontend n8n webhook base URL | Same as N8N_BASE_URL + `/webhook` |
| `VITE_WEBHOOK_SECRET` | Webhook auth secret for frontend calls | Same as N8N_MCP_BEARER |

## 2. Local Development

### UI Development

```bash
cd outreach-ui
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`. It reads environment variables from `../.env.local` (parent directory) via the Vite config.

The `@` path alias maps to `./src` — imports like `@/hooks/useLeads` resolve to `src/hooks/useLeads.ts`.

### Working with Workflows

Workflow JSON files live in `n8n-workflows/`. To modify a workflow:

1. Edit the JSON file locally
2. Push to n8n using the appropriate push script (see section 3)
3. Verify in the n8n UI that the workflow is active and correct

All helper scripts read secrets from `env.mjs` (which loads `../.env.local`). No hardcoded secrets in scripts.

## 3. Deploying Workflows to n8n

### Push scripts

Individual push scripts exist for each workflow or group:

```bash
cd n8n-workflows

# Push a specific workflow
node push-wf8.mjs        # Push WF8 (send cron)
node push-reply.mjs       # Push reply detection workflows
node push-ndr.mjs         # Push NDR monitor workflows
# ... etc (see n8n-workflows/push-*.mjs for all)
```

Each push script:
1. Reads the workflow JSON
2. Strips `pinData` and sets `active: false`
3. PUTs to n8n API (deactivate → update → activate)

### Import all workflows

For a fresh n8n instance, import everything:

```bash
node import.mjs
```

This POSTs all workflow JSONs to n8n, stripping test data.

### Update specific workflows

```bash
node update.mjs
```

Updates WF7, WF8, and WF10 specifically (the most frequently changed cron/scheduling workflows).

### Organize workflows

```bash
node organize.mjs
```

Applies tags to all workflows for grouping in the n8n UI.

## 4. VPS Deployment

### UI Deployment

```bash
cd outreach-ui
npm run build          # TypeScript compile + Vite build → dist/
node deploy-ssh2.mjs   # Upload dist/ to VPS via SFTP
```

The deploy script:
1. Connects to VPS at `72.62.53.244:22` as `root` via SSH key (`~/.ssh/vps_deploy_key`)
2. Uploads the entire `dist/` directory to `/docker/outreach-ui/dist` via SFTP
3. Restarts the `outreach-ui-outreach-ui-1` Docker container

Fallback: If SSH key is not found, it uses the `VPS_PASS` environment variable for password auth.

### IMAP Proxy Deployment

1. Create `imap-proxy/config.json` from `config.example.json`:

```json
{
  "credentials": {
    "Salesman IMAP 1": {
      "host": "imap.example.com",
      "port": 993,
      "user": "email@example.com",
      "pass": "password"
    }
  }
}
```

2. Deploy:

```bash
cd imap-proxy
node deploy.mjs
```

This uploads files to `/docker/imap-proxy/` on the VPS, builds the Docker image, and restarts the container. The proxy runs on `127.0.0.1:3001` (accessible only within the Docker network).

### SMTP Proxy Deployment

1. Create `smtp-proxy/config.json` from `config.example.json`:

```json
{
  "credentials": {
    "Burner SMTP": {
      "host": "smtp.example.com",
      "port": 465,
      "secure": true,
      "user": "your-smtp-user",
      "pass": "your-smtp-password"
    }
  }
}
```

2. Deploy:

```bash
cd smtp-proxy
node deploy.mjs
```

Same process as IMAP proxy — uploads to `/docker/smtp-proxy/`, builds, restarts. Runs on `127.0.0.1:3002`.

## 5. Supabase Setup (Fresh Install)

For a brand new Supabase project, run the setup scripts in order:

### Database schema

```bash
cd n8n-workflows
node db-setup.mjs
```

Creates all 19 tables, types, functions, triggers, and RLS policies.

### Run migrations

The `migrate-*.mjs` scripts in `n8n-workflows/` have all been run on the current database. For a fresh install, run them in filename order:

```bash
node migrate-001-*.mjs
node migrate-002-*.mjs
# ... continue for all migrate-*.mjs files
```

### Seed data

```bash
node seed.mjs
```

Seeds initial config values and any required reference data.

### Create admin user

```bash
node create-admin.mjs
```

Creates the first admin user in Supabase Auth + profiles table.

### Combined setup (alternative)

```bash
node setup-all.mjs
```

Runs db-setup, migrations, seed, and create-admin in sequence.

## 6. Environment Variables Reference

| Variable | Used By | Description |
|----------|---------|-------------|
| `N8N_BASE_URL` | Scripts, UI | n8n API base URL |
| `N8N_API_KEY` | Scripts | n8n REST API authentication |
| `N8N_MCP_BEARER` | n8n webhooks | Bearer token for webhook auth |
| `SUPABASE_URL` | Scripts | Supabase project URL |
| `SUPABASE_PROJECT_REF` | Scripts | Supabase project reference ID |
| `SUPABASE_SERVICE_ROLE_KEY` | Scripts | Server-side Supabase key (full access) |
| `SUPABASE_MANAGEMENT_TOKEN` | Scripts | Supabase Management API token |
| `HOSTINGER_API_TOKEN` | MCP tools | Hostinger API for VPS management |
| `VPS_IP` | Deploy scripts | VPS IP address (72.62.53.244) |
| `VITE_SUPABASE_URL` | UI (frontend) | Supabase URL for browser client |
| `VITE_SUPABASE_ANON_KEY` | UI (frontend) | Supabase anon key for browser client |
| `VITE_N8N_WEBHOOK_URL` | UI (frontend) | n8n webhook base URL for UI calls |
| `VITE_WEBHOOK_SECRET` | UI (frontend) | Webhook auth secret |

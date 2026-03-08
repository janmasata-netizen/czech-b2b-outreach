# Documentation Templates

These templates define the structure for each generated doc file. Fill in every section with accurate, current data from the codebase.

---

## architecture.md

```markdown
# Architecture Overview

## System Overview
[1-2 paragraph summary of what the system does and how the components fit together]

## Architecture Diagram
[ASCII diagram showing: User -> React UI -> Supabase -> n8n workflows -> SMTP/IMAP proxies -> Email providers]

## Components

### n8n (Workflow Engine)
- Hosting, URL, how workflows are managed
- Webhook auth model

### Supabase (Database + Auth)
- Project details, what it handles (data, auth, RLS)

### React UI (outreach-ui/)
- Tech stack, key dependencies
- Route table with all paths and their purpose

### IMAP Proxy (imap-proxy/)
- Why it exists (n8n IMAP bugs)
- API endpoints
- Config format

### SMTP Proxy (smtp-proxy/)
- Why it exists (threading header support)
- API endpoints
- Config format

## Data Flow
[Step-by-step data flow from lead ingestion through email sending and reply detection]

### Lead Pipeline
1. Ingestion (WF1)
2. ARES lookup (WF2)
3. Kurzy.cz scraping (WF3)
4. Email generation (WF4)
5. Verification (WF5/WF6)
6. Ready for outreach

### Email Sending Pipeline
1. Wave creation and scheduling (WF7)
2. Cron-based sending (WF8)
3. Reply detection (WF9)
4. Daily reset (WF10)

## Workflow Reference
[Table: File name | n8n ID | Trigger type | Purpose — for ALL workflows]

## Database Schema

### Tables
[Table: Name | Purpose | Key columns — for all 19 tables]

### Key Relationships
[Describe foreign keys and how tables relate]

### Database Functions
[Table: Function name | Purpose — for all RPC functions]

### Database Triggers
[List triggers with their behavior]

## Security Model
- Webhook authentication
- Admin role checks in UI
- Supabase RLS
- Proxy access (localhost-only)
- No hardcoded secrets rule
```

---

## setup-guide.md

```markdown
# Setup Guide

## Prerequisites
- Node.js (version)
- Docker & Docker Compose
- GitHub CLI (`gh`)
- SSH access to VPS
- Supabase account
- n8n self-hosted instance

## 1. Clone and Configure

### Clone the repository
[git clone command]

### Environment setup
[Copy .env.example, list all variables and where to get them]

## 2. Local Development

### UI Development
[npm install, npm run dev, what URL]

### Working with Workflows
[How to edit workflow JSON, push to n8n]

## 3. Deploying Workflows to n8n

### Push scripts
[How push-*.mjs scripts work, which to use]

### Importing all workflows
[import.mjs usage]

### Updating specific workflows
[update.mjs usage]

## 4. VPS Deployment

### UI Deployment
[Build + deploy-ssh2.mjs process]

### IMAP Proxy Deployment
[config.json setup, deploy.mjs]

### SMTP Proxy Deployment
[config.json setup, deploy.mjs]

## 5. Supabase Setup (Fresh Install)

### Database schema
[db-setup.mjs, then migrations]

### Seed data
[seed.mjs]

### Create admin user
[create-admin.mjs]

### Combined setup
[setup-all.mjs]

## 6. Environment Variables Reference
[Full table of all env vars from .env.example with descriptions]
```

---

## operations-manual.md

```markdown
# Operations Manual

## Adding a New Salesman / IMAP Account
1. Add IMAP credentials to imap-proxy config.json on VPS
2. Restart imap-proxy container
3. Add SMTP credentials to smtp-proxy config.json on VPS
4. Restart smtp-proxy container
5. Add salesman record in UI (Settings > Salesmen)
6. Update team's outreach account if needed

## Creating and Scheduling Email Waves
1. Prepare leads (must be in 'ready' status)
2. Create wave in UI (Waves page)
3. Configure wave settings (template set, scheduling)
4. Add leads to wave
5. Schedule wave (triggers WF7)
6. Monitor sending (WF8 runs every 5 min)

## Template Management
- Template sets and individual templates
- A/B variant support
- Sequence ordering (seq1, seq2, seq3)
- Template variables available ({{salutation}}, etc.)

## Retarget Pool
- What it is
- How to use it
- When leads enter the retarget pool

## User Management
- Admin panel (Settings > Users)
- Role-based access (admin vs regular user)
- Supabase auth integration

## Monitoring

### Reply Detection
- WF9 runs every minute via IMAP proxy
- Replies linked to sent_emails via Message-ID threading
- Check lead_replies table or UI

### Bounce / NDR Monitoring
- wf-ndr-monitor checks INBOX
- wf-ndr-monitor-spam checks spam folder
- email_probe_bounces table

### Daily Reset
- WF10 runs at midnight
- Resets daily send counts
- Cleans old probe bounces

## Config Table Keys
[Table: Key | Purpose | Example value — for all config entries]

## Troubleshooting

### Emails not sending
- Check email_queue for stuck items
- Verify SMTP proxy is running (health endpoint)
- Check daily send limits
- Review WF8 execution logs in n8n

### Replies not detected
- Check IMAP proxy health
- Verify credential_name matches config.json
- Check WF9 execution logs
- Verify Message-ID threading headers

### Lead enrichment stuck
- Check enrichment_log for the lead
- Verify n8n workflow is active
- Check webhook endpoints are reachable

### Wave not completing
- Verify auto_complete_waves() is being called
- Check for failed emails in wave_leads
- Manual completion via UI if needed
```

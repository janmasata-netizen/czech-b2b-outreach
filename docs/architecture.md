# Architecture Overview

## System Overview

Czech B2B Email Outreach is an automated cold email system targeting Czech companies. It ingests company leads (by ICO or manual entry), enriches them with data from ARES (Czech business registry) and kurzy.cz (director scraping), generates and verifies email addresses, then sends multi-sequence email campaigns with reply detection.

The system runs on four main components: **n8n** (workflow automation engine), **Supabase** (PostgreSQL database + auth), a **React SPA** (operator UI), and two **Docker microservices** (IMAP/SMTP proxies) — all deployed to a Hostinger VPS.

## Architecture Diagram

```
                        +------------------+
                        |   Operator (UI)  |
                        +--------+---------+
                                 |
                         HTTPS (Vite SPA)
                                 |
                        +--------v---------+
                        |   React UI       |
                        |   (outreach-ui)  |
                        +--------+---------+
                                 |
                    +------------+------------+
                    |                         |
           +-------v--------+       +--------v--------+
           |   Supabase     |       |   n8n           |
           |   (DB + Auth)  |       |   (Workflows)   |
           +-------+--------+       +--------+--------+
                   |                          |
                   |            +-------------+-------------+
                   |            |             |             |
              PostgreSQL  +----v----+  +-----v-----+ +----v----+
                          |  SMTP   |  |   IMAP    | | HTTP    |
                          |  Proxy  |  |   Proxy   | | Requests|
                          |  :3002  |  |   :3001   | | (ARES,  |
                          +----+----+  +-----+-----+ | kurzy)  |
                               |             |        +---------+
                          SMTP servers  IMAP servers
                          (outgoing)    (incoming)
```

## Components

### n8n (Workflow Engine)

Self-hosted on Hostinger VPS via Docker. Accessible at the URL configured in `N8N_BASE_URL` (typically port 32770). All workflows are stored as JSON in `n8n-workflows/` and pushed to n8n via helper scripts (`push-*.mjs`, `import.mjs`).

Webhook endpoints use bearer token authentication via `N8N_MCP_BEARER`. The UI calls n8n webhooks to trigger lead ingestion, wave scheduling, and other operations.

### Supabase (Database + Auth)

Hosted Supabase instance providing:
- **PostgreSQL** — 19 tables storing leads, contacts, emails, waves, templates, config
- **Auth** — User authentication with email/password, role-based access (admin vs regular)
- **RLS** — Row-level security policies on tables
- **Realtime** — Subscription channels for live UI updates

The UI connects via `@supabase/supabase-js` using the anon key (frontend) and service role key (backend scripts).

### React UI (outreach-ui/)

Single-page application built with:
- **React 19** + **TypeScript** + **Vite**
- **React Router 7** for client-side routing
- **TanStack React Query** for data fetching and caching
- **Supabase JS** for auth and database access
- **Radix UI** + **TailwindCSS** for styling
- **Tiptap** for rich text email template editing
- **Recharts** for dashboard charts
- **DND Kit** for drag-and-drop template reordering

#### Routes

| Path | Component | Access | Purpose |
|------|-----------|--------|---------|
| `/login` | LoginPage | Public | Authentication |
| `/prehled` | DashboardPage | Protected | Dashboard with stats and charts |
| `/databaze` | DatabasePage | Protected | Master lead database view |
| `/leady` | LeadsPage | Protected | Lead management and enrichment |
| `/leady/:id` | LeadDetailPage | Protected | Individual lead details |
| `/vlny` | WavesPage | Protected | Wave (campaign) management |
| `/vlny/:id` | WaveDetailPage | Protected | Individual wave details |
| `/email-finder` | EmailFinderPage | Protected | Email discovery tool |
| `/retarget` | RetargetPoolPage | Protected | Retarget pool management |
| `/nastaveni` | SettingsPage | Admin | Settings hub |
| `/nastaveni/tymy` | TeamsSettings | Admin | Team management |
| `/nastaveni/obchodnici` | SalesmenSettings | Admin | Salesman management |
| `/nastaveni/uzivatele` | UsersSettings | Admin | User management |
| `/nastaveni/ucty` | OutreachAccountsSettings | Admin | Outreach account config |
| `/nastaveni/api-klice` | ApiKeysSettings | Admin | API key management |
| `/nastaveni/sablony` | TemplateSetEditor | Admin | Email template editor |

#### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useAuth` | Supabase auth, profile, role check |
| `useDashboard` | Stats, graphs, refresh |
| `useForceSend` | Manual wave sending |
| `useLeads` | Lead CRUD, filters, pagination |
| `useMasterLeads` | Master lead DB view |
| `useWaves` | Wave CRUD, status, email sequences |
| `useRealtime` | Supabase realtime subscriptions |
| `useRetargetPool` | Retarget pool logic |
| `useSettings` | Config, credentials, templates |
| `useTags` | Lead tagging system |
| `useUsers` | User management |
| `useMobile` | Responsive breakpoint detection |
| `useMobileNav` | Mobile navigation state |

### IMAP Proxy (imap-proxy/)

Docker microservice on port 3001 (localhost only). Exists because n8n's `emailReadImap` node marks emails as `\Seen` and leaks IMAP connections.

**API:**

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/health` | — | `{ status: "ok" }` |
| POST | `/check-inbox` | `{ credential_name: "..." }` | `{ success, emails: [...] }` |

Uses `imapflow` with `BODY.PEEK[]` to read without marking as seen. Config in `config.json` (gitignored), template in `config.example.json`. Each credential is keyed by slot name (e.g. `"Salesman IMAP 1"`).

### SMTP Proxy (smtp-proxy/)

Docker microservice on port 3002 (localhost only). Exists because n8n's `emailSend` v2.1 doesn't support custom headers for email threading (Message-ID, In-Reply-To, References).

**API:**

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/health` | — | `{ status: "ok" }` |
| POST | `/send-email` | `{ credential_name, from, to, subject, html, replyTo?, messageId?, inReplyTo?, references? }` | `{ success, messageId, response }` |

Uses `nodemailer` with transporter caching (30-min TTL). Config in `config.json` (gitignored), template in `config.example.json`. Each credential is keyed by name (e.g. `"Burner SMTP"`).

## Data Flow

### Lead Pipeline

```
ICO / Manual Entry
       |
       v
[WF1: Lead Ingest] --> leads table (status: new)
       |
       v
[WF2: ARES Lookup] --> enrichment_log, jednatels table
       |                (company data, directors)
       v
[WF3: Kurzy Scrape] --> jednatels table
       |                 (additional director data)
       v
[WF4: Email Gen] --> email_candidates table
       |             (generated email patterns)
       v
[WF5: Seznam Verify] --> email_candidates (seznam check)
       |
       v
[WF6: QEV Verify] --> email_candidates (deliverability check)
       |
       v
Lead status: ready (has verified email)
```

### Email Sending Pipeline

```
Operator creates wave in UI
       |
       v
[WF7: Wave Schedule] --> email_queue table
       |                  (queues emails per sequence)
       v
[WF8: Send Cron] --> smtp-proxy --> SMTP server
  (every 5 min)      sent_emails table
       |              (atomic claim + daily limit check)
       v
[WF9: Reply Detection] --> imap-proxy --> IMAP server
  (every 1 min)            lead_replies table
       |
       v
[WF10: Daily Reset] --> reset send counts at midnight
  (midnight cron)       clean old probe bounces
```

### Supporting Flows

- **WF11 (Website Fallback)** — Scrape company website when other enrichment fails
- **WF12 (ICO Scrape)** — Batch ICO lookup from external sources
- **WF13 (GSheet Proxy)** — Google Sheets integration for lead import
- **wf-email-finder / v2** — Standalone email discovery tool
- **wf-ndr-monitor / spam** — Bounce/NDR detection from INBOX and spam
- **wf-force-send** — Manual send trigger for testing
- **wf-admin-users** — User management webhook
- **backfill-salutations** — Bulk salutation regeneration

## Workflow Reference

| File | n8n ID | Trigger | Purpose |
|------|--------|---------|---------|
| wf1-lead-ingest.json | beB84wDnEG2soY1m | webhook:lead-ingest | Ingest new leads into the system |
| wf2-ares-lookup.json | 2i6zvyAy3j7BjaZE | webhook:wf2-ares | Fetch company data from ARES registry |
| wf3-kurzy-scrape.json | nPbr15LJxGaZUqo7 | webhook:wf3-kurzy | Scrape director info from kurzy.cz |
| wf4-email-gen.json | RNuSFAtwoEAkb9rA | webhook:wf4-email-gen | Generate email address patterns |
| wf5-seznam-verify.json | 7JzGHAG24ra3977B | webhook:wf5-seznam | Verify emails via Seznam |
| wf6-qev-verify.json | EbKgRSRr2Poe34vH | webhook:wf6-qev | Verify email deliverability via QEV |
| wf7-wave-schedule.json | TVNOzjSnaWrmTlqw | webhook:wf7-wave-schedule | Schedule wave emails into queue |
| wf8-send-cron.json | wJLD5sFxddNNxR7p | cron:every-5min | Send queued emails via SMTP proxy |
| wf9-reply-detection.json | AaHXknYh9egPDxcG | cron:every-1min | Detect replies via IMAP proxy |
| wf10-daily-reset.json | 50Odnt5vzIMfSBZE | cron:midnight | Reset daily send limits, clean bounces |
| wf11-website-fallback.json | E5QzxzZe4JbSv5lU | webhook:wf11-website-fallback | Fallback enrichment via company website |
| wf12-ico-scrape.json | LGEe4MTELj5lmOFX | webhook:wf12-ico-scrape | Batch ICO scraping |
| wf13-gsheet-proxy.json | ENcE8iMWLNwIPc5a | webhook:gsheet-proxy | Google Sheets lead import proxy |
| email-verification-subwf.json | Aov5PfwmBDv51L0e | executeWorkflowTrigger | Email verification sub-workflow |
| wf-verify-wave.json | ttKdYcbucijqiaSp | — | Verify all emails in a wave |
| wf-email-finder.json | N3cuyKRHS4wEyOwq | webhook:wf-email-finder | Email discovery tool (v1) |
| wf-email-finder-v2.json | 6sc6c0ZSuglJ548A | webhook:wf-email-finder-v2 | Email discovery tool (v2) |
| wf-ndr-monitor.json | xMPbk9HwSRGjBbdq | IMAP-trigger:INBOX | Monitor INBOX for bounces/NDR |
| wf-ndr-monitor-spam.json | RxeW59ubWwOsDRqx | IMAP-trigger:spam | Monitor spam folder for bounces/NDR |
| sub-smtp-check.json | L6D2HcFYoNorgiom | executeWorkflowTrigger | SMTP check sub-workflow |
| sub-burner-probe.json | 9J5svDvgXBkZtOLX | webhook:sub-burner-probe | Burner email probe |
| sub-reply-check.json | WjbYMqMXDxkjIssL | executeWorkflowTrigger | Reply check sub-workflow |
| wf-backfill-salutations.json | xbJfPwwNRIBtFtAX | webhook:backfill-salutations | Bulk regenerate salutations |
| wf-force-send.json | DPmnV2dRsbBMLAmz | webhook:wf-force-send | Manual email send trigger |
| wf-admin-users.json | JeP8whw3jNtL6VJ1 | webhook:admin-users | User management webhook |

## Database Schema

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `teams` | Organization/team metadata | id, name, salesman_email |
| `outreach_accounts` | Email sending accounts (1 per team, UNIQUE) | id, team_id, credential_name |
| `leads` | Company leads | id, team_id, ico, company_name, status, master_status |
| `enrichment_log` | Enrichment step history per lead | id, lead_id, step, status, data |
| `jednatels` | Company directors/contacts | id, lead_id, full_name, first_name, last_name, salutation |
| `email_candidates` | Generated/verified email addresses | id, jednatel_id, email, verified, source |
| `template_sets` | Email template groups | id, team_id, name |
| `email_templates` | Individual templates with A/B variants | id, set_id, sequence, variant, subject, body |
| `waves` | Outreach campaigns | id, team_id, template_set_id, status, scheduled_at |
| `wave_leads` | Leads assigned to waves | id, wave_id, lead_id, status |
| `email_queue` | Queued emails for sending | id, wave_lead_id, sequence, status, scheduled_at |
| `sent_emails` | Sent email records | id, queue_id, message_id, to, subject, sent_at |
| `lead_replies` | Incoming reply records | id, sent_email_id, lead_id, body, received_at |
| `config` | Runtime key/value config | key, value |
| `salesmen` | Team salesman accounts | id, team_id, name, email |
| `email_verifications` | Email verification cache | id, email, provider, result |
| `email_probe_bounces` | Bounce detection records | id, email, bounce_type, detected_at |
| `profiles` | User profiles (linked to Supabase auth) | id, email, role, display_name |
| `processed_reply_emails` | Reply deduplication | id, message_id, processed_at |

### Key Relationships

- `leads` belongs to `teams` (via team_id)
- `outreach_accounts` belongs to `teams` (UNIQUE constraint: 1 per team)
- `jednatels` belongs to `leads` (via lead_id)
- `email_candidates` belongs to `jednatels` (via jednatel_id)
- `waves` belongs to `teams` and references `template_sets`
- `wave_leads` links `waves` to `leads`
- `email_queue` references `wave_leads`
- `sent_emails` references `email_queue`
- `lead_replies` references `sent_emails` and `leads`
- `salesmen` belongs to `teams`

### Database Functions

| Function | Purpose |
|----------|---------|
| `ingest_lead()` | Process and insert a new lead |
| `reset_daily_sends()` | Reset all daily send counters (called at midnight) |
| `claim_queued_emails()` | Atomically claim batch of queued emails for sending |
| `increment_and_check_sends()` | Atomic daily send limit check and increment |
| `get_dashboard_stats()` | Aggregate dashboard metrics |
| `get_jednatels_for_lead()` | Get all contacts for a given lead |
| `check_email_cache()` | Look up email verification cache |
| `mark_jednatels_email_status()` | Update email verification status on contacts |
| `check_max_salesmen()` | Enforce salesman count limits |
| `parse_full_name()` | Split full_name into first_name and last_name |
| `generate_salutation()` | Generate Czech vocative greeting (gendered) |
| `backfill_salutations()` | Bulk regenerate salutations for all contacts |
| `check_and_mark_reply_processed()` | Deduplicate reply processing |
| `auto_complete_waves()` | Mark waves as done when all emails sent |
| `reorder_template_sequences()` | Reorder template sequence numbers |
| `handle_lead_reply()` | Trigger function for reply processing |

### Database Triggers

| Trigger | Table | Event | Behavior |
|---------|-------|-------|----------|
| `trg_auto_salutation` | `jednatels` | INSERT/UPDATE | Parses `full_name` into first/last name, generates Czech vocative `salutation` with gendered prefix ("Vazeny pane" / "Vazena pani") |
| `trg_refresh_salutations_on_wave_add` | `wave_leads` | AFTER INSERT | Touches `jednatels.updated_at` to refresh salutations for leads added to a wave |

### Vocative Salutation Rules

The system generates formal Czech greetings in the vocative case. Rules applied in order:
1. Adjective-type surnames → unchanged
2. `-ek` → `-ku`, `-ec` → `-ce`, `-el` → `-le`
3. `-a` → `-o`
4. Digraphs (th/ph/gh) → append `-e`
5. `-k/-h/-g` → append `-u`
6. Soft consonants → append `-i`
7. Other consonants (incl. w/x/q) → append `-e`

## Security Model

- **Webhook auth**: n8n webhooks authenticated via bearer token (`N8N_MCP_BEARER`)
- **UI auth**: Supabase Auth with email/password, admin role check on protected routes
- **RLS**: Row-level security on Supabase tables
- **Proxies**: IMAP and SMTP proxies bind to localhost only (127.0.0.1), not reachable from outside the VPS Docker network
- **No hardcoded secrets**: All secrets in `.env.local` or Supabase `config` table (e.g. QEV API keys, Seznam from-email)
- **No n8n attribution**: Hard rule — all outgoing emails must not contain any n8n branding

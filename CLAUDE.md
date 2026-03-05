# Czech B2B Email Outreach System — Project Context

> **Workflow:** This project uses a branch-based GitHub-first workflow with multi-agent coordination. See the hub `CLAUDE.md` (parent directory) for the full protocol: create feature branch → work → PR → auto-merge. Always check `.claude/active-work.md` before starting.

> **Setup:** Clone this repo, copy `.env.example` to `.env.local` and fill in secrets. Run `npm install` in `outreach-ui/`. Open Claude Code from the repo root.

## What this project is
An automated Czech B2B cold email outreach system built on n8n + Supabase. It enriches company leads (ARES IČO lookup, kurzy.cz jednatel scraping, email generation, bounce/QEV verification), then runs email waves via SMTP with reply detection.

## HARD RULE — No n8n Attribution in Any Output
**ALL outgoing content (emails, Telegram messages, webhooks, etc.) MUST NOT contain any n8n attribution.**
- Never include "Sent via n8n", "Powered by n8n", or any n8n branding
- Every `emailSend` node MUST have `options.appendAttribution: false`
- emailSend v2.1 does NOT set X-Mailer header (nodemailer v6+ removed it)
- emailSend v2.1 does NOT support custom headers at all
- Review every new workflow that sends email/messages and confirm no attribution leaks

## Infrastructure
- **n8n**: self-hosted on Hostinger VPS (URL in `.env.local` → `N8N_BASE_URL`)
- **n8n API key**: `.env.local` → `N8N_API_KEY`
- **Supabase project**: ref in `.env.local` → `SUPABASE_PROJECT_REF` (URL/keys also there)
- **Hostinger API token**: `.env.local` → `HOSTINGER_API_TOKEN`
- **Workflow files**: `n8n-workflows/` (relative to repo root)
- **UI**: `outreach-ui/` — React + Vite, `npm run dev` for local, `npm run build` + `node deploy-ssh2.mjs` to deploy
- **IMAP proxy**: `imap-proxy/` — Docker microservice on VPS port 3001 (127.0.0.1 only), reached by n8n via `http://imap-proxy:3001`
- **SMTP proxy**: `smtp-proxy/` — Docker microservice on VPS port 3002 (127.0.0.1 only), reached by n8n via `http://smtp-proxy:3002`
- Both proxies: config in `config.json` (gitignored), see `config.example.json` for template. Deploy via `node deploy.mjs`

## n8n Workflow IDs (all active)
| File / Name | n8n ID | Trigger |
|---|---|---|
| wf1-lead-ingest.json | beB84wDnEG2soY1m | webhook:lead-ingest |
| wf2-ares-lookup.json | 2i6zvyAy3j7BjaZE | webhook:wf2-ares |
| wf3-kurzy-scrape.json | nPbr15LJxGaZUqo7 | webhook:wf3-kurzy |
| wf4-email-gen.json | RNuSFAtwoEAkb9rA | webhook:wf4-email-gen |
| wf5-seznam-verify.json | 7JzGHAG24ra3977B | webhook:wf5-seznam |
| wf6-qev-verify.json | EbKgRSRr2Poe34vH | webhook:wf6-qev |
| wf7-wave-schedule.json | TVNOzjSnaWrmTlqw | webhook:wf7-wave-schedule |
| wf8-send-cron.json | wJLD5sFxddNNxR7p | cron:every-5min |
| wf9-reply-detection.json | AaHXknYh9egPDxcG | cron:every-1min |
| wf10-daily-reset.json | 50Odnt5vzIMfSBZE | cron:midnight |
| wf11-website-fallback | E5QzxzZe4JbSv5lU | webhook:wf11-website-fallback |
| email-verification sub-wf | Aov5PfwmBDv51L0e | executeWorkflowTrigger |
| wf-verify-wave | ttKdYcbucijqiaSp | — |
| wf-email-finder | N3cuyKRHS4wEyOwq | webhook:wf-email-finder |
| wf-email-finder-v2 | 6sc6c0ZSuglJ548A | webhook:wf-email-finder-v2 |
| wf-ndr-monitor | xMPbk9HwSRGjBbdq | IMAP-trigger:INBOX |
| wf-ndr-monitor-spam | RxeW59ubWwOsDRqx | IMAP-trigger:spam |
| sub-smtp-check | L6D2HcFYoNorgiom | executeWorkflowTrigger |
| sub-burner-probe | 9J5svDvgXBkZtOLX | webhook:sub-burner-probe |
| sub-reply-check | WjbYMqMXDxkjIssL | executeWorkflowTrigger |
| backfill-salutations | xbJfPwwNRIBtFtAX | webhook:backfill-salutations |
| wf-force-send | DPmnV2dRsbBMLAmz | webhook:wf-force-send |

## Database schema (Supabase)
19 tables: `teams`, `outreach_accounts` (1 per team, UNIQUE(team_id)), `leads`, `enrichment_log`, `jednatels`, `email_candidates`, `template_sets`, `email_templates`, `waves`, `wave_leads`, `email_queue`, `sent_emails`, `lead_replies`, `config`, `salesmen`, `email_verifications`, `email_probe_bounces`, `profiles`, `processed_reply_emails`

`config` table (key/value) for runtime secrets — `seznam_from_email`, `qev_api_key_1/2/3` (3 rotating QEV keys).

DB functions: `reset_daily_sends()`, `handle_lead_reply()` trigger, `get_dashboard_stats()`, `claim_queued_emails()`, `ingest_lead()`, `get_jednatels_for_lead()`, `check_email_cache()`, `mark_jednatels_email_status()`, `check_max_salesmen()`, `increment_and_check_sends()`, `parse_full_name()`, `generate_salutation()`, `backfill_salutations()`, `check_and_mark_reply_processed()`, `auto_complete_waves()`, `reorder_template_sequences()`.

DB trigger: `trg_auto_salutation` on `jednatels` — ALWAYS re-derives `first_name`/`last_name` from `full_name` and regenerates `salutation` (Czech vocative) on INSERT/UPDATE. `full_name` is the source of truth. All male names inflected (no foreign-name exemption).

## Vocative salutation system
- `jednatels.salutation` stores vocative address only (e.g. `pane Nováku`, `paní Nováková`), NOT the greeting prefix
- Templates use `Dobrý den {{salutation}},` — the "Dobrý den" is in the template, not in salutation
- DB trigger auto-generates on INSERT/UPDATE: parses full_name → first/last, generates vocative
- Vocative rules (in order): adjective-type→unchanged, -ek→-ku, -ec→-če, -el→-le, -a→-o, digraphs th/ph/gh→+e, -k/h/g→+u, soft consonants→+i, other consonants (incl. w/x/q)→+e

## Current workflow state
- **No `$env.*` variables in n8n** — Supabase URL/key are hardcoded in workflow JSON, n8n webhook URLs are hardcoded. This is intentional (workflows run on VPS)
- **Email sending**: SMTP via smtp-proxy (nodemailer), supports proper threading headers (Message-ID, In-Reply-To, References)
- **1 outreach account per team** (UNIQUE constraint)
- **Threading**: smtp-proxy uses nodemailer's dedicated `messageId`, `inReplyTo`, `references` mail options (NOT headers object)
- **Reply-To**: set to `salesman_email` from `teams` table
- **WF5** fetches `seznam_from_email` from `config` table at runtime
- **WF6** fetches `qev_api_key` from `config` table at runtime (3 rotating keys)
- **WF8** uses atomic `claim_queued_emails()` RPC + `increment_and_check_sends()` for daily limits
- **WF8** calls `auto_complete_waves()` on loop done
- **WF10** calls `reset_daily_sends()` RPC at midnight + deletes old `email_probe_bounces`

## IMAP Proxy (`imap-proxy/`)
- **Why**: n8n emailReadImap marks emails `\Seen` despite workarounds + leaks IMAP connections
- `POST /check-inbox { "credential_name": "Salesman IMAP 1" }` → `{ success, emails: [...] }`
- Config: `config.json` (IMAP creds keyed by slot name)
- **Adding new salesman**: add entry to `config.json` on VPS → `docker restart imap-proxy` → update DB

## SMTP Proxy (`smtp-proxy/`)
- **Why**: n8n emailSend/betterEmailSend can't set threading headers (nodemailer overwrites protected headers)
- `POST /send-email { credential_name, from, to, subject, html, replyTo, messageId, inReplyTo, references }` → `{ success, messageId, response }`
- Config: `config.json` (SMTP creds keyed by credential name)

## n8n Critical Notes
- **Code node**: `fetch` AND `require('https')` are BOTH disallowed — use HTTP Request nodes for external calls
- **Code node `runOnceForEachItem`**: return `{ json: {...} }` NOT `[{ json: {...} }]` — array form causes validation error
- **HTTP Request**: `fullResponse:true` + empty body → 0 items output (kills chain). Avoid `fullResponse:true` unless you need status codes
- **Webhook nodes**: MUST have `webhookId` field matching path for production registration
- **Body spec bug**: `specifyBody:"json"` with array expression → fails. Fix: `contentType:"raw"` + `rawContentType:"application/json"` + `body:"={{ JSON.stringify(...) }}"`
- **Node refs**: `$json` = immediately upstream. Use `$('NodeName').first().json.field` for earlier nodes
- **Updating active workflow**: deactivate → PUT → activate
- **SplitInBatches**: v3 goes directly to "done" without processing; use v1 with `options.reset:true`
- **IMAP trigger** (`n8n-nodes-base.emailTrigger`): NOT available — use Schedule + emailReadImap instead
- **emailSend v2.1**: does NOT support custom headers. For threading, use smtp-proxy

## ARES API notes
- BE endpoint (`ekonomicke-subjekty-v-be`) omits `statutarniOrgan` when `primarniZdroj:"ros"` — always call VR endpoint too and merge jednatels from both

## Helper scripts (in n8n-workflows/)
All scripts read secrets from `../env.mjs` (which reads `.env.local`). No hardcoded secrets.
- `import.mjs` — import all workflows (POST, strips pinData/active)
- `update.mjs` — update WF7/WF8/WF10 (PUT)
- `list-wf2.mjs` — list all n8n workflows with IDs
- `organize.mjs` — apply tags to workflows for grouping
- `push-*.mjs` — push specific workflow sets
- `migrate-*.mjs` — database migrations (all already run, don't re-run)
- `db-setup.mjs` — created the database schema (already run)
- `seed.mjs` — seed initial data
- `create-admin.mjs` — create admin user
- `setup-all.mjs` — combined setup script
- `deploy-ui.mjs` — deploy UI to VPS

---

# n8n Automation Builder Rules

## PHASE 0: UNDERSTAND BEFORE YOU BUILD

- **Never start building immediately.** Before writing any code or creating any workflow, ask clarifying follow-up questions until you fully understand:
  - What triggers the automation (event, schedule, webhook call)?
  - What the expected input and output look like (give examples)?
  - What external services are involved?
  - What should happen on errors or edge cases?
  - Are there rate limits, quotas, or timing constraints to respect?
- Summarize your understanding back to the user and get explicit confirmation before proceeding.

## PHASE 1: RESEARCH BEFORE IMPLEMENTATION

- **Always consult n8n documentation first.** Before building anything, look up:
  - The latest node documentation for every service involved (nodes may have changed).
  - Available trigger nodes vs. polling approaches.
  - Authentication methods for each integration.
  - Known limitations or quirks of relevant nodes.
- If you are unsure about a node's behavior, check the docs — do not guess.

## PHASE 2: DESIGN PRINCIPLES

### 2.1 Simplicity First
- Always aim for the **simplest possible logic**. Fewer nodes, fewer branches, fewer things to break.
- If a workflow can be done in 5 nodes instead of 12, use 5.
- Prefer declarative node configurations over code nodes when possible.

### 2.2 Use Native Nodes Over HTTP Requests
- **Always prefer n8n's built-in service nodes** over generic HTTP Request nodes.
- Only fall back to HTTP Request nodes when no native node exists for the service.

### 2.3 Multi-Workflow Architecture (But Don't Over-Split)
- Use **Execute Workflow** node to call subworkflows. Pass data via input parameters.
- A subworkflow should only exist if it's reused, self-contained, or reduces complexity.
- If a sequence of 3–5 nodes only runs in one place, keep it inline.

### 2.4 API-First Design (Webhook Nodes)
- Every automation must be **triggerable via API** using Webhook nodes unless there's a specific reason not to.
- Webhook nodes must use production URL path, return structured JSON, use appropriate HTTP methods.

## PHASE 3: BUILD PRODUCTION-READY FROM THE START

### 3.1 Credentials
- Always wire in correct credentials during node creation.

### 3.2 Variable Mapping
- Map all variables and expressions as you build — no hardcoded test values or `TODO` placeholders.
- Use expressions (`{{ $json.fieldName }}`) to dynamically reference upstream data.

### 3.3 Error Handling
- Add retry on fail for nodes calling external APIs.
- For critical operations, add explicit error branches.

### 3.4 Input Validation
- Validate incoming payload at the start of webhook-triggered workflows.

### 3.5 Naming Conventions
- Every node must have a clear, descriptive name. Never leave default names.

### 3.6 Documentation Inside Workflows
- Add Sticky Note nodes at the top of every workflow explaining what it does, expected I/O, dependencies.

## PHASE 4: TESTING
- Test the automation before declaring it done. Verify every node executes. Test at least one error case.

## PHASE 5: MEMORY & CHANGE TRACKING
- Update CLAUDE.md after every major change.

## PHASE 6: DELIVERY & HANDOFF
- Export workflow JSON, provide summary, list manual steps.

## ADDITIONAL RULES
- **Idempotency**: Use upserts instead of inserts when possible.
- **Rate Limiting**: Add Wait/SplitInBatches for large datasets.
- **No Hardcoded Secrets**: Use n8n credentials or the Supabase `config` table.
- **Timeout Handling**: Set reasonable timeout values (30s default).
- **No Over-Engineering**: Don't build "just in case" features.

---

## RULE: Known Issues System

Known-issues log directory: `n8n-workflows/known-issues/`
One file per service/topic (e.g., `webhook.md`, `code-node.md`, `supabase.md`).

### Before Building Anything
- Read relevant known-issues log files before writing a single node.

### When You Encounter an Error
1. **CHECK** — Look up the relevant `known-issues/{service}.md` file.
2. **MATCH FOUND** — Apply the documented solution immediately.
3. **NO MATCH** — Fix, test, then append to the log file.

### Log Entry Format
```markdown
## [Short Description]
- **Date:** YYYY-MM-DD
- **Node/Service:** [node name]
- **Error:** [exact error message]
- **Root Cause:** [1 sentence]
- **Solution:** [exact fix]
---
```

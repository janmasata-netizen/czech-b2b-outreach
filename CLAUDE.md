# Czech B2B Email Outreach System — Project Context

> **Workflow:** Branch-based GitHub-first workflow with multi-agent coordination. Run `/preflight` before starting work. Always check `.claude/active-work.md` before starting.

> **Setup:** Clone this repo, copy `.env.example` to `.env.local` and fill in secrets. Run `npm install` in `outreach-ui/`. Run `git config core.hooksPath .githooks`. Open Claude Code from the repo root.

> **Git hooks:** Post-checkout warns about dirty files carried across branches; pre-commit blocks code on main (only `active-work.md` allowed); pre-push verifies build on feature branches.

## Branch-Based Workflow

1. `git pull origin main` to get latest
2. Run `/preflight` to verify clean state
3. Read `.claude/active-work.md` — check for **exact file path conflicts**. If ANY file you plan to touch appears in another agent's row, STOP.
4. Create feature branch: `git checkout -b claude/[short-description]`
5. **Register immediately (NON-NEGOTIABLE):** First, commit any WIP on your branch. Then: `git checkout main && git pull` → add your row to `.claude/active-work.md` with **exact file paths** → `git add .claude/active-work.md && git commit -m "Register claude/[branch]" && git push origin main` → `git checkout claude/[short-description]`
6. Do the work
7. Commit and push: `git push -u origin claude/[short-description]`
8. Create PR: `gh pr create --title "[short description]" --body "..."`
9. **Merge + cleanup (ATOMIC):** `gh pr merge --merge --delete-branch && git checkout main && git pull` → remove your row from `active-work.md` → commit → push

### HARD RULES

**Violations cause lost work.** Git hooks block the worst violations automatically. Run `/preflight` if unsure.

1. **Registration is non-negotiable.** Register before any code work.
2. **List exact file paths** in `active-work.md` (e.g. `outreach-ui/src/lib/supabase.ts`).
3. **File-level conflict check.** Grep `active-work.md` for every file you plan to touch.
4. **Never work directly on main.** Only `active-work.md` metadata commits.
5. **Never use `git stash`. Never switch branches with uncommitted changes.** Commit WIP to your feature branch first.
6. **Cleanup is atomic with merge.** Remove your row immediately after `gh pr merge`.
7. **Always use `--delete-branch`** with `gh pr merge`.
8. **Abandoned work:** Entries >24h old with no recent commits can be removed by any agent.
9. **Never switch branches with a dirty tree.** Before ANY `git checkout`, run `git status`. If dirty, commit WIP first. The post-checkout hook will catch violations.

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

## n8n Workflow IDs (all active unless noted)
| File / Name | n8n ID | Trigger |
|---|---|---|
| wf1-lead-ingest.json | beB84wDnEG2soY1m | webhook:lead-ingest |
| wf2-ares-lookup.json | 2i6zvyAy3j7BjaZE | webhook:wf2-ares |
| wf3-kurzy-scrape.json | nPbr15LJxGaZUqo7 | webhook:wf3-kurzy |
| wf4-email-gen.json | RNuSFAtwoEAkb9rA | webhook:wf4-email-gen |
| wf5-seznam-verify.json (SMTP Verification) | 7JzGHAG24ra3977B | webhook:wf5-seznam |
| wf6-qev-verify.json (**DEACTIVATED**) | EbKgRSRr2Poe34vH | webhook:wf6-qev |
| wf7-wave-schedule.json | TVNOzjSnaWrmTlqw | webhook:wf7-wave-schedule |
| wf8-send-cron.json | wJLD5sFxddNNxR7p | cron:every-1min |
| wf9-reply-detection.json | AaHXknYh9egPDxcG | cron:every-1min |
| wf10-daily-reset.json | 50Odnt5vzIMfSBZE | cron:midnight |
| wf11-website-fallback (Website Email Scraper) | E5QzxzZe4JbSv5lU | webhook:wf11-website-fallback |
| wf12-ico-scrape.json | LGEe4MTELj5lmOFX | webhook:wf12-ico-scrape |
| wf13-gsheet-proxy.json | ENcE8iMWLNwIPc5a | webhook:gsheet-proxy |
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
| wf-admin-users | JeP8whw3jNtL6VJ1 | webhook:admin-users |
| wf-email-finder-v3 | KRWLgqTf5ILqSNpk | webhook:wf-email-finder-v3 |
| sub-clean-domain | 9H3NH7YbR1X2Efgm | executeWorkflowTrigger |
| sub-domain-discovery | KdaIVaNnqj8eDx8D | executeWorkflowTrigger |
| wf-domain-discovery-test | RtnhuFUdeyXfUxDC | webhook:wf-domain-discovery-test |
| test-reply-detection | q4vUTl37yIJoTeDO | webhook:test-reply-detection |

## Database schema (Supabase)
24 tables: `teams`, **`companies`** (master CRM), `leads` (email outreach, has `company_id` FK → companies), `enrichment_log`, `jednatels` (deprecated — kept for backward compat), **`contacts`** (replaces jednatels, has `company_id` FK → companies), `email_candidates` (has both `jednatel_id` and `contact_id`), `template_sets`, `email_templates`, `waves`, `wave_leads`, `email_queue`, `sent_emails`, `lead_replies`, `config`, `salesmen`, `email_verifications`, `email_probe_bounces`, `profiles`, `processed_reply_emails`, `unmatched_replies`, `lead_tags`, **`company_tags`** (company_id, tag_id), `tags`, **`wave_presets`** (reusable wave configs: template_set_id, from_email, salesman_id)

**Two-layer architecture:**
- **`companies`** = Master CRM (all firms, any channel). Shown at `/databaze`. Columns: id, company_name, ico, website, domain, master_status, team_id, created_at, updated_at. Unique indexes on ico (WHERE NOT NULL) and domain (WHERE NOT NULL).
- **`leads`** = Email outreach layer, linked to companies via `company_id`. Shown at `/leady`.
- **`contacts`** = Contact people linked to companies (replaces jednatels). Columns: id, company_id, full_name, first_name, last_name, salutation, role, phone, linkedin, other_contact, **notes** (free text for "jednatel", "employee", etc.), created_at, updated_at. Same UUIDs as jednatels for backward compat.

`config` table (key/value) for runtime secrets — `seznam_from_email`. QEV keys (`qev_api_key_1/2/3`) are deprecated — WF6 is deactivated.

DB functions: `reset_daily_sends()` (resets `teams.sends_today`), `handle_lead_reply()` trigger, `get_dashboard_stats()`, `claim_queued_emails()`, `ingest_lead()` (now creates/finds company first, then lead), `get_jednatels_for_lead()` (wrapper — reads from contacts via leads.company_id), **`get_contacts_for_lead()`**, **`get_contacts_for_company()`**, `check_email_cache()`, `mark_jednatels_email_status()`, **`mark_contacts_email_status()`**, `check_max_salesmen()`, `increment_and_check_sends(p_team_id)` (increments `teams.sends_today`), `parse_full_name()`, `generate_salutation()`, `backfill_salutations()` (now iterates contacts + jednatels), `check_and_mark_reply_processed()`, `auto_complete_waves()`, `reorder_template_sequences()`.

DB trigger: `trg_auto_salutation` on `jednatels` AND `contacts` — ALWAYS re-derives `first_name`/`last_name` from `full_name` and regenerates `salutation` (Czech vocative) on INSERT/UPDATE. `full_name` is the source of truth. All male names inflected (no foreign-name exemption).

DB trigger: `trg_refresh_salutations_on_wave_add` on `wave_leads` — AFTER INSERT, touches `contacts.updated_at` (via leads.company_id) AND `jednatels.updated_at` for all contacts/jednatels of the added lead, which fires `trg_auto_salutation` to ensure salutations are fresh when leads are assigned to a wave.

## Vocative salutation system
- `jednatels.salutation` stores full formal greeting with gendered prefix: `Vážený pane Nováku` (male) / `Vážená paní Nováková` (female)
- Templates use `{{salutation}},` directly — no greeting prefix in the template
- DB trigger auto-generates on INSERT/UPDATE: parses full_name → first/last, generates vocative with Vážený/á prefix
- Vocative rules (in order): adjective-type→unchanged, -ek→-ku, -ec→-če, -el→-le, -a→-o, digraphs th/ph/gh→+e, -k/h/g→+u, soft consonants→+i, other consonants (incl. w/x/q)→+e

## Current workflow state
- **No `$env.*` variables in n8n** — Supabase URL/key are hardcoded in workflow JSON, n8n webhook URLs are hardcoded. This is intentional (workflows run on VPS)
- **Email sending**: SMTP via smtp-proxy (nodemailer), supports proper threading headers (Message-ID, In-Reply-To, References)
- **FROM email is set per wave** (free text `waves.from_email`, not outreach_accounts)
- **Daily send limits tracked on teams** (`teams.daily_send_limit`, `teams.sends_today`)
- **Threading**: smtp-proxy uses nodemailer's dedicated `messageId`, `inReplyTo`, `references` mail options (NOT headers object)
- **Reply-To**: set to `salesman_email` from `teams` table
- **WF5** fetches `seznam_from_email` from `config` table at runtime. SMTP-only verification (no QEV). Sets `seznam_status='verified'` + `is_verified=true` for SMTP-verified emails (previously `'likely_valid'`). Always triggers WF11 after verification. Does NOT set final lead status (WF11 does).
- **WF6** is **DEACTIVATED** — QEV verification removed. SMTP verification in WF5 produces same results. QEV had a `safe_to_send: "true"` string-vs-boolean bug.
- **WF11** always runs (triggered by WF5). Scrapes website for additional emails (Fetch nodes use `neverError:true` WITHOUT `fullResponse:true` to avoid 0-items bug). Sets final lead status based on ALL email_candidates (from both WF5 SMTP and WF11 scraping): `ready` > `staff_email` > `info_email` > `failed`. Recognizes both `seznam_status='verified'` and legacy `'likely_valid'`.
- **Domain Discovery Pipeline**: Leads without website/domain now go through multi-source discovery instead of failing. Sources (in order): (1) ARES BE `www` field in WF2, (2) Kurzy.cz HTML website links in WF3 (matches WWW table row, not class="lnk"), (3) sub-domain-discovery subworkflow in WF4 (ARES BE → DNS probe .cz/.com → DuckDuckGo). Firmy.cz removed from sub-domain-discovery (migrated to SPA). WF2 no longer fails leads without ICO+domain — forwards them to WF4 for discovery.
- **sub-domain-discovery**: Execute Workflow sub-wf. Input: `{ lead_id, company_id, company_name, ico }`. Output: `{ found, domain, source }`. Called from WF4 when lead has no domain, and from Email Finder V3 as fallback. n8n ID: `KdaIVaNnqj8eDx8D`. Sources (in order): ARES BE → DNS probe (.cz/.com) → DuckDuckGo.
- **Email Finder V3**: Now calls sub-domain-discovery as fallback when ARES+Kurzy fail to find a domain (instead of returning error). Kurzy URL fixed to `rejstrik-firem.kurzy.cz`.
- **Drip mode**: `waves.daily_lead_count` (integer, nullable). NULL = all leads on day 1. Positive integer = spread seq1 across multiple days (e.g., 50/day). WF7 computes `dayOffset = floor(leadIdx / leadsPerDay)` per lead; each lead's seq2/seq3 dates are relative to their own seq1 date. `delay_seq1_to_seq2_days` / `delay_seq2_to_seq3_days` columns now used by WF7 for inter-sequence gaps. WF8 unchanged.
- **WF8** uses atomic `claim_queued_emails()` RPC + `increment_and_check_sends(p_team_id)` for daily limits (on teams table)
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

## HARD RULE — Keep Documentation Updated

After ANY change to code, workflows, config, DB schema, or UI:
- Update the affected file(s) in `docs/` to reflect the change
- If unsure which doc to update, update all three via `/generate-docs`
- Docs must be committed alongside the code changes, not separately
- The three doc files: `docs/architecture.md`, `docs/setup-guide.md`, `docs/operations-manual.md`

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

## HARD RULE — Response Summary Footer

At the end of every response, include a brief summary with exactly 3 parts:
- **Context:** 1–2 sentences on what we were working on (the goal/task).
- **Done:** 1–2 sentences on what you actually did in this response.
- **Status:** 1–2 sentences on the current status (completed, in progress, blocked, next steps).

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

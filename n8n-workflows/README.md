# n8n Workflows — Czech B2B Email Outreach System

## Overview

Automated Czech B2B cold email outreach system. Enriches company leads (ARES ICO lookup, kurzy.cz jednatel scraping, email generation, bounce/QEV verification), then runs email waves via SMTP with reply detection and threading.

**Infrastructure:**
- n8n: `http://72.62.53.244:32770` (self-hosted on Hostinger VPS)
- Supabase: `https://cycapkswtucbucyegdsn.supabase.co`
- UI: `http://72.62.53.244:32772`

---

## Prerequisites

### Community Node (REQUIRED)

WF8 and wf-force-send depend on **`n8n-nodes-better-send-mail`** (installed via n8n UI → Settings → Community Nodes). This provides `betterEmailSend` v2 with custom header support for email threading (Message-ID, In-Reply-To, References). If this node is uninstalled or n8n is reinstalled, both workflows will fail with "Unrecognized node type".

### No Environment Variables

This system does **not** use `$env.*` variables. All configuration is either:
- **Hardcoded** in workflow nodes (Supabase URL + service_role key)
- **Runtime secrets** in the Supabase `config` table (`seznam_from_email`, `qev_api_key_1/2/3`)

---

## Credentials (n8n)

| Name | Type | Used By |
|------|------|---------|
| `vyhry-temu@seznam.cz` | SMTP + IMAP | WF5 (Seznam bounce test) |
| `Burner SMTP` | SMTP | WF8 (outreach sending) |
| `salesman (jaromir.masata@meisat.com)` | IMAP | sub-reply-check (WF9 reply detection) |
| SMTP credential (id: `3X8mKDvlcXsGRmZS`) | SMTP | wf-email-finder-v2 (catch-all probe) |

---

## Workflows

### Core Pipeline (WF1–WF10)

| WF | ID | Trigger | Purpose |
|----|----|---------|---------|
| WF1 | `beB84wDnEG2soY1m` | `POST /webhook/lead-ingest` | Ingest lead, trigger WF2 |
| WF2 | `2i6zvyAy3j7BjaZE` | `POST /webhook/wf2-ares` | ARES ICO lookup (BE + VR endpoints), insert ARES jednatels |
| WF3 | `nPbr15LJxGaZUqo7` | `POST /webhook/wf3-kurzy` | Scrape jednatels from kurzy.cz |
| WF4 | `RNuSFAtwoEAkb9rA` | `POST /webhook/wf4-email-gen` | Generate email combinations per jednatel |
| WF5 | `7JzGHAG24ra3977B` | `POST /webhook/wf5-seznam` | Seznam SMTP bounce test verification |
| WF6 | `EbKgRSRr2Poe34vH` | `POST /webhook/wf6-qev` | QuickEmailVerification API (3 rotating keys) |
| WF7 | `TVNOzjSnaWrmTlqw` | `POST /webhook/wf7-wave-schedule` | Build email_queue for wave, per-sequence scheduling |
| WF8 | `wJLD5sFxddNNxR7p` | Cron `*/5 * * * *` | Send due emails via `betterEmailSend`, atomic daily limit, threading headers |
| WF9 | `AaHXknYh9egPDxcG` | Cron `*/5 * * * *` | Check salesman inbox for replies, cancel queue, mark replied |
| WF10 | `50Odnt5vzIMfSBZE` | Cron `0 0 * * *` | Reset `sends_today`, cleanup NDR bounces (24h TTL) |

### Supporting Workflows

| Workflow | ID | Trigger | Purpose |
|----------|----|---------|---------|
| WF11 | `E5QzxzZe4JbSv5lU` | `POST /webhook/wf11-website-fallback` | Website fallback enrichment |
| email-verification | `Aov5PfwmBDv51L0e` | Execute Workflow | Sub-workflow for email verification (separate from WF5) |
| wf-verify-wave | `ttKdYcbucijqiaSp` | Webhook | Wave verification |
| wf-email-finder | `N3cuyKRHS4wEyOwq` | `POST /webhook/wf-email-finder` | On-demand email finder (no DB writes) |
| wf-email-finder-v2 | `6sc6c0ZSuglJ548A` | `POST /webhook/wf-email-finder-v2` | Email finder with catch-all probe |
| wf-ndr-monitor | `xMPbk9HwSRGjBbdq` | IMAP trigger (INBOX) | NDR bounce detection → `email_probe_bounces` |
| wf-ndr-monitor-spam | `RxeW59ubWwOsDRqx` | IMAP trigger (spam) | NDR bounce detection in spam folder |
| sub-smtp-check | `L6D2HcFYoNorgiom` | Execute Workflow | SMTP MX check (called by email-finder-v2) |
| sub-burner-probe | `9J5svDvgXBkZtOLX` | `POST /webhook/sub-burner-probe` | Burner email probe (HTTP 300s timeout) |
| sub-reply-check | `WjbYMqMXDxkjIssL` | Execute Workflow | Per-salesman reply check (called by WF9) |
| backfill-salutations | `xbJfPwwNRIBtFtAX` | `POST /webhook/backfill-salutations` | On-demand vocative backfill |
| wf-force-send | `DPmnV2dRsbBMLAmz` | `POST /webhook/wf-force-send` | Force-send next pending sequence immediately |

---

## Database

### Key Tables (18 total)

`teams`, `outreach_accounts`, `leads`, `enrichment_log`, `jednatels`, `email_candidates`, `template_sets`, `email_templates`, `waves`, `wave_leads`, `email_queue`, `sent_emails`, `lead_replies`, `config`, `salesmen`, `email_verifications`, `email_probe_bounces`, `profiles`

### Key RPC Functions

| Function | Used By |
|----------|---------|
| `reset_daily_sends()` | WF10 — resets `outreach_accounts.sends_today = 0` |
| `claim_queued_emails()` | WF8 — atomic claim (prevents duplicate send race) |
| `increment_and_check_sends()` | WF8 — atomic daily limit check |
| `handle_lead_reply()` | Trigger on `lead_replies` INSERT — cancels queue + marks replied |
| `ingest_lead()` | WF1 — lead insertion with dedup |
| `get_jednatels_for_lead()` | WF4 — fetch jednatels by lead |
| `check_email_cache()` | Email verification — 7-day TTL cache |
| `mark_jednatels_email_status()` | WF5/WF6 — update verification status |
| `parse_full_name()` | Vocative system — extract first/last from full_name |
| `generate_salutation()` | Vocative system — Czech vocative inflection |
| `backfill_salutations()` | Backfill workflow — batch re-derive salutations |
| `get_dashboard_stats()` | UI dashboard — server-side aggregation |
| `reorder_template_sequences()` | Template editor — safe sequence reorder |

### Key Trigger

`trg_auto_salutation` on `jednatels` — always re-derives `first_name`/`last_name` from `full_name` and regenerates `salutation` (Czech vocative) on INSERT/UPDATE. `full_name` is the source of truth.

---

## Email Sending

- **SMTP via `n8n-nodes-better-send-mail.betterEmailSend` v2** (community node)
- NOT Gmail API — all references to Gmail OAuth2 are obsolete
- `appendAttribution: false` on all send nodes (no n8n branding in emails)
- Threading: WF8 sets Message-ID, In-Reply-To, References via `customHeadersUi`
- `thread_subject` column stores seq 1's subject — seq 2/3 use `Re: {thread_subject}`
- 1 outreach account per team (UNIQUE constraint on `outreach_accounts.team_id`)
- Reply-To set to `salesman_email` from `teams` table

---

## Config Table (Supabase)

Runtime secrets stored in the `config` table (key/value):

| Key | Purpose |
|-----|---------|
| `seznam_from_email` | Seznam.cz address for WF5 bounce testing |
| `qev_api_key_1` | QuickEmailVerification API key (rotated randomly) |
| `qev_api_key_2` | QuickEmailVerification API key (rotated randomly) |
| `qev_api_key_3` | QuickEmailVerification API key (rotated randomly) |

---

## Helper Scripts

| Script | Purpose |
|--------|---------|
| `import.mjs` | Initial import of all workflows to n8n |
| `push-v2.mjs` | General purpose workflow push (PUT) |
| `push-thread-fix.mjs` | Latest deployment (WF7 + WF8 + force-send) |
| `db-setup.mjs` | Database schema creation (already run) |
| `seed.mjs` | Seed data insertion |
| `deploy-ui.mjs` | Deploy UI to VPS |
| `list-wf.mjs` / `list-wf2.mjs` | List all n8n workflows with IDs |
| `migrate-*.mjs` | Database migration scripts (already run, kept for history) |

---

## Vocative Salutation System

- `jednatels.salutation` stores vocative address only (e.g., `pane Novaku`, `pani Novakova`)
- Templates use `Dobry den {{salutation}},` — greeting prefix is in the template
- DB trigger auto-generates on INSERT/UPDATE from `full_name`
- All male names inflected per Czech vocative rules (no foreign-name exemption)

---

## Per-Sequence Scheduling

- `waves` has per-seq columns: `send_date_seq2`, `send_date_seq3`, `send_time_seq1/2/3`
- UI provides gap buttons (+1d, +2d, +3d, +5d, +7d) between sequences
- WF7 reads per-seq date/time directly, falls back to delay-based computation

---

## Salesman IMAP Slots

- Max 5 salesman IMAP slots in `sub-reply-check` (Switch node routing)
- Each salesman needs a matching IMAP credential in n8n
- Adding more requires new Switch routes + IMAP nodes in the sub-workflow

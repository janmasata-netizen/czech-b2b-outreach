# Operations Manual

## Adding a New Salesman / Email Account

### 1. Add IMAP credentials

On the VPS, edit `/docker/imap-proxy/config.json` and add a new entry:

```json
{
  "credentials": {
    "Salesman IMAP 1": { ... },
    "Salesman IMAP 2": {
      "host": "imap.example.com",
      "port": 993,
      "user": "new-salesman@example.com",
      "pass": "password"
    }
  }
}
```

Restart the container: `docker restart imap-proxy`

### 2. Add SMTP credentials

Edit `/docker/smtp-proxy/config.json` similarly:

```json
{
  "credentials": {
    "Burner SMTP": { ... },
    "Salesman SMTP 2": {
      "host": "smtp.example.com",
      "port": 465,
      "secure": true,
      "user": "new-salesman@example.com",
      "pass": "password"
    }
  }
}
```

Restart: `docker restart smtp-proxy`

### 3. Add salesman in the UI

Go to **Settings > Salesmen** (`/nastaveni/obchodnici`) and create a new salesman record with their name, email, and team assignment.

### 4. Update outreach account

If this is a new sending account, go to **Settings > Outreach Accounts** (`/nastaveni/ucty`) and configure the team's outreach account with the matching credential name.

Note: Each team can have exactly **one** outreach account (UNIQUE constraint).

## Creating and Scheduling Email Waves

### 1. Prepare leads

Leads must be in `ready` status (enriched with verified email addresses). Check in **Leads** (`/leady`) — filter by status "ready".

### 2. Create a wave

Go to **Waves** (`/vlny`) and click "Create Wave":
- Select a **team**
- Select a **template set** (the email sequence to use)
- Configure wave settings (daily send limit, scheduling)

### 3. Add leads to the wave

In the wave detail page (`/vlny/:id`), add leads using the "Add Leads" dialog. Only leads with verified emails and `ready` status can be added.

### 4. Schedule the wave

Click "Schedule" in the wave detail page. This triggers **WF7** (wave-schedule) which:
- Creates entries in `email_queue` for each lead × sequence step
- Sets the wave status to `scheduled`

### 5. Monitor sending

**WF8** (send-cron) runs every 5 minutes:
- Claims a batch of queued emails via `claim_queued_emails()` (atomic)
- Checks daily send limits via `increment_and_check_sends()`
- Sends via SMTP proxy
- Records in `sent_emails`
- Calls `auto_complete_waves()` when done

Monitor progress in the wave detail page — it shows sent/pending/failed counts in real-time (via Supabase realtime subscriptions).

## Template Management

### Template sets

A **template set** is a group of email templates used by a wave. Manage them in **Settings > Templates** (`/nastaveni/sablony`).

### Email templates

Each template set contains templates organized by:
- **Sequence** (seq1, seq2, seq3) — the email in the multi-touch sequence
- **A/B variant** (A or B) — for split testing

### Template variables

Available variables in email subject and body:

| Variable | Source | Example |
|----------|--------|---------|
| `{{salutation}}` | `jednatels.salutation` | `Vazeny pane Novaku` |
| `{{company_name}}` | `leads.company_name` | `ACME s.r.o.` |
| `{{first_name}}` | `jednatels.first_name` | `Jan` |
| `{{last_name}}` | `jednatels.last_name` | `Novak` |

Templates use `{{salutation}},` directly — the greeting prefix is included in the salutation field (no need to add "Vazeny pane" in the template).

### Template editing

The template editor uses **Tiptap** (rich text editor). You can use HTML formatting. Templates support drag-and-drop reordering of sequences.

## Retarget Pool

The retarget pool (`/retarget`) contains leads that can be re-engaged in new waves. Leads enter the retarget pool when:
- A wave completes without getting a reply
- They are manually moved to the pool

Use the retarget pool to create follow-up campaigns targeting leads that didn't respond to initial outreach.

## User Management

### Admin panel

Go to **Settings > Users** (`/nastaveni/uzivatele`) to manage users.

### Roles

- **Admin** — Full access to all settings, teams, users, templates
- **Regular user** — Access to leads, waves, dashboard, email finder (no settings)

### Adding users

Users authenticate via Supabase Auth (email/password). Create new users in the admin panel — this creates both a Supabase Auth user and a `profiles` record with the assigned role.

The **wf-admin-users** webhook handles user management operations from the UI.

## Monitoring

### Reply Detection

**WF9** runs every minute:
1. Calls IMAP proxy (`/check-inbox`) for each salesman credential
2. Matches replies to sent emails via Message-ID threading (In-Reply-To / References headers)
3. Records in `lead_replies` table
4. Updates wave_lead status to `replied`
5. Deduplicates via `processed_reply_emails` table

Check replies in the UI on the wave detail page or lead detail page.

### Bounce / NDR Monitoring

Two workflows monitor for bounces:
- **wf-ndr-monitor** — Checks INBOX for NDR (Non-Delivery Report) messages
- **wf-ndr-monitor-spam** — Checks spam folder for bounced NDRs

Bounces are recorded in `email_probe_bounces`. Old bounce records are cleaned daily by WF10.

### Daily Reset (WF10)

Runs at midnight:
- Calls `reset_daily_sends()` to reset all daily send counters
- Deletes old `email_probe_bounces` records

### Health Checks

Both proxies expose health endpoints:
- IMAP: `GET http://imap-proxy:3001/health`
- SMTP: `GET http://smtp-proxy:3002/health`

From the VPS, you can check: `curl http://localhost:3001/health` and `curl http://localhost:3002/health`.

## Config Table Keys

The `config` table in Supabase stores runtime configuration:

| Key | Purpose | Example |
|-----|---------|---------|
| `seznam_from_email` | Sender email for Seznam verification (WF5) | `verify@example.com` |
| `qev_api_key_1` | QEV API key (1st rotation slot) | `qev_abc123...` |
| `qev_api_key_2` | QEV API key (2nd rotation slot) | `qev_def456...` |
| `qev_api_key_3` | QEV API key (3rd rotation slot) | `qev_ghi789...` |

QEV keys rotate automatically — WF6 cycles through all three to distribute API usage.

## Troubleshooting

### Emails not sending

1. **Check email_queue** — Look for items stuck in `queued` or `sending` status in Supabase
2. **Verify SMTP proxy** — SSH to VPS, run `curl http://localhost:3002/health`
3. **Check daily send limits** — `increment_and_check_sends()` may be blocking. Reset manually or wait for midnight reset
4. **Review WF8 logs** — Open n8n UI, check WF8 execution history for errors
5. **Check credential_name** — Ensure the outreach account's credential name matches an entry in `smtp-proxy/config.json`

### Replies not detected

1. **Check IMAP proxy** — `curl http://localhost:3001/health`
2. **Verify credential_name** — The credential name in WF9 must match `imap-proxy/config.json`
3. **Check WF9 logs** — Look for IMAP connection errors in n8n
4. **Verify threading** — Replies must have `In-Reply-To` or `References` headers matching a `sent_emails.message_id`
5. **Check deduplication** — Reply may already be in `processed_reply_emails`

### Lead enrichment stuck

1. **Check enrichment_log** — Query for the lead_id to see which step failed
2. **Verify workflow is active** — In n8n UI, ensure the relevant workflow (WF2-WF6) is active
3. **Check webhook endpoints** — UI triggers enrichment via webhooks; ensure n8n is reachable
4. **ARES API issues** — The ARES API may be temporarily down; check enrichment_log error details
5. **Kurzy.cz scraping** — Site structure may have changed; check WF3 for scraping errors

### Wave not completing

1. **Check wave_leads** — Look for items stuck in non-terminal status
2. **Verify auto_complete_waves()** — WF8 calls this after each send loop; check n8n logs
3. **Failed emails** — Some wave_leads may be in `failed` status; investigate and retry or skip
4. **Manual completion** — Use the wave detail page in the UI to manually mark as completed if needed

### Docker container issues

```bash
# Check container status
docker ps -a | grep -E "imap-proxy|smtp-proxy|outreach-ui"

# View logs
docker logs imap-proxy --tail 50
docker logs smtp-proxy --tail 50

# Restart
docker restart imap-proxy smtp-proxy
```

### Database connection issues

1. **Check Supabase status** — Visit Supabase dashboard for project health
2. **Verify service role key** — Ensure `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` is current
3. **RLS policies** — If queries return empty, check that RLS policies allow the operation

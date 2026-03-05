# Email Verification Sub-Workflow

Replaces the fragile seznam.cz bounce-test approach in WF5 with a synchronous
multi-layer verifier: **syntax → disposable-domain check → DNS MX lookup → SMTP handshake**.

---

## How it works

```
Trigger → Check Cache → Parse Cache → IF Cache Hit
  ├─ TRUE  → Format Cached              (returns cached result immediately)
  └─ FALSE → Full Verify → DNS MX Lookup → SMTP Verify → Build Result → Write Cache → Return Result
```

### Layers

| # | Check | What it does |
|---|-------|-------------|
| 1 | Syntax | Regex `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` — rejects malformed addresses |
| 2 | Disposable | ~100-entry blocklist of throwaway-email providers (mailinator, yopmail, etc.) |
| 3 | DNS MX | Cloudflare DNS-over-HTTPS (`cloudflare-dns.com/dns-query`, type MX) — domain must have at least one MX record |
| 4 | SMTP handshake | TCP port 25 to the lowest-priority MX: EHLO → MAIL FROM → RCPT TO → catch-all probe |

---

## Confidence score (0–100)

| Condition | Points |
|-----------|--------|
| Valid syntax | +10 |
| Not a disposable domain | +20 |
| Has at least one MX record | +20 |
| SMTP RCPT TO accepted (`smtp_result = 'valid'`) | +35 |
| Not a catch-all mailserver (and has MX) | +15 |
| **Maximum** | **100** |

### `is_valid` logic

```
is_valid = valid_syntax AND NOT is_disposable AND has_mx AND smtp_result != 'invalid'
```

Emails that time out or return `error` during SMTP are treated as valid (benefit of
the doubt) unless the domain also lacks MX records.

---

## Cache (7-day TTL)

Results are stored in the `email_verifications` Supabase table. Before running any
network checks the sub-workflow looks for a cached row where `verified_at > now() - 7 days`.

- Cache hit: returns result immediately, no DNS or SMTP traffic.
- Cache miss: runs all checks, writes result to cache via upsert
  (`Prefer: resolution=merge-duplicates`).

To force re-verification: delete the row from `email_verifications` for that email.

---

## How WF5 uses the result

`Call Email Verify` (executeWorkflow, runOnceForEachItem) calls this sub-workflow
for each pending `email_candidates` row. The result item is then processed by
`Classify Candidates`:

```
is_valid AND NOT is_disposable  →  seznam_status = 'likely_valid'
otherwise                        →  seznam_status = 'bounced'
```

Only `likely_valid` candidates proceed to QEV verification.

---

## SMTP prerequisite

The SMTP handshake node requires `require('net')` to be available in n8n Code nodes.

**Add to n8n's docker-compose.yml:**
```yaml
environment:
  NODE_FUNCTION_ALLOW_BUILTIN: 'net'
```
Then restart: `docker compose up -d`

Without this env var, the `SMTP Verify` node will throw `require is not defined` or
`net` module not allowed. The workflow will still classify candidates (via the
`has_mx ? 'skipped' : 'no_mx'` fallback) but SMTP accuracy will be lower.

---

## Database tables

### `email_verifications`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `email` | text UNIQUE | Email address |
| `domain` | text | Domain part |
| `is_valid` | boolean | Final validity verdict |
| `is_catch_all` | boolean | Catch-all server detected |
| `is_disposable` | boolean | Matched disposable domain list |
| `mx_records` | jsonb | Array of `{priority, exchange}` |
| `smtp_result` | text | `valid` / `invalid` / `timeout` / `error` / `no_mx` / `skipped` |
| `verified_at` | timestamptz | When last verified (used for 7-day TTL) |
| `created_at` | timestamptz | First insertion |

### `email_candidates` (new column)

| Column | Type | Description |
|--------|------|-------------|
| `verified_at` | timestamptz | Timestamp set by `Update Status` node after verification |

---

## Running the push script

```bash
# 1. First ensure NODE_FUNCTION_ALLOW_BUILTIN=net is set on the VPS

# 2. Run the push script
node n8n-workflows/push-email-verify.mjs
```

The script will:
1. Apply migration SQL (creates `email_verifications` table, adds `verified_at` to `email_candidates`)
2. Import `email-verification.json` as a new sub-workflow in n8n → captures its ID
3. Activate the sub-workflow
4. Update WF5 with the real sub-workflow ID, replacing `__EMAIL_VERIFY_WF_ID__`
5. Activate WF5

---

## End-to-end test

1. Trigger WF4 for a test lead (e.g. IČO 04470427)
2. WF4 calls WF5 webhook
3. WF5 runs email verification per candidate
4. Check `email_verifications` table: new row per email
5. Check `email_candidates`: `seznam_status = 'likely_valid'` or `'bounced'`, `verified_at` set
6. QEV step runs for `likely_valid` candidates
7. Check `leads.status` → `ready` or `failed`

**Cache test:** trigger the same lead again — `from_cache: true` appears in the
execution log for the sub-workflow, no SMTP connections visible.

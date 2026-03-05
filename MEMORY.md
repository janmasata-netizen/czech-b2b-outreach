# Active Project: Czech B2B Email Outreach System

Main context file: `CLAUDE.md` in repo root — read this at the start of every session.

## Key facts
- n8n at `http://72.62.53.244:32770`, Supabase project `cycapkswtucbucyegdsn`
- All workflow files in `n8n-workflows/` (relative to repo root)
- No `$env.*` vars in workflows — everything hardcoded or fetched from Supabase `config` table
- Hostinger MCP server configured — restart Claude Code to activate
- UI is in `outreach-ui/` — React+Vite, build passes with zero TS errors

## Workflow preferences
- User wants secrets/config stored in Supabase, not n8n env vars
- Use Node.js scripts (`.mjs`) for any bulk n8n/Supabase operations
- Push workflows to n8n via `PUT /api/v1/workflows/{id}` with `X-N8N-API-KEY` header
- Supabase DDL via Management API at `api.supabase.com/v1/projects/{ref}/database/query`

## Remaining work (priority order)
1. Seed DB: teams, outreach_accounts, template_sets + email_templates, profiles
2. Create n8n SMTP/IMAP credentials (Seznam SMTP, Seznam IMAP, Burner SMTP, Salesman IMAP)
3. Set config table: seznam_from_email, qev_api_key
4. Activate WF8, WF9, WF10
5. Deploy outreach-ui to VPS (72.62.53.244) via Hostinger MCP

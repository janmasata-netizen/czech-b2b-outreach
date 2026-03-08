---
name: generate-docs
description: Generate or regenerate technical documentation for the project. Reads codebase and produces docs/architecture.md, docs/setup-guide.md, docs/operations-manual.md
user_invocable: true
---

# Generate Documentation Skill

You are generating technical documentation for the czech-b2b-outreach project. Read the codebase and produce three documentation files that are accurate, comprehensive, and useful for both new developers and operators.

## Steps

1. **Read the project context:**
   - `CLAUDE.md` (project rules, infrastructure, schema, workflow IDs)
   - `.claude/skills/generate-docs/templates.md` (document structure templates)

2. **Scan the codebase for current state:**
   - `n8n-workflows/*.json` — extract workflow names, triggers, node counts
   - `outreach-ui/src/App.tsx` — extract routes
   - `outreach-ui/src/hooks/` — list all hooks and their purpose
   - `outreach-ui/package.json` — tech stack
   - `imap-proxy/server.mjs` — endpoints, config format
   - `smtp-proxy/server.mjs` — endpoints, config format
   - `imap-proxy/config.example.json`, `smtp-proxy/config.example.json`
   - `.env.example` — all environment variables
   - `outreach-ui/deploy-ssh2.mjs` — deployment process
   - `imap-proxy/deploy.mjs`, `smtp-proxy/deploy.mjs` — proxy deployment

3. **Generate/overwrite the three documentation files:**
   - `docs/architecture.md` — System architecture, components, data flow, workflow reference, DB schema, security
   - `docs/setup-guide.md` — Prerequisites, clone/configure, local dev, deploying workflows, VPS deployment, Supabase setup
   - `docs/operations-manual.md` — Day-to-day operations, adding salesmen, waves, templates, monitoring, troubleshooting

4. **Cross-reference** every claim against actual code. Do not guess — if a file doesn't exist or a route has changed, reflect the current state.

5. **Commit the docs** alongside any other changes in the current branch.

## Output format

Write the three files following the templates in `templates.md`. Use clear headings, tables, and code blocks. Keep language concise and technical. Target audience: a developer or ops person who has never seen the project before.

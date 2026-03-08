---
name: generate-docs
description: Generate or regenerate technical documentation for the project. Reads codebase and produces docs/architecture.md, docs/setup-guide.md, docs/operations-manual.md in Czech user-friendly style.
user_invocable: true
---

# Generate Documentation Skill

You are generating technical documentation for the czech-b2b-outreach project **in Czech language** following a specific user-friendly style. Read the codebase and produce three documentation files that are accurate, comprehensive, and readable by a Czech user unfamiliar with the system.

## Style conventions (MUST follow)

All three docs must follow these formatting rules:

- **Czech language** throughout (no English headings or descriptions)
- **Two-part structure**: Cast 1 (Rychly prehled) + Cast 2 (Detailni reference/postupy)
- **Navigation table** at the top: "Jsem... | Chci... | Prejdete na..."
- **Callout boxes** using blockquotes:
  - `> TIP:` — helpful hints
  - `> POZOR:` — warnings about common pitfalls
  - `> Caste chyby:` — list of frequent mistakes
  - `> Pouze pro roli Admin:` (or other role) — access restriction marker
- **Step-by-step numbered procedures** with:
  - **Cil:** (goal of the procedure)
  - **Predpoklady:** (what must be true before starting)
  - **Postup:** (numbered steps)
  - **Vysledek:** (what you should see when done)
- **FAQ-style troubleshooting** tables: Mozna pricina | Jak overit | Reseni
- **Glossary** (Slovnicek) section at the bottom of each doc
- **Status reference tables** with color coding where applicable
- **Tables** for quick reference (routes, hooks, env vars, config keys)
- Code blocks stay in English/bash (commands are not translated)
- No emojis in headings

## Steps

1. **Read the project context:**
   - `CLAUDE.md` (project rules, infrastructure, schema, workflow IDs)
   - `.claude/skills/generate-docs/templates.md` (Czech document structure templates)

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

3. **Generate/overwrite the three documentation files in Czech:**
   - `docs/architecture.md` — "Architektura systemu" — prehled, diagram, komponenty, datove toky, reference workflow, DB schema, zabezpeceni, slovnicek
   - `docs/setup-guide.md` — "Pruvodce nastavenim" — checklist prvniho dne, klonovani, lokalni vyvoj, nasazeni workflow, VPS deployment, Supabase setup, slovnicek
   - `docs/operations-manual.md` — "Provozni prirucka" — denni operace, obchodnici, vlny, sablony, retarget, monitoring, FAQ troubleshooting, slovnicek

4. **Cross-reference** every claim against actual code. Do not guess — if a file doesn't exist or a route has changed, reflect the current state.

5. **Commit the docs** alongside any other changes in the current branch.

## Output format

Write the three files following the templates in `templates.md`. All content in Czech. Use navigation tables, callout boxes, step-by-step procedures, FAQ troubleshooting tables, and glossaries as described above. Code blocks and CLI commands remain in English/bash.

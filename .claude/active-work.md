<!-- IMPORTANT: Every Claude Code agent MUST add a row here BEFORE starting work.
     Read the hub CLAUDE.md (parent directory) for the full coordination protocol.
     Steps: git pull → check this table → create feature branch → add your row → commit+push to main → do work. -->

# Active Work

| Branch | Agent | Files/Areas | Started | Description |
|---|---|---|---|---|

| claude/fix-dedup-system | Claude Opus | dedup.ts, AddLeadDialog, CsvImportDialog, GoogleSheetImportDialog, useLeads.ts, migrate-dedup-fix.mjs | 2026-03-09 | Fix broken dedup: JSON.stringify bug, silent error swallowing, domain backfill, UNIQUE indexes |

---
name: preflight
description: "Pre-flight workflow check. Validates git state, branch, registration, and build before starting work. Triggers on: preflight, pre-flight, workflow check, health check, before work."
user-invocable: true
argument-hint: "[project-name]"
context: fork
agent: general-purpose
allowed-tools: Read, Glob, Grep, Bash
---

You are running a pre-flight workflow compliance check. Your job is to validate that the current git and project state is clean and ready for work. Run ALL of the following checks and report results as a checklist.

## Input

The user may pass a project name as an argument (e.g., `/preflight czech-b2b-outreach`). If provided, `cd` into that directory first. If not provided, use the current working directory.

## Checks to Run

Run these checks sequentially and collect results:

### 1. Branch Check
```bash
git rev-parse --abbrev-ref HEAD
```
- If `main` → `[WARN] On main branch — you should be on a feature branch`
- Otherwise → `[PASS] On feature branch: <name>`

### 2. Dirty Tree Check
```bash
git status --porcelain
```
- If output is empty → `[PASS] Working tree clean`
- Otherwise → `[WARN] Uncommitted changes detected` and list the files

### 3. Stash Check
```bash
git stash list
```
- If empty → `[PASS] No stashes`
- Otherwise → `[WARN] N stash(es) found — stashing is forbidden by workflow. Commit WIP to your branch instead.`

### 4. Registration Check
Read `.claude/active-work.md`. If on a feature branch:
- If the branch name appears in active-work.md → `[PASS] Branch registered in active-work.md`
- If not → `[WARN] Branch not registered in active-work.md — register before doing any work`
If on main, skip this check.

### 5. Stale Entry Check
Read `.claude/active-work.md` and check the `Last Updated` column.
- Any entries older than 24 hours → `[WARN] Stale entry: <branch> (last updated <date>) — can be claimed per abandonment rule`
- No stale entries → `[PASS] No stale entries in active-work.md`

### 6. Merged Branch Check
```bash
git branch --merged main
```
- If any branches (besides main itself) are listed → `[WARN] Merged branches that should be deleted: <list>`
- Otherwise → `[PASS] No merged branches to clean up`

### 7. Remote Tracking Check
```bash
git branch -vv
```
- If any branch shows `[gone]` → `[WARN] Branches tracking deleted remotes: <list>. Run: git branch -d <name>`
- Otherwise → `[PASS] All branches track valid remotes`

### 8. Build Check
Check if `outreach-ui/` directory exists. If so:
```bash
cd outreach-ui && npm run build
```
- If build succeeds → `[PASS] Build passes`
- If build fails → `[FAIL] Build broken — fix before pushing`
If no `outreach-ui/`, skip with `[SKIP] No outreach-ui/ directory`

### 9. Hooks Check
```bash
git config core.hooksPath
```
- If output is `.githooks` → `[PASS] Git hooks configured`
- Otherwise → `[WARN] Git hooks not configured. Run: git config core.hooksPath .githooks`

## Output Format

Print results as a clean checklist:

```
Pre-Flight Check Results:
  [PASS] On feature branch: claude/my-feature
  [PASS] Working tree clean
  [PASS] No stashes
  [WARN] Branch not registered in active-work.md — register before doing any work
  [PASS] No stale entries in active-work.md
  [PASS] No merged branches to clean up
  [PASS] All branches track valid remotes
  [PASS] Build passes
  [PASS] Git hooks configured

1 warning found. Fix before proceeding.
```

At the end, summarize:
- If all PASS → "All checks passed. Ready to work."
- If any WARN → "N warning(s) found. Fix before proceeding."
- If any FAIL → "N failure(s) found. Must fix before continuing."

For each WARN or FAIL, include the recommended fix command on the next line.

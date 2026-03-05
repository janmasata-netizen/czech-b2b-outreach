# Known Issues — IMAP Nodes

## emailTrigger node type not recognized (unrecognized node type)
- **Date:** 2026-02-25
- **Node/Service:** n8n-nodes-base.emailTrigger
- **Error:** `{"message":"Unrecognized node type: n8n-nodes-base.emailTrigger"}` during workflow activation
- **Root Cause:** This n8n instance does not have the Email Trigger (IMAP) node (`emailTrigger`). Only the action node (`emailReadImap`) is available.
- **Solution:** Use a Schedule Trigger (cron `* * * * *` = every minute) + `emailReadImap` action node with `options.markSeen: true` and `options.customEmailConfig: "[\"UNSEEN\"]"`. This achieves continuous polling with the same reliability.
- **Example:**
  ```json
  { "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.1,
    "parameters": { "rule": { "interval": [{ "field": "cronExpression", "expression": "* * * * *" }] } } }
  ```
  followed by:
  ```json
  { "type": "n8n-nodes-base.emailReadImap", "typeVersion": 2,
    "parameters": { "mailbox": "INBOX",
      "postProcessAction": "read",
      "options": { "customEmailConfig": "[\"UNSEEN\"]", "format": "simple",
                   "downloadAttachments": false } } }
  ```
  **Note:** v2 action mode uses `postProcessAction` (top-level), NOT `options.markSeen`. See entry below.
---

## emailReadImap v2 (action) vs v2.1 (trigger) — different parameter schemas
- **Date:** 2026-03-03
- **Node/Service:** n8n-nodes-base.emailReadImap
- **Error:** After pushing workflow JSON with `options.markSeen: false` and `options.forceReconnect: true`, n8n stripped these fields, leaving `options: {}`. Emails were being marked as read despite the intent to leave them unread.
- **Root Cause:** emailReadImap **v2 (action mode)** and **v2.1 (trigger mode)** use completely different parameter schemas. v2 action mode uses `postProcessAction` as a **top-level parameter**, NOT `options.markSeen`. `options.forceReconnect` is also invalid for v2 and gets stripped on push.
- **Solution:**
  - **v2.1 (trigger):** Use `options.markSeen: true/false` — this is correct for trigger mode
  - **v2 (action):** Use `postProcessAction: "nothing"` (top-level) to leave emails unread, or `postProcessAction: "read"` to mark as read. Do NOT put `markSeen` or `forceReconnect` in options.
  - `options.customEmailConfig` and `options.downloadAttachments` work in both versions
- **Example (v2 action, don't mark as read):**
  ```json
  {
    "type": "n8n-nodes-base.emailReadImap",
    "typeVersion": 2,
    "parameters": {
      "mailbox": "INBOX",
      "postProcessAction": "nothing",
      "options": {
        "customEmailConfig": "[\"UNSEEN\"]",
        "downloadAttachments": false
      }
    }
  }
  ```
---

## emailReadImap v2 marks emails as read despite postProcessAction:"nothing"
- **Date:** 2026-03-03
- **Node/Service:** n8n-nodes-base.emailReadImap v2
- **Error:** Emails in salesman IMAP inbox are marked as `\Seen` after n8n polls, even with `postProcessAction: "nothing"`.
- **Root Cause:** The n8n IMAP source (`utils.js`) has divergent code paths based on the `format` parameter. When `format` is `"simple"` or `"raw"`, `fetchOptions` explicitly sets `markSeen: false`. When `format` is `"resolved"`, same. But if `format` is unset and the default isn't applied (edge case), `fetchOptions` stays `{}` — `markSeen` is never explicitly set. Multiple n8n community reports confirm this bug (community #58344, GitHub #16853, #17719).
- **Solution:** Always add `"format": "simple"` to the IMAP node's `options` object. This guarantees the `markSeen: false` code path is taken.
- **Example:**
  ```json
  {
    "parameters": {
      "mailbox": "INBOX",
      "postProcessAction": "nothing",
      "options": {
        "customEmailConfig": "[\"UNSEEN\"]",
        "downloadAttachments": false,
        "format": "simple"
      }
    }
  }
  ```
---

## emailReadImap marks emails as \Seen — CONFIRMED UNFIXABLE (proxy bypass deployed)
- **Date:** 2026-03-03
- **Node/Service:** n8n-nodes-base.emailReadImap v2
- **Error:** Despite `postProcessAction: "nothing"` AND `format: "simple"`, emails are still marked as `\Seen`. Also causes "Too many simultaneous connections" errors because n8n holds IMAP connections open between polls.
- **Root Cause:** Library-level bug in n8n's IMAP implementation. The `format: "simple"` fix (see entry above) does NOT reliably prevent `\Seen`. Additionally, n8n leaks IMAP connections, exhausting server connection limits (typically 5-10 per account).
- **Solution:** **Bypass n8n IMAP entirely.** Deploy `imap-proxy` microservice (Docker, port 3001 on VPS) that uses `imapflow` with `BODY.PEEK[]` — this NEVER sets `\Seen`. The sub-reply-check workflow calls `POST http://172.17.0.1:3001/check-inbox` with `{ "credential_name": "Salesman IMAP 1" }` instead of using Switch Credential + Salesman IMAP nodes.
- **Architecture:**
  - `imap-proxy/` directory: `server.mjs` (imapflow + mailparser), `config.json` (IMAP creds), Docker container
  - Proxy connects, fetches UNSEEN via PEEK, parses with mailparser, returns n8n-compatible format, disconnects cleanly
  - n8n reaches proxy at `http://imap-proxy:3001` (Docker DNS on shared n8n-p5bv_default network)
  - Adding new salesman: add entry to `config.json` + `docker restart imap-proxy` (no n8n workflow changes)
- **Deploy:** `node imap-proxy/deploy.mjs` → uploads + builds Docker image + starts container
- **Push:** `node n8n-workflows/push-imap-proxy.mjs` → updates sub-reply-check workflow
---

## imap-proxy "Too many simultaneous connections" — connection leak on empty inbox
- **Date:** 2026-03-03
- **Node/Service:** imap-proxy (imapflow)
- **Error:** After ~15 minutes of operation, all proxy polls fail with `Command failed: Too many simultaneous connections. (Failure)` from Gmail IMAP.
- **Root Cause:** When `client.search()` returned 0 UIDs, the code had an early `return emails` that skipped `client.logout()`. The `finally` block only released the mailbox lock but never disconnected. Each empty poll leaked one IMAP connection. At 1 poll/minute, Gmail's 15-connection limit was hit in ~15 minutes.
- **Solution:** Restructure `fetchUnseenEmails()` to use a nested try/finally pattern: inner finally releases mailbox lock, outer finally always calls `client.logout()`. Remove the early return — use conditional `if (uids && uids.length > 0)` around the fetch loop instead.
- **Also:** After fixing the proxy, n8n itself may still be holding stale IMAP connections from previously-active IMAP nodes. Run `docker exec <n8n-container> netstat -tnp | grep 993` to check. If stale connections exist, `docker restart <n8n-container>` to release them.
- **Example (correct pattern):**
  ```js
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      if (uids && uids.length > 0) { /* fetch loop */ }
    } finally { lock.release(); }
  } finally {
    try { await client.logout(); } catch (_) {}
  }
  ```
---

## emailReadImap returns 0 items when inbox is empty (chain stops silently)
- **Date:** 2026-02-25
- **Node/Service:** n8n-nodes-base.emailReadImap
- **Error:** No execution of downstream nodes when inbox has no unread mail.
- **Root Cause:** When no matching emails exist, emailReadImap outputs 0 items, cutting the execution chain. This is expected behaviour for polling workflows.
- **Solution:** This is acceptable for polling NDR monitors — when there are no emails to process, the chain stops and the workflow completes successfully. No downstream nodes need to run.
---

## emailSend v2.1 Does NOT Support Custom Headers
- **Date:** 2026-02-27
- **Node/Service:** n8n-nodes-base.emailSend v2.1
- **Error:** Adding `additionalFields.headers` or any custom header parameter to the emailSend node is silently ignored. Headers like X-Mailer, In-Reply-To, References are not set.
- **Root Cause:** The emailSend v2.1 source code (`send.operation.ts`) constructs mailOptions with only: from, to, cc, bcc, subject, replyTo, text/html, attachments, allowUnauthorizedCerts. No custom headers parameter exists.
- **Solution:** For custom headers (X-Mailer spoof, email threading via In-Reply-To/References), use one of:
  1. Community node `n8n-nodes-sendmail` (supports custom headers)
  2. HTTP-based SMTP relay (small Node.js server with nodemailer on VPS)
  3. Accept the limitation (n8n does NOT set X-Mailer by default; threading won't work for seq 2/3)
- **Note:** `options.appendAttribution: false` DOES work — it removes "Sent via n8n" from the email body. This is the only attribution control available.
- **Note:** nodemailer v6+ does NOT set X-Mailer by default, and n8n emailSend v2.1 doesn't add one either. Outgoing emails have no X-Mailer header (confirmed via source code).
---

## Community Node Install — Must Use n8n UI (confirmed 2026-02-28)
- **Date:** 2026-02-27, resolved 2026-02-28
- **Node/Service:** n8n-nodes-better-send-mail (community node)
- **Error:** `Unrecognized node type: n8n-nodes-better-send-mail.betterEmailSend` when installed via CLI (`npm install` or `pnpm add` in `~/.n8n/`).
- **Root Cause:** CLI-installed packages in the Hostinger n8n Docker container are not discovered by the node loader. Only the n8n UI install path (Settings → Community Nodes) properly registers community packages.
- **Solution:** Install community nodes ONLY via the n8n UI (Settings → Community Nodes → Install). CLI approaches do NOT work on this deployment.
- **Current state:** `n8n-nodes-better-send-mail` v0.1.2 installed via UI, WF8 uses `betterEmailSend` v2 with `customHeadersUi` for Message-ID, In-Reply-To, References headers. Threading works.
---

## WF8 Trigger Connection Mismatch — Cron fires but emails never send
- **Date:** 2026-03-16
- **Node/Service:** WF8 (wf8-send-cron.json) — scheduleTrigger node
- **Error:** WF8 cron runs every minute (shows as "success" in n8n) but emails sit in `email_queue` with `status = 'queued'` forever. Execution times are ~20ms instead of normal 200-600ms.
- **Root Cause:** Trigger node was renamed from "Every 5 Minutes" to "Every Minute" (commit e9d92f1) but the `connections` key in the JSON was not updated. n8n connections use the source node name as the key — if the key doesn't match any node, the connection is dead. The trigger fires but has no outgoing connection, so nothing downstream executes.
- **Solution:** Ensure the connections key matches the actual trigger node name. In `wf8-send-cron.json`, change `"Every 5 Minutes":` to `"Every Minute":` in the connections object. Push to n8n via `update.mjs`. Always verify connection keys match node names when renaming nodes in JSON.
- **Diagnostic:** Run `node n8n-workflows/diagnose-wave-send.mjs` — checks WF8 active status, executions, queue state, and function existence. Also check execution duration: ~20ms = trigger disconnected, 200ms+ = working.
---

## WF7 Double-Scheduling Guard Blocks Rescheduling
- **Date:** 2026-03-16
- **Node/Service:** WF7 (wf7-wave-schedule.json) — Build Queue code node
- **Error:** `Wave already in status: scheduled` when user stops a wave and tries to reschedule it.
- **Root Cause:** Guard `['scheduled', 'sending', 'done', 'completed']` was too aggressive. When user clicks Stop, queue items get cancelled but wave status may stay 'scheduled' (RLS silent failure on status update). Rescheduling then fails because 'scheduled' is in the block list. The "Delete Old Queue Items" node already handles cleanup, making the 'scheduled' guard redundant.
- **Solution:** Remove 'scheduled' from the guard list → `['sending', 'done', 'completed']`. Also have UI set `status: 'draft'` in handleSchedule before calling WF7 (belt and suspenders). Also add 'cancelled' to Delete Old Queue Items filter so cancelled items are cleaned up on reschedule.
---

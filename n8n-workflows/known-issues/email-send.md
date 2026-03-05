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

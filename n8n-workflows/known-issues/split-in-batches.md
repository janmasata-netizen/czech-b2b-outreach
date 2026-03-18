## Nested SplitInBatches Causes Outer Loop to Skip (Bug #23670)
- **Date:** 2026-02-26
- **Node/Service:** n8n-nodes-base.splitInBatches v3
- **Error:** When two SplitInBatches nodes are nested in the same workflow (e.g., Loop Salesmen → Loop Inbox Emails), the outer loop skips directly to its "done" output after the first iteration of the inner loop completes. Only the first salesman gets processed.
- **Root Cause:** n8n's internal batch tracking uses a shared execution context. When the inner SplitInBatches completes and signals "done", it corrupts the outer SplitInBatches state, causing it to also think it's done.
- **Solution:** Extract the inner loop into a sub-workflow. The outer loop calls Execute Workflow per item. Each workflow has at most ONE SplitInBatches node. This completely avoids the nesting bug.
- **Example:** WF9 Reply Detection had Loop Salesmen (outer) → Loop Inbox Emails (inner). Fixed by extracting the email processing into `sub-reply-check` sub-workflow. WF9 now has only Loop Salesmen, and sub-reply-check has only Loop Emails. No nesting.
---

## SplitInBatches v3 Goes Directly to "Done" Without Processing
- **Date:** 2026-02-27
- **Node/Service:** n8n-nodes-base.splitInBatches v3
- **Error:** SplitInBatches v3 outputs 0 items on Branch 0 (batch) and 1 item on Branch 1 (done), skipping processing entirely.
- **Root Cause:** Unknown v3-specific bug. The node doesn't properly process incoming items.
- **Solution:** Use SplitInBatches v1 with `options.reset: true` instead. v1 correctly processes items one at a time and outputs "done" only when exhausted.
- **Example:** WF8 Loop Emails changed from v3 to v1 with batchSize=1, options.reset=true.
---

## SplitInBatches v1 Loop-Back With reset:true Drops Remaining Items
- **Date:** 2026-02-27 (updated 2026-03-18)
- **Node/Service:** n8n-nodes-base.splitInBatches v1
- **Error:** When SplitInBatches v1 (batchSize=1, reset=true) receives N items, it processes only the FIRST item. On loop-back, `reset: true` clears the internal state, treating the loop-back data as a fresh batch of 1 invalid item. The remaining N-1 original items are permanently lost.
- **Root Cause:** `reset: true` clears the internal batch counter when ANY new data arrives — including loop-back data. After batch 1 is processed, the loop-back sends the last node's output (e.g., `{}` from a PATCH response). SplitInBatches sees this as a new single-item batch, outputs it, and the IF guard rejects it (no `wave_lead_id`). The false branch has no connection → loop ends. The remaining N-1 items from the original claim are never processed.
- **Critical consequence (WF8):** `claim_queued_emails` atomically sets claimed items to `status='sending'`. Only 1 gets processed → sent. The remaining N-1 items are stuck in `status='sending'` permanently — never re-claimed by future executions.
- **Solution (applied 2026-03-18):** Set `p_limit: 1` in `claim_queued_emails` call so WF8 only claims 1 email per execution cycle. Combined with the IF guard (catches the spurious loop-back), this ensures exactly 1 email is reliably processed per minute. Throughput (1440/day) far exceeds daily send limit (130/day).
- **Alternative (not yet applied):** Extract the per-email processing into a sub-workflow and use Execute Workflow in a loop. This would allow batch processing without SplitInBatches state issues.
- **Example:** WF8: `claim_queued_emails(p_limit: 1)` + "IF Valid Email Item" guard.
---

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

## SplitInBatches v1 Loop-Back With reset:true Causes Extra Iteration
- **Date:** 2026-02-27
- **Node/Service:** n8n-nodes-base.splitInBatches v1
- **Error:** After processing all items, the loop-back connection feeds the last node's output back into SplitInBatches. With `reset: true`, SplitInBatches treats this as new input and outputs it on Branch 0, causing the downstream chain to fail on invalid data.
- **Root Cause:** `reset: true` clears the internal batch counter when new data arrives. The loop-back sends processed data (e.g., Supabase PATCH response) which gets treated as a new batch item.
- **Solution:** Add an IF guard node immediately after SplitInBatches output[0] that validates the item has the expected fields (e.g., `wave_lead_id` is not empty). False branch goes nowhere (end).
- **Example:** WF8: "IF Valid Email Item" node added between Loop Emails[0] and Check Daily Limit. Checks `$json.wave_lead_id != ""`.
---

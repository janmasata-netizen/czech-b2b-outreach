# Known Issues — Webhook Node

## responseMode "lastNode" conflicts with respondToWebhook node
- **Date:** 2026-02-24
- **Node/Service:** Webhook (trigger) + respondToWebhook
- **Error:** `{"code":0,"message":"Unused Respond to Webhook node found in the workflow"}`
- **Root Cause:** `responseMode: "lastNode"` on the webhook node and a `respondToWebhook` node in the same workflow are mutually exclusive — n8n rejects the combination.
- **Solution:** Use EITHER approach, never both:
  - **Option A (no respondToWebhook node):** Set `responseMode: "lastNode"` — n8n returns the last executed node's output as the HTTP response.
  - **Option B (with respondToWebhook node):** Set `responseMode: "responseNode"` — then add a `respondToWebhook` node at the end of the chain.
- **Example (Option B):**
  ```json
  // Webhook node
  { "responseMode": "responseNode" }

  // respondToWebhook node
  { "respondWith": "firstIncomingItem", "options": { "responseCode": 200 } }
  ```
---

## respondToWebhook responseBody expression returns empty body
- **Date:** 2026-02-24
- **Node/Service:** respondToWebhook (typeVersion 1)
- **Error:** HTTP 200 returned with `Content-Type: application/json` but body length is 0.
- **Root Cause:** `respondWith: "json"` + `responseBody: "={{ JSON.stringify($json) }}"` evaluates to an empty string in this n8n version — the expression is not serialised into the response body.
- **Solution:** Use `respondWith: "firstIncomingItem"` (no `responseBody` field needed). n8n automatically serialises the first incoming item's JSON as the response body.
- **Example:**
  ```json
  {
    "respondWith": "firstIncomingItem",
    "options": { "responseCode": 200 }
  }
  ```
---

## lastNode responseMode returns 500 when parallel branches error (even with neverError)
- **Date:** 2026-03-11
- **Node/Service:** Webhook (responseMode: lastNode) + HTTP Request (neverError: true)
- **Error:** `{"message":"Error in workflow"}` — HTTP 500 returned to caller
- **Root Cause:** When parallel HTTP Request branches return 404/errors, the execution is marked as "error" even with `neverError: true`. In `lastNode` response mode, n8n returns 500 for errored executions instead of the last node's output.
- **Solution:** Add `"continueOnFail": true` (top-level node property) to all HTTP Request nodes in parallel branches. This prevents individual node errors from marking the whole execution as failed.
- **Example:**
  ```json
  {
    "parameters": { "method": "GET", "url": "...", "options": { "neverError": true } },
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "continueOnFail": true
  }
  ```
---

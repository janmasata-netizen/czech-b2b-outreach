# Known Issues — Execute Workflow Node

## Sub-workflow field name must match what the sub-workflow expects
- **Date:** 2026-02-24
- **Node/Service:** Execute Workflow node + sub-workflow trigger
- **Error:** Sub-workflow silently processes `undefined` values — no explicit error, but results are wrong (e.g., cache lookup returns nothing, email field is blank in output).
- **Root Cause:** The parent workflow passes items with field name `email` but the sub-workflow reads `$json.email_address`. The mismatch is silent — n8n doesn't validate field names across workflow boundaries.
- **Solution:** Before calling a sub-workflow, confirm the exact field names its trigger and first nodes expect. Match the parent's output fields to those names exactly.
- **Example:**
  ```js
  // Sub-workflow (email-verification) reads: $json.email_address
  // ✅ Parent must output:
  return [{ json: { email_address: "user@example.com" } }];

  // ❌ Wrong — sub-workflow gets undefined for email_address:
  return [{ json: { email: "user@example.com" } }];
  ```
---

## Activate workflow via POST /activate, not PATCH
- **Date:** 2026-02-24
- **Node/Service:** n8n REST API
- **Error:** `{"message":"PATCH method not allowed"}` when trying to activate a workflow with `PATCH /api/v1/workflows/{id}`.
- **Root Cause:** The n8n API does not support PATCH for workflow activation.
- **Solution:** Use `POST /api/v1/workflows/{id}/activate` to activate and `POST /api/v1/workflows/{id}/deactivate` to deactivate. Use `PUT /api/v1/workflows/{id}` to update workflow content (deactivate first, PUT, then reactivate).
---

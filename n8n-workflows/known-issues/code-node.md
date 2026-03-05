# Known Issues — Code Node

## runOnceForEachItem: return format must be `{ json: {...} }` NOT `[{ json: {...} }]`
- **Date:** 2026-02-24 (clarified 2026-02-27)
- **Node/Service:** Code node (typeVersion 2)
- **Error:** `"A 'json' property isn't an object [item 0]"` / `"In the returned data, every key named 'json' must point to an object."`
- **Root Cause:** In `runOnceForEachItem` mode, you must return a single `{ json: {...} }` object. Returning `[{ json: {...} }]` (wrapped in array) causes the validator to reject it, even if the array has only one item. Fan-out (returning multiple items) is also not supported.
- **Solution:** For single-item return: use `return { json: {...} }`. For fan-out: switch to `"mode": "runOnceForAllItems"` and return an array.
- **Example:**
  ```js
  // ✅ Correct — runOnceForAllItems, returns multiple items
  const items = $input.all();
  const results = [];
  for (const item of items) {
    results.push({ json: { email_address: `a@${item.json.domain}` } });
    results.push({ json: { email_address: `b@${item.json.domain}` } });
  }
  return results;

  // ❌ Wrong — runOnceForEachItem returning array
  return [{ json: { a: 1 } }, { json: { b: 2 } }];
  ```
---

## fetch and require('https') are both disallowed in Code nodes
- **Date:** 2026-02-24 (confirmed from project history)
- **Node/Service:** Code node
- **Error:** Runtime error when calling `fetch(...)` or `require('https')` inside a Code node.
- **Root Cause:** n8n's sandboxed Code node environment blocks both `fetch` and Node's built-in `https` module for security reasons.
- **Solution:** Use HTTP Request nodes for all outbound HTTP calls instead of Code nodes. Move the HTTP call out of the Code node and into a dedicated HTTP Request node in the workflow.
---

## Never spread raw Supabase/PostgREST nested join objects into return
- **Date:** 2026-02-27
- **Node/Service:** Code node (typeVersion 2)
- **Error:** `"A 'json' property isn't an object"` or unexpected nested objects in output.
- **Root Cause:** When using `...emailData` spread on data from a PostgREST response with embedded joins (e.g., `wave_leads(outreach_accounts(...))`), the nested objects get spread into the json return, confusing downstream nodes.
- **Solution:** Always pick specific flat fields explicitly instead of spreading raw API responses. Use `return { json: { id: data.id, email: data.email, ... } }` instead of `return { json: { ...data } }`.
---

## Accessing data from a non-adjacent node
- **Date:** 2026-02-24 (confirmed from project history)
- **Node/Service:** Code node
- **Error:** `$json` only returns data from the immediately upstream node, not from earlier nodes.
- **Root Cause:** `$json` is always the current item from the directly connected upstream node.
- **Solution:** Use `$('NodeName').first().json.fieldName` to reference data from any named node earlier in the execution, regardless of branch position.
- **Example:**
  ```js
  // ✅ Access data from a node two steps back
  const domain = $('Extract Input').first().json.domain;
  ```
---

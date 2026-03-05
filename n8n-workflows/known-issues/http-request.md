# Known Issues — HTTP Request Node

## specifyBody "json" with array expression silently fails
- **Date:** 2026-02-24 (confirmed from project history)
- **Node/Service:** HTTP Request node (typeVersion 4.x)
- **Error:** Request body is empty or malformed when `specifyBody: "json"` is used with an expression that evaluates to an array.
- **Root Cause:** The `jsonBody` field with `specifyBody: "json"` does not correctly handle array-type expressions.
- **Solution:** Switch to raw body mode:
  - `"contentType": "raw"`
  - `"rawContentType": "application/json"`
  - `"body": "={{ JSON.stringify(yourArrayExpression) }}"`
- **Example:**
  ```json
  {
    "contentType": "raw",
    "rawContentType": "application/json",
    "body": "={{ JSON.stringify($json.items) }}"
  }
  ```
---

## fullResponse: true with empty body returns 0 items (kills chain)
- **Date:** 2026-02-24 (confirmed from project history)
- **Node/Service:** HTTP Request node
- **Error:** No items flow to the next node even though the request succeeded.
- **Root Cause:** When `fullResponse: true` is set and the response body is empty, the HTTP Request node outputs 0 items instead of 1, breaking the downstream chain.
- **Solution:** Only use `fullResponse: true` when the response body is guaranteed to be non-empty, OR handle the 0-item output with a Merge or IF node.
---

## Non-standard Content-Type response wrapped in `data` field (not auto-parsed)
- **Date:** 2026-02-24
- **Node/Service:** HTTP Request node
- **Error:** Downstream code reads `$json.Answer` (undefined) even though the server returned valid JSON.
- **Root Cause:** n8n auto-parses responses only when `Content-Type: application/json`. For non-standard types like `application/dns-json`, the response body is returned as a **string** in `$json.data` rather than as a parsed object. So `$json.Answer` is undefined even though the JSON contains `"Answer": [...]`.
- **Solution:** Always guard downstream code with a fallback parse:
  ```js
  let parsed = $input.item.json;
  if (!parsed.Answer && parsed.data && typeof parsed.data === 'string') {
    try { parsed = JSON.parse(parsed.data); } catch (e) {}
  }
  const answers = Array.isArray(parsed.Answer) ? parsed.Answer : [];
  ```
- **Example:** Cloudflare DNS-over-HTTPS (`application/dns-json`) — response is wrapped as `{ data: "{...}" }` instead of being parsed directly.
---

## Empty JSON array response returns 0 items (kills chain)
- **Date:** 2026-02-25
- **Node/Service:** HTTP Request node (typeVersion 4.2)
- **Error:** Downstream nodes never execute when the API returns `[]`.
- **Root Cause:** When the response body is a JSON array, n8n expands it into individual items (one per element). An empty array `[]` → 0 items → execution chain is cut. `fullResponse: true` in `options` does NOT reliably fix this (silently ignored at top level of options in 4.2).
- **Solution:** Add a **Merge node (typeVersion 3, mode: "append")** after the HTTP Request node. Connect the parent node to BOTH the HTTP Request AND to Merge input 0. Connect HTTP Request → Merge input 1. The Merge node always produces ≥1 items because input 0 is always populated. In the downstream Code node, use `$input.all()` and filter by field presence to distinguish row items from pass-through items.
- **Example:** See wf-email-finder-v2 probe path: Wait 2 Minutes → (fork) → Query Bounces + Merge Bounces (input 0); Query Bounces → Merge Bounces (input 1); Merge → Build Probe Response.
---

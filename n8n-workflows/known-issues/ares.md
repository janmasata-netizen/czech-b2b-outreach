# Known Issues — ARES API

## `statutarniOrgan` absent from BE endpoint for newly registered companies
- **Date:** 2026-02-25
- **Node/Service:** HTTP Request → `ekonomicke-subjekty-v-be` endpoint
- **Error:** `Parse ARES Jednatels` returns empty jednatels array despite company having registered directors.
- **Root Cause:** The BE (Basic Business Register) endpoint (`ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}`) does NOT include `statutarniOrgan` for companies where `primarniZdroj: "ros"` (ROS is primary source, not VR). Even when `stavZdrojeVr: "AKTIVNI"` is true, the BE endpoint returns `dalsiUdaje` with only address/name/legal form — NO statutory organ member data.
  - Confirmed for IČO 23934531 (Meisat s.r.o., founded 2025-11-07, `primarniZdroj: "ros"`)
  - The VR entry in `dalsiUdaje` only has: `obchodniJmeno`, `sidlo`, `pravniForma`, `spisovaZnacka` — no clen/fyzickaOsoba
- **Solution:** Always query BOTH the BE endpoint AND the VR-specific endpoint (`ekonomicke-subjekty-v-vr/rest/ekonomicke-subjekty/{ico}`). The VR endpoint returns the full `statutarniOrgan` structure with jednatels.
  - Chain: ARES BE Lookup → ARES VR Lookup → Parse node reads `$json` (VR) + `$('ARES Lookup').first().json` (BE)
  - `neverError: true` on both requests (VR endpoint returns 404 if company not in VR)
- **Example:** wf-email-finder.json — nodes wfef-0004 (BE) + wfef-0013 (VR) + wfef-0005 (Parse, reads both)
---

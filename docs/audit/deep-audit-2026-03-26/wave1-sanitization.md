# Wave 1: Sanitization / Escaping Boundaries Audit

## Summary
10 findings. 2 HIGH, 2 MEDIUM, 2 LOW, 4 no-issue/positive.

## HIGH

### F2: SSRF blocklist bypassable via decimal IP, IPv6 shorthand, DNS rebinding
- **Files:** og.service.ts:271, ai.service.ts:88, content-safety.service.ts:55, stream.service.ts:75
- **Evidence:** Substring matching `blockedHosts.some(h => hostname.includes(h))` bypassed by decimal IP (2130706433), IPv6 mapped, octal notation, DNS rebinding
- **Systemic:** Same pattern in 4 locations

### F7: og/unfurl follows redirects WITHOUT re-validating destination
- **File:** og.service.ts:278 — `redirect: 'follow'` after blocklist check
- **Failure:** Attacker provides allowed domain that 301 redirects to internal IP / cloud metadata endpoint

## MEDIUM

### F1: SanitizePipe does not recurse into nested objects
- Only sanitizes top-level string fields. Nested object strings pass through.

### F3: Sticker generation has no XML delimiter protection (AI prompt injection)
- **File:** stickers.service.ts:361 — direct string interpolation vs ai.service.ts XML tags pattern

## LOW

### F6: SanitizePipe only processes body — query/param strings not sanitized
### F10: HTML strip regex incomplete for edge cases (unclosed tags)

## NO ISSUE (POSITIVE)
### F4: All $queryRawUnsafe properly validated — NO SQL injection
### F5: OG HTML rendering correctly escapes user content
### F8: Upload content-type validation present (client-asserted only — MEDIUM concern)
### F9: Rate limiting well configured with per-endpoint throttles

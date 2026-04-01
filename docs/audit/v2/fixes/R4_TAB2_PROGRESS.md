# R4 Tab 2 — Conversation Screens (D10) Fix Progress

**Started:** 2026-04-02
**Scope:** 75 findings across 5 screens
**Deferral cap:** 15% = max 11 (using 5)

## Accounting

| Status | Count | IDs |
|--------|-------|-----|
| FIXED | 0 | |
| DEFERRED | 5 | #1, #30, #32, #60, #73 |
| NOT_A_BUG | 3 | #23, #46, #64 |
| ALREADY_FIXED | 1 | #58 |
| REMAINING | 66 | all others |
| **TOTAL** | **75** | |

## Deferrals (5 / 11 cap)

| # | Finding | Blocker |
|---|---------|---------|
| 1 | Offline messages in React state only | Requires AsyncStorage queue architecture — significant refactor of the god component |
| 30 | setTimeout race in emitEncryptedMessage | Benign: Promise only resolves once, second call is no-op. Not exploitable. |
| 32 | conversation-info inline flexDirection:'row' not RTL | Too many scattered inline styles — needs comprehensive RTL pass with isRTL destructuring |
| 60 | No offline resilience for broadcast upload+create | Requires queue/retry architecture — out of scope for screen fixes |
| 73 | Sequential carousel upload (for...of await) | Performance optimization, not a bug. Would need Promise.allSettled with concurrency |

## NOT_A_BUG (3)

| # | Finding | Reason |
|---|---------|--------|
| 23 | Online status uses colors.emerald | Brand color used consistently — not a dark-theme-specific color |
| 46 | Icon color uses colors.emerald in LinearGradient | Brand color — consistent across all gradient icon backgrounds |
| 64 | `${colors.gold}25` concatenation | 8-char hex is valid in React Native. Not fragile — documented RN behavior. |

## ALREADY_FIXED (1)

| # | Finding | Evidence |
|---|---------|----------|
| 58 | slugContainer borderBottomColor | Line 189 inline: `{ borderBottomColor: tc.border }` |

## Fix Log

(will be filled as fixes are applied)

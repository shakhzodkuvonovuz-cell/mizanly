# E2E Encryption Master Audit Prompt

> **Purpose:** Paste this ENTIRE prompt into a new Claude Code session to trigger a brutally honest, line-by-line security audit of Mizanly's E2E encryption implementation. The audit must be HARSHER than Trail of Bits, Cure53, or NCC Group — those firms have business incentives to not alienate clients. This audit has no such constraint.
>
> **Context:** This is a messaging app for the global Muslim community. Users include activists, journalists, and religious minorities in surveillance-heavy countries (Egypt, Saudi Arabia, UAE, China, Myanmar, India). A broken encryption implementation doesn't just leak data — it can get people imprisoned, tortured, or killed. Audit accordingly.

---

## THE PROMPT

You are the world's most paranoid cryptographic auditor. Your previous employer was NSA TAO (Tailored Access Operations). You've personally broken E2E encryption in 3 commercial messaging apps. You know every trick — timing attacks, nonce reuse, protocol downgrade, key substitution, metadata correlation, implementation-vs-spec divergence, side-channel extraction, and attacks that don't exist in textbooks yet.

You are auditing Mizanly's Signal Protocol E2E encryption implementation. The developer claims it's "B+ grade." Your job is to prove that's inflated. Find EVERY vulnerability, no matter how theoretical. If you can't break it, explain exactly WHY you can't — that's also valuable.

### YOUR AUDIT METHODOLOGY

**Phase 1: Threat Model Validation (30 min)**
Before looking at code, answer:
- Who are the attackers? (nation-states, telco providers, cloud providers, malicious insiders, device thieves, abusive partners)
- What are they after? (message content, metadata, social graph, location, identity)
- What resources do they have? (unlimited compute, CA certificates, physical device access, insider access to Railway/Neon/Upstash/Cloudflare, legal compulsion)
- What does the implementation CLAIM to protect against vs what it ACTUALLY protects against?

**Phase 2: Protocol Analysis (2 hours)**
Read every line of every file in `apps/mobile/src/services/signal/` (17 files, ~6,500 lines). For each file:
1. Map the data flow: what enters, what exits, what's stored, what's derived
2. Identify every cryptographic operation and verify correctness against Signal spec
3. Identify every place key material exists in memory and trace its lifecycle
4. Identify every error path and what information it leaks
5. Identify every assumption the code makes and verify each one

**Phase 3: Server Analysis (1 hour)**
Read every line of every file in `apps/e2e-server/` (Go, ~1,000 lines) and every E2E-related change in `apps/api/src/` (NestJS). For each:
1. Can the server learn ANY plaintext? (directly or via inference)
2. Can the server substitute keys? (MITM)
3. Can the server deny service? (selective dropping, reordering, delay)
4. Can the server correlate metadata? (timing, size, frequency, social graph)
5. Can a compromised server retroactively break past sessions?

**Phase 4: Attack Scenarios (2 hours)**
Attempt these specific attacks against the implementation:
1. **Nonce reuse:** Find ANY code path where the same (key, nonce) pair encrypts different plaintexts
2. **Session state rollback:** Can a device forensic analyst modify MMKV to re-derive old message keys?
3. **Key substitution MITM:** The Go server is compromised. Can it substitute pre-key bundles without detection?
4. **Plaintext oracle:** Can a malicious client trick the server into revealing whether a ciphertext decrypts to a specific plaintext?
5. **Forward secrecy break:** Compromise a current session key. How many past messages can be decrypted?
6. **Group key theft:** Compromise one group member's device. Can they decrypt messages sent AFTER their removal?
7. **Metadata correlation:** Without breaking encryption, what can the server learn about user behavior?
8. **Push notification analysis:** Can Apple/Google determine which users use E2E encryption?
9. **Replay attack:** Can a previously-seen message be delivered again and accepted?
10. **Downgrade attack:** Can a MITM force the client to use a weaker protocol version?
11. **Memory forensics:** What key material remains in process memory after use?
12. **Timing attack on safety numbers:** Can an attacker determine if a specific identity key matches?
13. **Pre-key exhaustion:** Can an attacker prevent a target from establishing new sessions?
14. **Sender key forgery:** Can a non-group-member inject messages into a group?
15. **Identity key rotation flood:** Can an attacker trigger "[Security code changed]" warnings to train users to ignore them?

**Phase 5: Implementation Quality (1 hour)**
1. Are there any functions that can panic/crash on malformed input?
2. Are there any unbounded allocations (DoS via OOM)?
3. Are there any race conditions in concurrent crypto operations?
4. Are there any places where error messages leak protocol state?
5. Are there any places where the TypeScript types don't match runtime reality?
6. Are there any differences between what the Go server computes and what the TS client expects?

### FILES TO READ (in order)

**Mobile crypto (read every line):**
1. `apps/mobile/src/services/signal/types.ts`
2. `apps/mobile/src/services/signal/crypto.ts`
3. `apps/mobile/src/services/signal/storage.ts`
4. `apps/mobile/src/services/signal/prekeys.ts`
5. `apps/mobile/src/services/signal/x3dh.ts`
6. `apps/mobile/src/services/signal/double-ratchet.ts`
7. `apps/mobile/src/services/signal/session.ts`
8. `apps/mobile/src/services/signal/sender-keys.ts`
9. `apps/mobile/src/services/signal/media-crypto.ts`
10. `apps/mobile/src/services/signal/streaming-upload.ts`
11. `apps/mobile/src/services/signal/safety-numbers.ts`
12. `apps/mobile/src/services/signal/offline-queue.ts`
13. `apps/mobile/src/services/signal/message-cache.ts`
14. `apps/mobile/src/services/signal/search-index.ts`
15. `apps/mobile/src/services/signal/telemetry.ts`
16. `apps/mobile/src/services/signal/e2eApi.ts`
17. `apps/mobile/src/services/signal/index.ts`
18. `apps/mobile/src/services/signal/notification-handler.ts`

**Go E2E Key Server (read every line):**
19. `apps/e2e-server/cmd/server/main.go`
20. `apps/e2e-server/internal/handler/handler.go`
21. `apps/e2e-server/internal/store/postgres.go`
22. `apps/e2e-server/internal/middleware/auth.go`
23. `apps/e2e-server/internal/middleware/ratelimit.go`
24. `apps/e2e-server/internal/model/types.go`

**NestJS E2E changes (read the E2E-specific sections):**
25. `apps/api/src/modules/messages/messages.service.ts` — sendMessage, editMessage, deleteMessage, search, forward
26. `apps/api/src/gateways/chat.gateway.ts` — handleMessage E2E passthrough
27. `apps/api/src/gateways/dto/send-message.dto.ts` — E2E field validation
28. `apps/api/src/modules/messages/internal-e2e.controller.ts` — webhook endpoint
29. `apps/api/prisma/schema.prisma` — E2E models and fields

**Tests (verify coverage completeness):**
30. All files in `apps/mobile/src/services/signal/__tests__/`
31. `apps/api/src/modules/messages/messages.e2e-fields.spec.ts`

**Plans (verify implementation matches design):**
32. `docs/plans/2026-03-27-signal-protocol-decision-log.md`
33. `~/.claude/plans/tidy-exploring-key.md`

### OUTPUT FORMAT

For EACH finding:
```
## FINDING [number]: [title]

**Severity:** CRITICAL / HIGH / MEDIUM / LOW / INFORMATIONAL
**File:** exact/path/to/file.ts
**Line(s):** exact line numbers
**CWE:** CWE-xxx (if applicable)

**Description:**
[What is wrong, in precise technical detail]

**Attack Scenario:**
[Step-by-step how an attacker exploits this]

**Impact:**
[What data is exposed, what trust is broken]

**Proof of Concept:**
[Pseudocode or exact steps to reproduce]

**Recommendation:**
[Exact fix needed, with code if possible]
```

### GRADING CRITERIA

After all findings, assign a grade using this STRICT scale:

| Grade | Criteria |
|-------|---------|
| **A+** | No findings above INFORMATIONAL. Formal verification completed. Post-quantum. Key transparency. Sealed sender. Certificate pinning. Native crypto module. Professional audit passed. |
| **A** | No CRITICAL or HIGH findings. All MEDIUM findings have mitigations documented. Post-quantum planned. Key transparency planned. Native crypto. |
| **A-** | No CRITICAL findings. Max 2 HIGH findings with clear remediation path. Native crypto or migration in progress. |
| **B+** | No CRITICAL findings. Some HIGH findings. Protocol logic correct. Primitives audited. Good test coverage. JS runtime limitations acknowledged. |
| **B** | 1-2 CRITICAL findings with clear fix. Protocol mostly correct. Good primitives. Adequate tests. |
| **B-** | Multiple HIGH findings. Some protocol deviations. Test gaps. |
| **C** | CRITICAL findings that break encryption. Protocol errors. Missing tests. |
| **D** | Encryption is fundamentally broken. Plaintext exposed. |
| **F** | No real encryption. Security theater. |

### WHAT MAKES THIS AUDIT HARSHER THAN COMMERCIAL

1. **No business relationship.** Commercial auditors want repeat business. They soften findings. You don't.
2. **Nation-state threat model.** Commercial audits usually assume "motivated attacker." You assume NSA/FSB/MSS with unlimited resources.
3. **JavaScript penalty.** Any crypto in JavaScript gets an automatic severity bump. JS cannot provide constant-time guarantees. Period.
4. **No "accepted risk."** Commercial audits let clients mark findings as "accepted risk." You don't accept that. Every finding needs a fix or a genuine "cannot be fixed in this language/platform" explanation.
5. **Metadata counts.** Commercial audits focus on content protection. You also audit metadata leakage — who talks to whom, when, how often, message sizes. For activists, metadata is often more dangerous than content.
6. **Test coverage audit.** You verify that tests actually test what they claim. A test that passes on happy path but doesn't test the failure mode is worse than no test — it provides false confidence.
7. **Spec compliance.** You compare every cryptographic operation against the Signal Protocol specification (signal.org/docs) and flag EVERY deviation, even if the deviation is arguably an improvement.

### FINAL INSTRUCTION

Be brutally honest. The developer can handle it — they've been told repeatedly that "acceptable" is not a valid finding resolution. If the grade is C, say C. If the implementation has a fundamental flaw that makes E2E claims fraudulent, say so. People's lives may depend on the honesty of this audit.

Do NOT:
- Soften findings to be nice
- Mark anything as "acceptable risk"
- Skip theoretical attacks because they're "unlikely"
- Grade on a curve because "it's good for a pre-launch product"
- Praise the code to balance criticism (save praise for a separate section at the end)

DO:
- Read every line of every file listed above
- Trace every key through its complete lifecycle
- Verify every cryptographic operation against the Signal spec
- Attempt every attack scenario listed above
- Grade strictly against the scale provided
- Recommend exact fixes with code where possible

Begin the audit.

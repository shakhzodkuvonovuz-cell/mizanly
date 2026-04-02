# YOU ARE TAB 3. YOUR AUDIT FILES ARE T06 + T01. DO NOT SPAWN SUBAGENTS.

# TEST WRITING SESSION — Wave 7 Tab 3: Messages/Chat-Export/Stickers/Chat Gateway + Auth/Users/2FA/Devices/Settings/Privacy

> ~147 test gaps across 2 audit files. T06 (98 gaps in 113 rows): messages, chat-export, stickers, chat.gateway. T01 (49 gaps in 57 rows): auth, users, two-factor, devices, settings, privacy.
> **YOUR JOB: Read T06.md + T01.md. Write the missing tests. Do NOT modify source code.**

---

## WHAT THIS SESSION IS

TEST WRITING only. Write `.spec.ts` tests that close the gaps described in the audit files.

---

## RULES — NON-NEGOTIABLE

### RULE 0: YOU ARE BEING AUDITED
### RULE 1: EVERY TEST MUST PASS — `pnpm test -- --testPathPattern=<module>` after each batch.
### RULE 2: ASSERT SPECIFIC BEHAVIOR — return values, thrown exceptions, mock call args. No `toBeDefined()` stubs.
### RULE 3: MATCH EXISTING PATTERNS — read existing specs first. Use `globalMockProviders`, `PrismaService` mock.

**For chat.gateway (WebSocket) tests**, read `apps/api/src/gateways/chat.gateway.spec.ts` carefully. WebSocket gateway tests use a different pattern:
```typescript
describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let mockSocket: any;
  beforeEach(async () => {
    mockSocket = { id: 'sock1', handshake: { query: { userId: 'u1' } }, emit: jest.fn(), join: jest.fn() };
    // ... module setup
  });
  it('should handle send_message event', async () => {
    const result = await gateway.handleSendMessage(mockSocket, { conversationId: 'c1', content: 'hello' });
    expect(result.success).toBe(true);
  });
});
```

### RULE 4: PRIORITIZE C > H > M.

**T01 has 7 CRITICAL findings** — compliance paths (COPPA, GDPR terms, account deletion, rate-limiting). These are the MOST IMPORTANT tests in this entire wave. Get them right.

**T06 has 28 CRITICAL findings** — message encryption, sealed sender, key exchange. Security-critical paths.

### RULE 5: ADD TO EXISTING SPEC FILES.
### RULE 6: CHECKPOINT = TEST + COMMIT per T-file.
### RULE 7: NO SUBAGENTS. NO CO-AUTHORED-BY. NO SOURCE CODE CHANGES.
### RULE 8: TOTAL ACCOUNTING in `docs/audit/v2/fixes/W7_TAB3_PROGRESS.md`.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md`
2. Read both audit files IN FULL:
   - `docs/audit/v2/wave7/T06.md` (113 rows — messages, chat-export, stickers, chat.gateway)
   - `docs/audit/v2/wave7/T01.md` (57 rows — auth, users, two-factor, devices, settings, privacy)
3. Read existing spec files — CRITICAL for matching patterns:
   - `apps/api/src/modules/messages/messages.service.spec.ts` (896 lines)
   - `apps/api/src/gateways/chat.gateway.spec.ts` (1400+ lines)
   - `apps/api/src/modules/auth/auth.service.spec.ts`
   - `apps/api/src/modules/users/users.service.spec.ts`
4. Read `apps/api/src/common/test/mock-providers.ts`

---

## YOUR SCOPE

```
# T06 modules
apps/api/src/modules/messages/         # 2,599 source, 2,086 test lines
apps/api/src/modules/chat-export/      # 282 source, 250 test lines
apps/api/src/modules/stickers/         # 576 source, 326 test lines
apps/api/src/gateways/chat.gateway.ts  # 1,020 source, 1,447 test lines

# T01 modules
apps/api/src/modules/auth/            # ~500 source, ~200 test lines
apps/api/src/modules/users/           # ~2,000 source, ~600 test lines
apps/api/src/modules/two-factor/      # ~400 source, ~350 test lines
apps/api/src/modules/devices/         # ~300 source, ~150 test lines
apps/api/src/modules/settings/        # ~500 source, ~200 test lines
apps/api/src/modules/privacy/         # ~300 source, ~200 test lines
```

**T06 KEY GAPS:**
- Messages: `forwardMessage`, `editMessage`, `deleteForEveryone`, `translateMessage` service methods untested (28 C-severity)
- Messages: E2E encryption field validation (`encryptedContent`, `e2eVersion`, `senderDeviceId`) not verified in send flow
- Messages: sealed sender persistence in `sendMessage` untested
- Chat Gateway: `typing`, `read_receipt`, `reaction`, `presence_update` events — most only test happy path, no error/rate-limit/permission paths
- Stickers: `createPack` ownership check, `setDefaultPack` service logic untested

**T01 KEY GAPS:**
- Auth: COPPA age check (<13 rejection), terms rejection, re-registration within 30-day deletion, rate-limit >5 attempts — ALL 4 are C-severity compliance paths with ZERO tests
- Users: `requestAccountDeletion`, `cancelAccountDeletion`, `reactivateAccount` — 3 C-severity lifecycle endpoints with ZERO tests
- Users: 11 controller endpoints with zero delegation tests
- Two-factor: `verify` happy path (enable 2FA), `useBackupCode` happy path (consume code), `disable` happy path — all untested
- Settings: `isQuietModeActive` 4-branch schedule logic — zero tests
- Privacy: `processScheduledDeletions` cron — zero test coverage

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test -- --testPathPattern=messages
cd apps/api && pnpm test -- --testPathPattern=chat-export
cd apps/api && pnpm test -- --testPathPattern=stickers
cd apps/api && pnpm test -- --testPathPattern=gateway
cd apps/api && pnpm test -- --testPathPattern=auth
cd apps/api && pnpm test -- --testPathPattern=users
cd apps/api && pnpm test -- --testPathPattern=two-factor
cd apps/api && pnpm test -- --testPathPattern=devices
cd apps/api && pnpm test -- --testPathPattern=settings
cd apps/api && pnpm test -- --testPathPattern=privacy
cd apps/api && pnpm test   # All tests
```

---

## WORK ORDER

1. **T01 Critical first** (7 C-severity compliance tests) — auth COPPA/terms/rate-limit, users account deletion lifecycle
2. **T01 remaining** — two-factor happy paths, settings schedule logic, privacy crons
3. Commit: `test(api): W7-T3 CP1 — T01 auth/users/2FA/settings/privacy [N tests]`
4. **T06 Critical** (28 C-severity message security tests) — forward/edit/delete/translate, E2E fields, sealed sender
5. **T06 remaining** — gateway events, stickers, chat-export
6. Commit: `test(api): W7-T3 CP2 — T06 messages/gateway/stickers [N tests]`

---

## DELIVERABLES
- **170/170 rows documented** (113 + 57)
- **~130+ new `it()` blocks** (heavy due to C-severity density)
- **All tests pass**
- **2 commits**

**147 test gaps. 35 are CRITICAL compliance/security paths. Get those right first. Begin.**

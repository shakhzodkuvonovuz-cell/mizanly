# YOU ARE TAB 2. YOUR AUDIT FILES ARE T11 + T13. DO NOT SPAWN SUBAGENTS.

# TEST WRITING SESSION — Wave 7 Tab 2: Islamic/Mosques/Halal/Scholar-QA/Live/Audio-Rooms/Broadcast + Queue Processors

> ~146 test gaps across 2 audit files. T11 (115 gaps in 124 rows): islamic, mosques, halal, scholar-qa, live, audio-rooms, broadcast. T13 (31 gaps in 37 rows): queue processors (notification, analytics, search-indexing, ai-tasks, webhook).
> **YOUR JOB: Read T11.md + T13.md. Write the missing tests. Do NOT modify source code.**

---

## WHAT THIS SESSION IS

TEST WRITING only. The audit files list methods/endpoints lacking test coverage. Write `.spec.ts` tests that close these gaps. Every test must compile and pass.

---

## RULES — NON-NEGOTIABLE

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will `pnpm test` and count new `it()` blocks. Failures, weak assertions, and duplicates don't count.

### RULE 1: EVERY TEST MUST PASS
Run `pnpm test -- --testPathPattern=<module>` after each batch. Fix failures before committing.

### RULE 2: ASSERT SPECIFIC BEHAVIOR
Every `it()` must assert: return values, thrown exceptions, mock call args, or side effects. `toBeDefined()` alone doesn't count.

### RULE 3: MATCH EXISTING PATTERNS
Read 2-3 existing spec files per module first. Use `@nestjs/testing`, `globalMockProviders`, `PrismaService` mock. For queue processors, read the existing processor spec files to understand `@InjectQueue` mocking and job handler testing patterns.

**Processor test pattern:**
```typescript
describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [...globalMockProviders, NotificationProcessor, mockDeps],
    }).compile();
    processor = module.get(NotificationProcessor);
  });
  it('should process push-trigger job', async () => {
    const job = { data: { userId: 'u1', title: 'Test' }, id: 'j1' } as any;
    await processor.handlePushTrigger(job);
    expect(pushService.sendPush).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
  });
});
```

### RULE 4: PRIORITIZE C > H > M. Skip L/I unless C/H/M are done.

### RULE 5: ADD TO EXISTING SPEC FILES where they exist. Create new ones only when needed.

### RULE 6: CHECKPOINT = TEST + COMMIT per T-file.
Format: `test(api): W7-T2 CP[N] — [modules] [N new tests]`

### RULE 7: NO SUBAGENTS. NO CO-AUTHORED-BY. NO SOURCE CODE CHANGES.

### RULE 8: TOTAL ACCOUNTING in `docs/audit/v2/fixes/W7_TAB2_PROGRESS.md`.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md`
2. Read both audit files IN FULL:
   - `docs/audit/v2/wave7/T11.md` (124 rows — islamic, mosques, halal, scholar-qa, live, audio-rooms, broadcast)
   - `docs/audit/v2/wave7/T13.md` (37 rows — queue processors)
3. Read existing spec files:
   - `apps/api/src/modules/islamic/islamic.service.spec.ts` (and all 6 spec files)
   - `apps/api/src/modules/islamic/islamic.controller.spec.ts`
   - `apps/api/src/common/queue/processors/notification.processor.spec.ts`
4. Read `apps/api/src/common/test/mock-providers.ts`

---

## YOUR SCOPE

```
# T11 modules
apps/api/src/modules/islamic/       # 3,725 source, 3,123 test lines (6 spec files)
apps/api/src/modules/mosques/       # 295 source, 290 test lines
apps/api/src/modules/halal/         # 316 source, 305 test lines
apps/api/src/modules/scholar-qa/    # 251 source, 318 test lines
apps/api/src/modules/live/          # 693 source, 680 test lines (4 spec files)
apps/api/src/modules/audio-rooms/   # 736 source, 816 test lines
apps/api/src/modules/broadcast/     # 503 source, 636 test lines

# T13 modules
apps/api/src/common/queue/processors/   # 6 processor files
apps/api/src/common/queue/queue.service.ts
```

**T11 KEY GAPS — Islamic module is the biggest:**
- 32 controller endpoints with zero delegation tests (the controller has 55 endpoints total!)
- Islamic service: prayer notification scheduling logic untested
- Islamic service: Ramadan/fasting progress calculations untested
- Mosques: follow/unfollow service logic only has delegation tests
- Live: host controls (mute/kick/promote) service logic partial coverage
- Audio-rooms: real-time participant management untested
- Broadcast: subscriber count, message send, moderation — partial

**T13 KEY GAPS — Queue processors:**
- `analytics.processor` — XP award edge cases untested (level-up thresholds, streak handling)
- `webhook.processor` — retry/failure/dead-letter logic untested
- `search-indexing.processor` — bulk index path untested
- `ai-tasks.processor` — moderation decision paths untested

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test -- --testPathPattern=islamic
cd apps/api && pnpm test -- --testPathPattern=mosques
cd apps/api && pnpm test -- --testPathPattern=halal
cd apps/api && pnpm test -- --testPathPattern=scholar
cd apps/api && pnpm test -- --testPathPattern=live
cd apps/api && pnpm test -- --testPathPattern=audio-room
cd apps/api && pnpm test -- --testPathPattern=broadcast
cd apps/api && pnpm test -- --testPathPattern=processor
cd apps/api && pnpm test   # All tests
```

---

## WORK ORDER

1. **T11** — Start with islamic controller (32 missing delegation tests), then service gaps, then mosques/halal/scholar-qa/live/audio-rooms/broadcast
2. Commit: `test(api): W7-T2 CP1 — T11 islamic/mosques/halal/live/broadcast [N tests]`
3. **T13** — Queue processor gaps
4. Commit: `test(api): W7-T2 CP2 — T13 queue processors [N tests]`

---

## DELIVERABLES
- **161/161 rows documented** (124 + 37)
- **~120+ new `it()` blocks**
- **All tests pass**
- **2 commits**

**146 test gaps. Read the source. Write the tests. Run them. Fix failures. Commit. Begin.**

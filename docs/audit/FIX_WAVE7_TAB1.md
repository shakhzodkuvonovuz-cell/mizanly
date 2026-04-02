# YOU ARE TAB 1. YOUR AUDIT FILES ARE T04 + T07. DO NOT SPAWN SUBAGENTS.

# TEST WRITING SESSION — Wave 7 Tab 1: Threads/Majlis-Lists/Communities + Stories/Story-Chains/Notifications/Webhooks

> ~144 test gaps across 2 audit files. T04 (110 gaps in 170 rows): threads, majlis-lists, communities, community, community-notes. T07 (34 gaps in 40 rows): stories, story-chains, notifications, webhooks.
> **YOUR JOB: Read T04.md + T07.md. Write the missing tests described in those files. Do NOT modify source code.**

---

## WHAT THIS SESSION IS

This is a TEST WRITING session, not a bug-fix session. The audit files list methods/endpoints that lack test coverage. Your job is to write new tests (`.spec.ts` files or new `describe`/`it` blocks in existing spec files) that close these gaps. Every test must compile and pass.

---

## RULES — NON-NEGOTIABLE

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will `pnpm test` your changes and count the new `it()` blocks. Tests that fail, tests that assert nothing meaningful, and tests that duplicate existing coverage do NOT count.

### RULE 1: EVERY TEST MUST PASS
After writing tests for each module, run the test command. Fix any failures YOU introduced before committing. If a test fails because the source code has a genuine bug, write the test asserting CORRECT behavior and add a `// BUG: <description>` comment, then skip the test with `it.skip` and document it.

### RULE 2: ASSERT SPECIFIC BEHAVIOR
Every `it()` block must assert something specific:
- A return value shape/content
- A specific exception type thrown (`rejects.toThrow(NotFoundException)`)
- A Prisma/service method called with specific arguments (`toHaveBeenCalledWith(expect.objectContaining({...}))`)
- A side effect verified (notification created, Redis key set, queue job added)

**WEAK assertions that don't count:** `toBeDefined()`, `toBeTruthy()`, `toHaveBeenCalled()` without args, `expect(result).not.toBeNull()`.

### RULE 3: MATCH EXISTING PATTERNS
Before writing ANY test, read 2-3 existing spec files in the same module to understand:
- How `TestingModule` is set up with `Test.createTestingModule`
- Which mock providers are used (`globalMockProviders` from `../../common/test/mock-providers`)
- How `PrismaService` is mocked (per-model `jest.fn()`)
- How the service-under-test is instantiated
- How controller tests mock the service and verify delegation

**Pattern for service tests:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { MyService } from './my.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MyService', () => {
  let service: MyService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [...globalMockProviders, MyService, {
        provide: PrismaService,
        useValue: { model: { findUnique: jest.fn(), create: jest.fn(), /* etc */ } },
      }],
    }).compile();
    service = module.get<MyService>(MyService);
    prisma = module.get(PrismaService);
  });

  describe('myMethod', () => {
    it('should return X when Y', async () => {
      prisma.model.findUnique.mockResolvedValue({ id: '1', name: 'test' });
      const result = await service.myMethod('1');
      expect(result.name).toBe('test');
    });
    it('should throw NotFoundException when not found', async () => {
      prisma.model.findUnique.mockResolvedValue(null);
      await expect(service.myMethod('999')).rejects.toThrow(NotFoundException);
    });
  });
});
```

**Pattern for controller tests:**
```typescript
describe('MyController', () => {
  it('should delegate to service.myMethod', async () => {
    mockService.myMethod.mockResolvedValue({ id: '1' });
    const result = await controller.myMethod('1', mockUser);
    expect(mockService.myMethod).toHaveBeenCalledWith('1', mockUser.id);
    expect(result).toEqual({ id: '1' });
  });
});
```

### RULE 4: PRIORITIZE BY SEVERITY
**C (Critical)** findings first — these are untested authorization, data-loss, or compliance paths. Then **H (High)**, then **M (Medium)**. Skip **L/I** unless you finish C/H/M.

### RULE 5: ADD TO EXISTING SPEC FILES
If a spec file exists for the module (e.g., `threads.service.spec.ts`), add new `describe`/`it` blocks there. Only create a NEW spec file if none exists or the audit explicitly says "no spec file."

### RULE 6: CHECKPOINT = TEST + COMMIT
After each T-file's tests: run all affected tests, verify pass, commit.
Format: `test(api): W7-T1 CP[N] — [modules] [N new tests]`

### RULE 7: NO SUBAGENTS. NO CO-AUTHORED-BY. NO SOURCE CODE CHANGES.

### RULE 8: TOTAL ACCOUNTING
Create `docs/audit/v2/fixes/W7_TAB1_PROGRESS.md`. For every finding row (all 170 + 40 = 210 rows), mark: TESTED (new test), EXISTING (already covered), SKIPPED (with reason). The equation: `TESTED + EXISTING + SKIPPED = TOTAL_ROWS`.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Build & Test and Testing Rules sections
2. Read BOTH audit files IN FULL:
   - `docs/audit/v2/wave7/T04.md` (170 rows — threads, majlis-lists, communities, community, community-notes)
   - `docs/audit/v2/wave7/T07.md` (40 rows — stories, story-chains, notifications, webhooks)
3. For EACH module, read 2-3 existing spec files to understand mocking patterns:
   - `apps/api/src/modules/threads/threads.service.spec.ts`
   - `apps/api/src/modules/threads/threads.controller.spec.ts`
   - `apps/api/src/modules/stories/stories.service.spec.ts`
4. Read `apps/api/src/common/test/mock-providers.ts` for shared mocks
5. Create progress file

---

## YOUR SCOPE

```
# T04 modules (threads, majlis-lists, communities)
apps/api/src/modules/threads/          # 1,537 source lines, 1,815 test lines
apps/api/src/modules/majlis-lists/     # 538 source lines, 810 test lines
apps/api/src/modules/communities/      # Check for service + controller
apps/api/src/modules/community/        # May overlap with communities
apps/api/src/modules/community-notes/  # Check for service + controller

# T07 modules (stories, story-chains, notifications, webhooks)
apps/api/src/modules/stories/          # 813 source lines, 2,792 test lines
apps/api/src/modules/story-chains/     # 278 source lines, 284 test lines
apps/api/src/modules/notifications/    # 1,338 source lines, 1,475 test lines
apps/api/src/modules/webhooks/         # 288 source lines, 384 test lines
```

**T04 KEY GAPS — threads module has the most critical untested paths:**
- `canReply()` — 5 permission branches, zero tests (C severity)
- `createContinuation()` — thread chain creation, zero tests (C severity)
- `updateThread()` — edit with auth check, zero tests (C severity)
- 9 controller endpoints with zero delegation tests
- P2002 race condition catches in `bookmark()`, `like()`, `votePoll()`
- Community CRUD: many endpoints only have controller delegation tests, service logic untested

**T07 KEY GAPS — stories has good coverage but:**
- `markViewed()` — creates view record, fires notification+gamification. Partial coverage only.
- Story-chains service: only 2 out of 5 methods tested
- Notification dedup/batching logic untested
- Webhook retry/failure paths untested

---

## TEST COMMANDS
```bash
cd apps/api && pnpm test -- --testPathPattern=threads
cd apps/api && pnpm test -- --testPathPattern=majlis
cd apps/api && pnpm test -- --testPathPattern=communit
cd apps/api && pnpm test -- --testPathPattern=stories
cd apps/api && pnpm test -- --testPathPattern=story-chain
cd apps/api && pnpm test -- --testPathPattern=notification
cd apps/api && pnpm test -- --testPathPattern=webhooks
cd apps/api && pnpm test   # All tests (run before final commit)
```

---

## WORK ORDER

1. **T04 — threads** (biggest gap, C-severity items): Write tests for `canReply`, `createContinuation`, `updateThread`, controller delegation gaps, P2002 catches
2. **T04 — majlis-lists, communities**: Fill remaining gaps
3. `pnpm test -- --testPathPattern="threads|majlis|communit"` → fix failures
4. Commit: `test(api): W7-T1 CP1 — T04 threads/majlis/communities [N tests]`
5. **T07 — stories, story-chains, notifications, webhooks**: Fill gaps
6. `pnpm test -- --testPathPattern="stories|story-chain|notification|webhook"` → fix failures
7. Commit: `test(api): W7-T1 CP2 — T07 stories/notifications [N tests]`

---

## DELIVERABLES

- **210/210 rows documented** (TESTED / EXISTING / SKIPPED)
- **~100+ new `it()` blocks** across affected spec files
- **All tests compile and pass** (`pnpm test` green)
- **Progress file** with per-finding status
- **2 atomic commits**

**144 test gaps. Read the source. Write the tests. Run them. Fix failures. Commit. Begin.**

# Codex Hardening Plan 2026-03-26

## Purpose

This file is not an audit.

It is an execution document for stabilizing the repo after the audit findings in `docs/audit/CODEX_AUDIT_2026-03-26.md`.

The goal is to give any follow-on agent a clear operating model for what to do next, in what order, and why.

This plan assumes the codebase has already crossed the point where:

- feature breadth is ahead of systems maturity
- local module fixes are no longer enough to create platform confidence
- hidden coupling and permissive fallbacks are amplifying risk

The right response is not "debug everything."

The right response is:

- stop the bleeding
- restore platform truth
- then harden for performance and scale

## Core Principle

Do not optimize for "more fixed files."

Optimize for fewer lies in the system.

That means:

- no fake-success infra
- no hidden duplicate ownership of side effects
- no approximate truth on auth, money, publication, lifecycle, notifications, or indexing
- no cross-module contracts that only exist in tribal knowledge

## How To Use This Plan

The executing agent should:

1. Read this file first.
2. Read `docs/audit/CODEX_AUDIT_2026-03-26.md` second.
3. Treat this file as the sequencing and prioritization layer.
4. Treat the audit file as evidence and issue inventory.
5. Prefer end-to-end fixes for one invariant over shallow fixes across many modules.

The executing agent should not:

- start with cosmetic refactors
- spread work across low-severity issues for momentum
- add new features while core truth paths remain approximate
- keep permissive fallback behavior unless explicitly reclassified as acceptable

## Non-Negotiable Invariants

Before phase work begins, the agent should treat these as load-bearing platform invariants:

1. Auth/account state must be truthful everywhere.
2. Money state must have one authoritative source of truth.
3. Publication state must mean the same thing across feeds, search, notifications, and scheduling.
4. Notification creation and delivery ownership must be singular and explicit.
5. Search indexing must use a valid producer/consumer contract and reflect canonical state.
6. Deactivated/banned/deleted entities must obey one visibility policy across all surfaces.
7. Realtime presence and membership-derived behavior must not silently degrade by arbitrary caps.
8. Required infrastructure must fail loudly when absent, not simulate success.

## Success Criteria By Phase

### Stop The Bleeding

Success means:

- the repo stops pretending broken systems are healthy
- obviously false success paths are removed
- build/tooling breakages are fixed
- the highest-risk contract mismatches are closed
- new feature work can no longer pile onto fake foundations as easily

### Restore Platform Truth

Success means:

- core workflows have one owner and one contract
- cross-module semantics agree
- denormalized or derived state is either transactional or repairable
- side effects are explicit and testable
- key user-visible truths are consistent across surfaces

### Performance And Scale Safety

Success means:

- hot paths are designed for hostile scale rather than flattering traffic
- capped reads and partial fan-out are removed from critical flows
- platform behavior under burst load and partial failure is observable and bounded
- the team has operational truth, not just logs and hope

---

## Phase 1: Stop The Bleeding

### Objective

Shut down the most dangerous failure patterns immediately:

- fake-success runtime behavior
- broken internal contracts
- duplicated side-effect ownership
- known build/tooling breakage
- infrastructure-optional behavior in infrastructure-required paths

### Phase 1 Deliverables

1. Clean build health for the current workspace checks.
2. No silent no-op mode for required Redis/queue behavior in environments that claim readiness.
3. No unsupported queue action contracts.
4. No double-owned notification delivery path.
5. No scheduler-vs-runtime disagreement on what "published" means.
6. A short written list of what is now treated as required infrastructure.

### Phase 1 Workstreams

#### 1. Build And Tooling Triage

Fix first:

- mobile typecheck break in `apps/mobile/app/(tabs)/bakra.tsx`
- root lint wiring
- placeholder lint scripts

Definition of done:

- root verification commands represent real checks
- the team can trust CI/build failure as a real signal

#### 2. Remove Fake-Success Infrastructure Paths

Target:

- Redis proxy/no-op behavior
- queue no-op behavior
- worker disablement patterns that leave the app "running" but semantically broken

Immediate rule:

- if a path depends on Redis for correctness, idempotency, delivery, throttling, presence, or jobs, failure must be explicit

Actions:

- classify environments where Redis is required
- fail startup or fail operation in those environments
- remove fake `OK` / fake `PONG` / fake counters as success substitutes
- stop returning healthy-looking queue/job results when work is being dropped

Definition of done:

- operator-visible failure replaces silent degradation

#### 3. Fix Internal Producer/Consumer Contract Breaks

Start with search indexing.

Known issue:

- `VideosService` emits `action: 'upsert'`
- the search queue contract only handles `index | update | delete`

Actions:

- unify the queue contract
- reject invalid actions hard
- update producers and consumers together
- audit other internal contracts for the same pattern

Definition of done:

- no queue producer can emit an action the consumer treats as "unknown warning"

#### 4. Eliminate Duplicate Notification Ownership

Current problem:

- `NotificationsService.create()` already performs push and realtime fan-out
- some callers also enqueue extra push jobs after notification creation

Actions:

- choose one contract

Option A:

- `create()` persists only
- all delivery is handled elsewhere

Option B:

- `create()` owns delivery
- callers never separately trigger push for the same notification

Preferred direction:

- pick one and apply it universally

Definition of done:

- no caller has to know hidden downstream delivery behavior
- exactly one logical delivery chain exists per notification

#### 5. Freeze Publication Semantics

Current problem:

- scheduler bulk-publishes by mutating `scheduledAt`
- other systems infer publication in inconsistent ways

Actions:

- define a single publication workflow per content type
- stop using `scheduledAt = null` as the only publication event
- ensure scheduled publication triggers the same downstream contracts as manual publication

Minimum downstream contracts to align:

- visibility
- notification behavior
- search/indexing behavior
- any feed/cache invalidation behavior

Definition of done:

- "published" means one thing everywhere

#### 6. Stop Trusting Soft Lifecycle Semantics

Current problem:

- lifecycle visibility rules differ across search, feeds, and other surfaces

Actions:

- define one shared policy for:
  - banned
  - deactivated
  - deleted
  - private
- apply it to all major read surfaces

Definition of done:

- one account state produces one consistent visibility outcome platform-wide

### Phase 1 Recommended Order

1. Fix build/tooling trust.
2. Remove fake-success infra.
3. Fix internal queue/search contract mismatches.
4. Remove duplicate notification delivery ownership.
5. Unify publication semantics.
6. Unify lifecycle visibility semantics.

### Phase 1 Exit Criteria

Do not move to Phase 2 until:

- the app can no longer claim healthy operation while dropping critical work silently
- build/lint/typecheck represent reality
- the worst cross-module contract mismatches are closed
- notification and publication semantics have single owners

---

## Phase 2: Restore Platform Truth

### Objective

Turn critical workflows from "a pile of cooperating assumptions" into explicit system transactions with clear invariants.

This phase is about correctness and truthfulness, not throughput.

### Phase 2 Deliverables

1. One source of truth for money state.
2. One explicit trust-boundary model for auth/account sync.
3. One publication workflow per content family.
4. One lifecycle model with unambiguous field meaning.
5. Reconciliation for counters and derived state that can drift.
6. Integration tests for platform invariants, not just service methods.

### Phase 2 Workstreams

#### 1. Unify Money State

Known issues:

- `CoinBalance` is treated as real balance state
- legacy `User.coinBalance` is acknowledged stale/wrong
- payment and subscription reconciliation still fall back to heuristics

Actions:

- remove or deprecate legacy money fields aggressively
- make one ledger/balance path authoritative
- formalize reconciliation inputs and storage
- stop using Redis TTL mappings as quasi-authoritative payment linkage
- add repair tooling for mismatched subscription/tip/balance state

Required invariants:

- one balance source of truth
- no read path can consult stale balance mirrors
- payment lifecycle states are durable and queryable
- operator can answer "what happened?" for any payment entity

#### 2. Harden Auth And Account Truth

Known issues:

- missing Clerk webhook coverage
- stale request user object after auto-unban
- optional guard silently downgrades invalid/disallowed auth into anonymous behavior

Actions:

- define strict rules for:
  - hard auth failure
  - anonymous access
  - state mutation during request auth
- complete Clerk sync coverage for relevant lifecycle/session/profile events
- ensure `request.user` reflects final authoritative state if mutations occur

Required invariants:

- request identity is state-truthful
- app account state and Clerk state converge deterministically
- no silent auth downgrade in places where policy should be explicit

#### 3. Rebuild Publication Pipelines As Workflows

Content families:

- posts
- threads
- reels
- videos
- scheduled variants of the above

Actions:

- create explicit publish workflows
- centralize:
  - visibility transition
  - index updates
  - notifications
  - cache invalidation
  - downstream analytics signals if needed

Required invariants:

- publish now and scheduled publish produce the same downstream truth
- removal/unpublish paths also have defined side effects

#### 4. Fix Lifecycle Semantics

Known issues:

- `deletedAt` overloaded between scheduled deletion and actual deletion
- deactivation and deletion semantics overlap

Actions:

- separate fields and meanings
- stop using one field for multiple states
- update any jobs/queries/controllers that depend on those semantics

Suggested model:

- `deactivatedAt`
- `deletionRequestedAt`
- `scheduledDeletionAt`
- `deletedAt`

Required invariants:

- every lifecycle field has one meaning
- retention, analytics, admin, and visibility logic can reason from fields directly

#### 5. Repair Or Reclassify Denormalized State

Target classes:

- followers/following counts
- posts/reels/threads/videos counts
- unread counts
- message previews
- hashtag counters
- notification aggregates
- creator stats snapshots

For each denormalized field, decide one of:

- transaction-critical and must remain exact
- asynchronously derived but repairable
- approximate and explicitly documented as approximate

Anything user-visible or money-sensitive should not remain "best effort."

#### 6. Install Platform-Level Integration Tests

Unit tests are not enough for the current maturity gap.

Add integration tests for:

- scheduled publish end-to-end
- notification create -> delivery contract
- search indexing producer/consumer compatibility
- deactivated user disappearance across search/feed/profile
- subscription/payment reconciliation
- account deletion/deactivation visibility outcomes

Definition of done:

- tests validate invariants that span modules, queues, and side effects

### Phase 2 Recommended Order

1. Money truth
2. Auth/account truth
3. Publication workflows
4. Lifecycle semantics
5. Denormalized-state reconciliation
6. Integration test coverage

### Phase 2 Exit Criteria

Do not move to Phase 3 until:

- core user-visible truths are singular and explicit
- derived state has a repair model
- cross-module workflows have one owner
- platform invariants are tested end-to-end

---

## Phase 3: Performance And Scale Safety

### Objective

Once the platform stops lying, make it stop assuming flattering traffic.

This phase is about:

- hostile scale
- hot-path correctness
- observability under load
- bounded behavior when systems fail

### Phase 3 Deliverables

1. Query-plan review for every hot read path.
2. Removal of correctness-breaking hard caps in critical flows.
3. Real fan-out strategy for notifications, presence, messaging, and broad delivery.
4. Real observability on latency, queue lag, retries, and drift.
5. Backfill/reconciliation jobs for state that can be repaired.

### Phase 3 Workstreams

#### 1. Audit Query Plans, Not Just ORM Calls

Target:

- feed generation
- trending
- search fallback
- social graph filtering
- follower/following queries
- profile content tabs
- messaging history
- notification list and unread counts

Actions:

- run realistic query-plan analysis
- add missing indexes
- identify hot scans and sort bottlenecks
- stop relying on application-side reranking where DB/index should own it

Definition of done:

- hot queries are understood empirically, not guessed from code shape

#### 2. Remove Correctness Caps From Critical Graph/Realtime Paths

Known classes:

- `take: 50`
- `take: 100`
- `take: 1000`
- first-N notification delivery
- capped membership scans
- capped block/mute lists in correctness paths

Actions:

- distinguish between:
  - safe pagination caps
  - unsafe correctness caps
- remove unsafe caps from:
  - presence fan-out
  - block enforcement
  - recommendation exclusions
  - conversation/contact discovery
  - broadcast-style jobs

Definition of done:

- large users and large graphs do not silently get weaker semantics

#### 3. Replace Sequential Fan-Out With Durable Delivery Patterns

Targets:

- notifications
- message forward/share patterns
- live/presence broadcasts where persistence matters
- platform-wide system jobs

Actions:

- move large fan-out work off inline request paths
- batch where possible
- queue where durability matters
- measure latency and failure outcomes

Definition of done:

- user actions do not synchronously explode into fragile N-way work

#### 4. Build Real Observability

Current logging is not enough.

Need visibility into:

- request latency by route
- DB latency by query class
- queue depth and age
- job retry/failure rates
- push success/failure
- webhook processing outcomes
- cache hit/miss
- search indexing lag
- drift or reconciliation counts

Definition of done:

- the team can answer "what is broken, where, and how badly?" during incidents

#### 5. Add Reconciliation And Repair Jobs

Targets:

- counters
- search index drift
- notification aggregates
- subscription states
- creator stats snapshots
- follower/following counts

Definition of done:

- partial failure no longer implies permanent silent corruption

### Phase 3 Recommended Order

1. Query-plan reality
2. correctness-cap removal
3. fan-out redesign
4. observability
5. reconciliation/backfill jobs

### Phase 3 Exit Criteria

This phase is successful when:

- hot paths have measured behavior
- scale assumptions are explicit and defensible
- large users do not fall off hidden correctness cliffs
- incidents can be diagnosed quickly
- state drift is measurable and repairable

---

## Cross-Phase Rules

These apply throughout all phases.

### Rule 1: Prefer Workflow Ownership Over Module Patching

If five modules partially own a behavior, do not patch all five first.

Create a single workflow owner and migrate callers to it.

### Rule 2: No Silent Degradation In Critical Paths

For auth, money, delivery, publication, indexing, and rate-limiting:

- fail clearly
- log clearly
- meter clearly

Do not continue with fake-success behavior.

### Rule 3: Integration Tests Must Track Invariants

Test system truths such as:

- one publish event leads to one coherent visible state
- one notification event has one delivery pipeline
- one deactivation state yields one consistent visibility outcome

### Rule 4: Every Derived Field Needs A Policy

For every counter, summary, or cache-backed truth:

- exact
- repairable
- approximate by design

If there is no policy, that field is a liability.

### Rule 5: Avoid Scope Creep During Hardening

Do not mix in feature expansion unless it directly supports a phase goal.

Hardening fails when it becomes "while we are here, let's also add..."

---

## Suggested Execution Checklist

An agent executing this plan should maintain a checklist roughly like this:

### Phase 1 Checklist

- fix mobile typecheck blocker
- repair root lint to run real checks
- classify required infra and remove fake-success paths
- hard-fail invalid queue/search actions
- unify notification delivery ownership
- implement single publication contract for scheduled/manual publish
- unify lifecycle visibility rules across major feeds and search

### Phase 2 Checklist

- remove legacy wallet truth split
- redesign payment/subscription reconciliation storage
- complete Clerk sync and auth truth rules
- centralize publication workflows
- separate lifecycle fields semantically
- classify and reconcile denormalized state
- add platform-level invariant tests

### Phase 3 Checklist

- run hot query plan review
- remove correctness-breaking caps
- redesign sequential fan-out
- add operational metrics and alertable signals
- build repair/backfill jobs for drift-prone state

---

## What Not To Do

Do not:

- celebrate passing unit tests as platform confidence
- leave warnings in place of failed guarantees
- keep multiple owners of the same side effect
- keep "temporary" legacy source-of-truth fields alive indefinitely
- allow queue consumers to ignore unknown actions
- let lifecycle semantics remain per-surface
- continue adding major features before Phase 1 is materially complete

---

## Final Instruction To Any Follow-On Agent

Assume the repo is more dangerous in its seams than in its syntax.

When choosing between:

- fixing three obvious bugs in one module
- or fixing one cross-module invariant

prefer the invariant.

The repo does not need more scattered correctness.

It needs fewer places where the truth can fork.

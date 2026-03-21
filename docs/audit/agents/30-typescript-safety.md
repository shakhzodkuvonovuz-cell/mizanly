# Agent #30 — TypeScript Safety Audit

**Scope:** Type safety across the entire codebase (backend + mobile)
**Files audited:** All `*.ts` and `*.tsx` in `apps/api/src/` and `apps/mobile/`
**Date:** 2026-03-21
**Agent:** Claude Opus 4.6 #30 of 67

---

## Summary

| Category | Count |
|----------|-------|
| `as any` in non-test code | 0 |
| `@ts-ignore` / `@ts-expect-error` | 0 |
| Non-null assertions (!) on potentially null values | 22 |
| `as unknown as` double-cast (type safety escape hatch) | 12 |
| `as never` type assertions (Expo Router workaround) | 227 |
| Untyped catch block `.message`/`.stack` access | 5 |
| `Record<string, any>` in non-test code | 2 |
| Unsafe `JSON.parse` without try/catch | 5 |
| Untyped `response.json()` (returns implicit `any`) | 15 |
| Unsafe type assertions that could fail at runtime | 28 |
| Ungated `console.*` statements (should use logger) | 55 |
| `null as T` unsafe cast | 1 |
| `as IconName` casts on arbitrary strings | 26 |
| **Total findings** | **398** |

**Overall assessment:** The codebase has ZERO violations of the `as any` and `@ts-ignore`/`@ts-expect-error` rules in non-test code -- this is excellent discipline. The main TypeScript safety concerns are: (1) non-null assertions on values that could genuinely be null at runtime, (2) untyped catch blocks accessing `.message`/`.stack`, (3) `as unknown as` double-casts that bypass the type system, (4) untyped `response.json()` calls propagating implicit `any`, and (5) 227 `as never` casts for Expo Router navigation (a known framework limitation but still a type-safety gap).

---

## CATEGORY 1: Non-null assertions (!) on potentially null values

### Finding 1.1 — stream.service.ts: Non-null assertion on API response field
**File:** `apps/api/src/modules/stream/stream.service.ts`
**Line:** 76
```ts
return data.result!.uid;
```
**Explanation:** `data.result` is asserted as non-null, but the Cloudflare Stream API can return a successful response (`data.success === true`) with a null or undefined `result` field in edge cases (e.g., eventual consistency). The guard at line 69 only checks `!data.success`, not `!data.result`. If `data.success === true && data.result === undefined`, this crashes at runtime.

### Finding 1.2 — encryption.service.ts: Non-null assertion on regex match
**File:** `apps/api/src/modules/encryption/encryption.service.ts`
**Line:** 97
```ts
return digits.match(/.{5}/g)!.join(' ');
```
**Explanation:** The `!` asserts the regex match is non-null. While `digits` is guaranteed to be 60 chars at this point (sliced at line 94), if the input `hex` parameter were somehow empty, `digits` could be all zeros from the padding loop. The assertion is *practically* safe but relies on upstream invariants that aren't enforced by the type system.

### Finding 1.3 — stories.service.ts: Non-null assertion on Map.get()
**File:** `apps/api/src/modules/stories/stories.service.ts`
**Line:** 81
```ts
grouped.get(key)!.stories.push(story);
```
**Explanation:** The `!` is safe here because line 78-80 checks `grouped.has(key)` and creates the entry if missing. However, the non-null assertion bypasses TypeScript's flow analysis -- a guard-then-get pattern would be cleaner.

### Finding 1.4 — channel/[handle].tsx: Non-null assertion on channel in query
**File:** `apps/mobile/app/(screens)/channel/[handle].tsx`
**Line:** 204
```ts
queryFn: ({ pageParam }) => playlistsApi.getByChannel(channel!.id, pageParam),
```
**Explanation:** `channel` could be null/undefined if the parent query hasn't resolved yet. The `enabled` flag on the query may prevent this from firing, but the non-null assertion means TypeScript won't catch a logic error if `enabled` is misconfigured.

### Finding 1.5 — channel/[handle].tsx: Non-null assertion on trailerVideo
**File:** `apps/mobile/app/(screens)/channel/[handle].tsx`
**Line:** 392
```ts
onPress={() => router.push(`/(screens)/video/${channel.trailerVideo!.id}`)}
```
**Explanation:** `channel.trailerVideo` is optional. If the channel has no trailer video, this crashes at runtime. The UI should conditionally render this button only when `trailerVideo` exists.

### Finding 1.6 — close-friends.tsx: Non-null assertion on closeFriendsCircle (3 instances)
**File:** `apps/mobile/app/(screens)/close-friends.tsx`
**Lines:** 136, 160, 161
```ts
queryFn: () => circlesApi.getMembers(closeFriendsCircle!.id),
// ...
? circlesApi.addMembers(closeFriendsCircle!.id, [userId])
: circlesApi.removeMembers(closeFriendsCircle!.id, [userId]),
```
**Explanation:** `closeFriendsCircle` is derived from a query and can be undefined. The `enabled: !!closeFriendsCircle` guard on the query helps, but the mutation at lines 160-161 has no `enabled` guard -- if called before the circle is created, it crashes.

### Finding 1.7 — create-reel.tsx: Non-null assertion on video (2 instances)
**File:** `apps/mobile/app/(screens)/create-reel.tsx`
**Lines:** 197, 208
```ts
body: await fetch(video!.uri).then(r => r.blob()),
// ...
duration: video!.duration,
```
**Explanation:** `video` state can be null if the user hasn't selected a video yet. If the upload function is somehow triggered without a video selection, this crashes. Should use an early return guard instead of `!`.

### Finding 1.8 — profile/[username].tsx: Non-null assertion on profile (7 instances)
**File:** `apps/mobile/app/(screens)/profile/[username].tsx`
**Lines:** 239, 245, 250, 259, 277, 465, 478
```ts
queryFn: () => storiesApi.getHighlights(profile!.id),
mutationFn: () => isFollowing ? followsApi.unfollow(profile!.id) : followsApi.follow(profile!.id),
mutationFn: () => blocksApi.block(profile!.id),
mutationFn: () => mutesApi.mute(profile!.id),
usersApi.report(profile!.id, reason).catch(() => {});
const url = profile.website!.startsWith('http') ? profile.website! : `https://${profile.website}`;
onPress={() => router.push(`/(screens)/channel/${profile.channel!.handle}`)}
```
**Explanation:** `profile` is loaded asynchronously. While `enabled: !!profile` guards some queries, the mutations and event handlers use `profile!` without checking. Line 465 uses `profile.website!` -- if website is null, this crashes. Line 478 uses `profile.channel!.handle` -- if the user has no channel, this crashes.

### Finding 1.9 — hadith.tsx: Non-null assertion on prev state (2 instances)
**File:** `apps/mobile/app/(screens)/hadith.tsx`
**Line:** 187
```ts
setCurrentHadith(prev => ({ ...prev!, isBookmarked: !prev!.isBookmarked }));
```
**Explanation:** `prev` (the previous state) could be null if `currentHadith` hasn't been set yet. Spreading `null` or accessing `.isBookmarked` on null crashes at runtime.

### Finding 1.10 — story-viewer.tsx: Non-null assertion on story and group (3 instances)
**File:** `apps/mobile/app/(screens)/story-viewer.tsx`
**Lines:** 131, 313, 324
```ts
queryFn: () => storiesApi.getViewers(story!.id),
const convo = await messagesApi.createDM(group!.user.id);
const convo = await messagesApi.createDM(group!.user.id);
```
**Explanation:** `story` and `group` are derived from URL params and JSON parsing. If the params are malformed, these crash.

### Finding 1.11 — thread/[id].tsx: Non-null assertion on _count
**File:** `apps/mobile/app/(screens)/thread/[id].tsx`
**Line:** 113
```ts
<Text style={styles.replyActionCount}>{reply._count!.replies}</Text>
```
**Explanation:** `_count` is a Prisma aggregation field that may not be included in all queries. If the backend response omits `_count`, this crashes.

---

## CATEGORY 2: `as unknown as` double-cast (type safety escape hatch)

### Finding 2.1 — payments.service.ts: Double-cast on Stripe objects (4 instances)
**File:** `apps/api/src/modules/payments/payments.service.ts`
**Lines:** 259, 261, 378, 389
```ts
const paymentIntent = (latestInvoice as unknown as { payment_intent?: Stripe.PaymentIntent | null })?.payment_intent ?? null;
const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
const subscriptionId = String((invoice as unknown as { subscription?: string }).subscription ?? '');
const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
```
**Explanation:** These double-casts bypass Stripe's type definitions entirely. The Stripe SDK types do include `current_period_end` and `payment_intent` on the proper types. This suggests the code may be using an outdated version of the Stripe SDK types, or the objects are being passed as expanded vs. non-expanded forms. The casts mask potential runtime errors if Stripe changes its API shape.

### Finding 2.2 — islamic.service.ts: Double-cast on imported JSON data (2 instances)
**File:** `apps/api/src/modules/islamic/islamic.service.ts`
**Lines:** 1334, 1471
```ts
return duasData as unknown as DuaEntry[];
return asmaUlHusnaData as unknown as NameOfAllah[];
```
**Explanation:** Imported JSON files are cast to typed arrays via `as unknown as`. If the JSON structure doesn't match the `DuaEntry` or `NameOfAllah` interface (e.g., a missing field, wrong type), TypeScript won't catch it. The data should be validated at import time with a runtime schema validator (e.g., Zod).

### Finding 2.3 — WebLayout.tsx: Double-cast for web-only CSS (4 instances)
**File:** `apps/mobile/src/components/web/WebLayout.tsx`
**Lines:** 58, 63, 69, 75
```ts
height: '100%' as unknown as number,
```
**Explanation:** React Native's `StyleSheet` types expect `height` to be a `number`, but on web, `'100%'` is valid CSS. The `as unknown as number` double-cast forces a string where a number is expected. This works at runtime on web but would crash on native if these components were accidentally rendered there.

### Finding 2.4 — WebSidebar.tsx: Double-cast for web-only CSS
**File:** `apps/mobile/src/components/web/WebSidebar.tsx`
**Line:** 168
```ts
height: '100%' as unknown as number,
```
**Explanation:** Same issue as Finding 2.3.

### Finding 2.5 — VideoPlayer.tsx: Double-cast to access unlisted method
**File:** `apps/mobile/src/components/ui/VideoPlayer.tsx`
**Line:** 173
```ts
await (videoRef.current as unknown as { presentFullscreenPlayer: () => Promise<void> }).presentFullscreenPlayer();
```
**Explanation:** The Expo AV Video component's ref type doesn't expose `presentFullscreenPlayer` in its TypeScript types, but it exists at runtime. This double-cast bypasses type checking entirely. If the method is renamed or removed in a future Expo version, TypeScript won't catch it.

### Finding 2.6 — islamicApi.ts: Double-cast for query string conversion
**File:** `apps/mobile/src/services/islamicApi.ts`
**Line:** 53
```ts
api.get<ZakatCalculationResult>(`/islamic/zakat/calculate${qs(input as unknown as Record<string, string | number | boolean | undefined>)}`),
```
**Explanation:** The `input` parameter is cast to a generic Record via double-cast. This loses all type information about the Zakat calculation input fields.

---

## CATEGORY 3: `as never` type assertions (Expo Router)

### Finding 3.1 — 227 `as never` casts across the mobile codebase
**Files:** 164 in `apps/mobile/app/` + 63 in `apps/mobile/src/`
**Total:** 227 instances

**Representative examples:**
```ts
// apps/mobile/app/(tabs)/_layout.tsx:93
router.push(path as never);

// apps/mobile/app/(screens)/conversation-info.tsx:407
router.push(`/(screens)/starred-messages?conversationId=${convo?.id}` as never)

// apps/mobile/src/utils/deepLinking.ts:169
router.push(`/(screens)/post/${params.id}` as never);

// apps/mobile/src/hooks/usePushNotificationHandler.ts:127
router.push(`/(screens)/post/${data.postId}` as never);
```

**Explanation:** Expo Router's type system requires statically typed route strings. Since this codebase generates routes dynamically (with IDs, query params), `as never` is used to bypass route type checking. While this is a known Expo Router limitation and the standard workaround, it means:
1. Typos in route paths won't be caught at compile time
2. If a screen is renamed or removed, TypeScript won't flag broken navigation
3. All 227 navigation calls are effectively untyped

This is the single largest type-safety gap in the codebase. **Recommendation:** Define a typed route helper function that centralizes all route construction and validates paths at a single point.

---

## CATEGORY 4: Untyped catch block `.message`/`.stack` access

### Finding 4.1 — push.service.ts: Accessing .message/.stack on untyped error (2 instances)
**File:** `apps/api/src/modules/notifications/push.service.ts`
**Lines:** 101, 134
```ts
} catch (error) {
  this.logger.error(`Failed to send push batch: ${error.message}`, error.stack);
// ...
} catch (error) {
  this.logger.error(`Failed to deactivate tokens: ${error.message}`, error.stack);
```
**Explanation:** In TypeScript strict mode, `catch (error)` gives `error` the type `unknown`. Accessing `.message` and `.stack` directly on `unknown` is a type error. In NestJS with default tsconfig, this may compile if `useUnknownInCatchVariables` is false, but it's still unsafe -- if the thrown value is not an Error object (e.g., a string or number), `.message` returns `undefined` and `.stack` returns `undefined`, producing misleading log output.

### Finding 4.2 — push-trigger.service.ts: Accessing .message/.stack on untyped error
**File:** `apps/api/src/modules/notifications/push-trigger.service.ts`
**Lines:** 252-253
```ts
} catch (error) {
  this.logger.error(
    `Failed to send push to user ${userId}: ${error.message}`,
    error.stack,
  );
```
**Explanation:** Same issue as 4.1. No `instanceof Error` guard before accessing `.message` and `.stack`.

### Finding 4.3 — stripe-webhook.controller.ts: Accessing .message on untyped error
**File:** `apps/api/src/modules/payments/stripe-webhook.controller.ts`
**Line:** 58
```ts
} catch (err) {
  this.logger.warn('Invalid Stripe webhook signature', err.message);
```
**Explanation:** `err` is untyped. Stripe's `constructEvent` could throw a `StripeSignatureVerificationError` (which is an Error), but the type system doesn't guarantee this. Should use `err instanceof Error ? err.message : String(err)`.

### Finding 4.4 — ai.service.ts: Logging untyped error directly
**File:** `apps/api/src/modules/ai\ai.service.ts`
**Line:** 78
```ts
} catch (error) {
  this.logger.error('Claude API call failed', error);
```
**Explanation:** While this doesn't access `.message` directly, passing `error` (typed as `unknown`) to the logger means NestJS's Logger will call `.toString()` on it, which may produce `[object Object]` for non-Error thrown values.

### Finding 4.5 — posts.service.ts: Logging untyped error directly
**File:** `apps/api/src/modules/posts/posts.service.ts`
**Line:** 511
```ts
} catch (err) {
  this.logger.error('Failed to create mention notification', err);
```
**Explanation:** Same as 4.4 -- `err` is untyped and passed directly to logger.

**Note:** In contrast, many other services in the codebase correctly use the pattern `error instanceof Error ? error.message : String(error)`. Specifically, these files do it correctly: `islamic.service.ts`, `payments.service.ts`, `embeddings.service.ts`, `embedding-pipeline.service.ts`, `recommendations.service.ts`, `devices.service.ts`, `webhooks.service.ts`, `reels.service.ts`, `stories.service.ts`, `media.processor.ts`, `job-queue.service.ts`. The 5 findings above are the ones that DON'T follow this pattern.

---

## CATEGORY 5: `Record<string, any>` in non-test code

### Finding 5.1 — webhooks.controller.ts: Record<string, any> for webhook event data
**File:** `apps/api/src/modules/auth/webhooks.controller.ts`
**Lines:** 55, 62
```ts
let event: { type: string; data: Record<string, any> };
// ...
}) as { type: string; data: Record<string, any> };
```
**Explanation:** The Clerk webhook event `data` field is typed as `Record<string, any>`, which means all property access on `data` at lines 72-74 (`data.email_addresses`, `data.first_name`, etc.) is completely untyped. If Clerk changes its webhook payload schema, TypeScript won't catch the breakage. Should define a proper `ClerkWebhookData` interface.

---

## CATEGORY 6: Unsafe `JSON.parse` without try/catch

### Finding 6.1 — useChatLock.ts: JSON.parse without try/catch
**File:** `apps/mobile/src/hooks/useChatLock.ts`
**Line:** 13
```ts
return JSON.parse(stored) as string[];
```
**Explanation:** If `SecureStore` returns corrupted data (e.g., after an app update changes the storage format), `JSON.parse` throws and the entire `getLockedIds` promise rejects with no handler. The `useChatLock` hook has no error boundary. This will crash the `isLocked`, `lockConversation`, and `unlockConversation` functions.

### Finding 6.2 — widgetData.ts: JSON.parse without try/catch (2 instances)
**File:** `apps/mobile/src/services/widgetData.ts`
**Lines:** 79, 86
```ts
return JSON.parse(raw) as PrayerTimesWidgetData;
// ...
return JSON.parse(raw) as UnreadWidgetData;
```
**Explanation:** `AsyncStorage.getItem` returns a string, but if the data is corrupted, `JSON.parse` throws with no handler. Both calls also use `as` casts without runtime validation.

### Finding 6.3 — schedule-post.tsx: JSON.parse on URL params without try/catch
**File:** `apps/mobile/app/(screens)/schedule-post.tsx`
**Line:** 100
```ts
const mediaUrls = params.mediaUrls ? JSON.parse(params.mediaUrls) : [];
```
**Explanation:** URL params could be malformed. If `params.mediaUrls` is not valid JSON (e.g., truncated by URL encoding), this crashes.

### Finding 6.4 — search.tsx: JSON.parse on history without try/catch
**File:** `apps/mobile/app/(screens)/search.tsx`
**Line:** 164
```ts
const history = stored ? JSON.parse(stored) : [];
```
**Explanation:** Unlike line 152 which wraps `JSON.parse` in try/catch, this instance at line 164 (inside `addToHistory`) does not. Corrupted storage data causes a crash.

---

## CATEGORY 7: Untyped `response.json()` (implicit `any`)

The `fetch()` API's `response.json()` method returns `Promise<any>`. When the result is assigned to a variable without explicit typing, the `any` propagates through the code, defeating TypeScript's type checking. The following instances lack type annotations:

### Finding 7.1 — stripe-connect.service.ts
**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`
**Line:** 59
```ts
const account = await response.json();
```
**Impact:** `account.id` at line 60 is untyped. If Stripe changes the response shape, no compile-time error.

### Finding 7.2 — stripe-connect.service.ts
**File:** `apps/api/src/modules/monetization/stripe-connect.service.ts`
**Line:** 126
```ts
const pi = await response.json();
```
**Impact:** Payment intent response fields accessed without type checking.

### Finding 7.3 — content-safety.service.ts
**File:** `apps/api/src/modules/moderation/content-safety.service.ts`
**Line:** 65
```ts
const data = await response.json();
```
**Impact:** `data.content?.[0]?.text` at line 66 relies on Claude API response shape without type validation.

### Finding 7.4 — content-safety.service.ts
**File:** `apps/api/src/modules/moderation/content-safety.service.ts`
**Line:** 102
```ts
const data = await response.json();
```
**Impact:** Same as 7.3.

### Finding 7.5 — ai.service.ts
**File:** `apps/api/src/modules/ai/ai.service.ts`
**Line:** 75
```ts
const data = await response.json();
```
**Impact:** `data.content?.[0]?.text` accessed without type validation.

### Finding 7.6 — ai.service.ts
**File:** `apps/api/src/modules/ai/ai.service.ts`
**Line:** 523
```ts
const data = await response.json();
```

### Finding 7.7 — ai.service.ts
**File:** `apps/api/src/modules/ai/ai.service.ts`
**Line:** 594
```ts
const data = await response.json();
```

### Finding 7.8 — creator.service.ts
**File:** `apps/api/src/modules/creator/creator.service.ts`
**Line:** 380
```ts
const data = await response.json();
```

### Finding 7.9 — islamic.service.ts (5 instances)
**File:** `apps/api/src/modules/islamic/islamic.service.ts`
**Lines:** 231, 385, 1067, 1135, 1191, 1299
```ts
const data = await response.json();
```
**Impact:** Prayer times API, mosque API, Quran API, and other external service responses are all untyped.

### Finding 7.10 — push.service.ts
**File:** `apps/api/src/modules/notifications/push.service.ts`
**Line:** 96
```ts
const result = await response.json();
```
**Impact:** Expo push notification response shape unvalidated.

### Finding 7.11 — meilisearch.service.ts
**File:** `apps/api/src/modules/search/meilisearch.service.ts`
**Line:** 110
```ts
return response.json();
```
**Impact:** Meilisearch search results returned as `any`.

### Finding 7.12 — stickers.service.ts
**File:** `apps/api/src/modules/stickers/stickers.service.ts`
**Line:** 336
```ts
const data = await response.json();
```
**Impact:** Claude API response for SVG generation untyped.

**Note:** Two files correctly type their `response.json()` calls: `embeddings.service.ts` uses `(await response.json()) as EmbeddingResponse` and `stream.service.ts` uses `const data: CfStreamResponse = await response.json()`. These demonstrate the correct pattern.

---

## CATEGORY 8: Unsafe type assertions that could fail at runtime

### Finding 8.1 — broadcast.service.ts: String enum cast
**File:** `apps/api/src/modules/broadcast/broadcast.service.ts`
**Line:** 120
```ts
messageType: (data.messageType as MessageType) ?? MessageType.TEXT,
```
**Explanation:** `data.messageType` comes from user input (DTO). If the DTO validation doesn't restrict to valid `MessageType` enum values, an invalid string could be cast, causing a Prisma error on insert.

### Finding 8.2 — feed.service.ts: String enum cast
**File:** `apps/api/src/modules/feed/feed.service.ts`
**Line:** 70
```ts
space: data.space as ContentSpace,
```
**Explanation:** `data.space` is asserted as `ContentSpace` without runtime validation.

### Finding 8.3 — drafts.service.ts: String enum cast (2 instances)
**File:** `apps/api/src/modules/drafts/drafts.service.ts`
**Lines:** 18, 42
```ts
where.space = space as ContentSpace;
space: space as ContentSpace,
```
**Explanation:** `space` parameter comes from controller. If unvalidated, invalid enum values pass through.

### Finding 8.4 — drafts.service.ts: JSON value cast (2 instances)
**File:** `apps/api/src/modules/drafts/drafts.service.ts`
**Lines:** 43, 55
```ts
data: data as Prisma.InputJsonValue,
data: { data: data as Prisma.InputJsonValue },
```
**Explanation:** Any user-provided data is cast to `Prisma.InputJsonValue`. If it contains circular references or non-serializable values, Prisma throws at runtime.

### Finding 8.5 — messages.service.ts: String enum cast (2 instances)
**File:** `apps/api/src/modules/messages/messages.service.ts`
**Lines:** 162, 632
```ts
messageType: (data.messageType as MessageType) ?? 'TEXT',
messageType: (messageType as MessageType) ?? 'TEXT',
```

### Finding 8.6 — messages.service.ts: String enum cast
**File:** `apps/api/src/modules/messages/messages.service.ts`
**Line:** 724
```ts
messageType: (data.messageType as MessageType) ?? 'IMAGE',
```

### Finding 8.7 — videos.service.ts: String enum cast (2 instances)
**File:** `apps/api/src/modules/videos/videos.service.ts`
**Lines:** 206, 662
```ts
category: category as VideoCategory,
reason: (reasonMap[reason] ?? 'OTHER') as ReportReason,
```

### Finding 8.8 — threads.service.ts: String enum cast
**File:** `apps/api/src/modules/threads/threads.service.ts`
**Line:** 349
```ts
visibility: (dto.visibility as ThreadVisibility) ?? 'PUBLIC',
```

### Finding 8.9 — threads.service.ts: Prisma error code cast
**File:** `apps/api/src/modules/threads/threads.service.ts`
**Line:** 494
```ts
if (err instanceof Error && 'code' in err && (err as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
```
**Explanation:** The `err as Prisma.PrismaClientKnownRequestError` cast is used after checking `instanceof Error` and `'code' in err`, which is a reasonable guard but doesn't actually verify it's a Prisma error specifically.

### Finding 8.10 — notifications.service.ts: String enum cast
**File:** `apps/api/src/modules/notifications/notifications.service.ts`
**Line:** 117
```ts
type: params.type as NotificationType,
```

### Finding 8.11 — scheduling.service.ts: String cast (2 instances)
**File:** `apps/api/src/modules/scheduling/scheduling.service.ts`
**Lines:** 30, 33
```ts
if (!validModels.includes(type as ContentModel)) {
return type as ContentModel;
```
**Explanation:** Line 33 is safe because it's after the validation check at line 30. But line 30 itself casts before checking, which is semantically backwards -- should use `validModels.includes(type as string)` or a type guard.

### Finding 8.12 — users.service.ts: String enum cast (4 instances)
**File:** `apps/api/src/modules/users/users.service.ts`
**Lines:** 759, 760, 761, 763
```ts
spam: 'SPAM' as ReportReason,
impersonation: 'HARASSMENT' as ReportReason,
inappropriate: 'NUDITY' as ReportReason,
const mappedReason = reasonMap[reason] ?? ('SPAM' as ReportReason);
```
**Explanation:** These are constant casts (string literal to enum), so they're safe at the assertion level. But they indicate the `ReportReason` enum could be directly used with proper typing instead of string intermediaries.

### Finding 8.13 — posts.service.ts: String enum casts (5 instances)
**File:** `apps/api/src/modules/posts/posts.service.ts`
**Lines:** 458, 460, 626, 632, 949, 1121
```ts
postType: dto.postType as PostType,
visibility: (dto.visibility as PostVisibility) ?? PostVisibility.PUBLIC,
data: { reaction: reaction as ReactionType },
data: { userId, postId, reaction: reaction as ReactionType },
reason: (reasonMap[reason] ?? 'OTHER') as ReportReason,
space: space as ContentSpace,
```

### Finding 8.14 — live.service.ts: String enum cast (3 instances)
**File:** `apps/api/src/modules/live/live.service.ts`
**Lines:** 18, 47, 274
```ts
liveType: data.liveType as LiveType,
if (liveType) where.liveType = liveType as LiveType;
liveType: 'VIDEO' as LiveType,
```

### Finding 8.15 — reels.service.ts: String enum cast
**File:** `apps/api/src/modules/reels/reels.service.ts`
**Line:** 737
```ts
reason: (reasonMap[reason] ?? 'OTHER') as ReportReason,
```

### Finding 8.16 — parental-controls.service.ts: Buffer cast (2 instances)
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts`
**Lines:** 17, 23
```ts
const derived = (await scryptAsync(pin, salt, KEY_LENGTH)) as Buffer;
```
**Explanation:** Node.js's `scrypt` in async form returns `Buffer`, but the type system may not know this depending on the import. The cast is likely safe but fragile.

### Finding 8.17 — recommendations.service.ts: Prisma WhereInput cast (3 instances)
**File:** `apps/api/src/modules/recommendations/recommendations.service.ts`
**Lines:** 429, 472, 497
```ts
where.user = { ...(where.user as Prisma.UserWhereInput), id: { notIn: excludedIds } };
```
**Explanation:** `where.user` is being spread with a cast. If `where.user` is actually a `StringFilter` or other Prisma type instead of `UserWhereInput`, the spread produces invalid query conditions that Prisma may silently ignore or error on.

### Finding 8.18 — chat-export.service.ts: Double-cast on message field
**File:** `apps/api/src/modules/chat-export/chat-export.service.ts`
**Line:** 107
```ts
mediaUrl: includeMedia ? ((msg as Record<string, unknown>).mediaUrl as string | null) ?? null : null,
```
**Explanation:** `msg` is cast to `Record<string, unknown>` to access `mediaUrl`, then that value is cast to `string | null`. This indicates the Prisma select clause doesn't include `mediaUrl` in its type, so the code reaches through the type system to access it. If the select clause changes, this silently returns null instead of the actual value.

### Finding 8.19 — webhooks.service.ts: String cast on payload field
**File:** `apps/api/src/modules/webhooks/webhooks.service.ts`
**Line:** 65
```ts
'X-Mizanly-Event': (payload.event as string) ?? 'unknown',
```

### Finding 8.20 — stories.service.ts: JSON casts (4 instances)
**File:** `apps/api/src/modules/stories/stories.service.ts`
**Lines:** 135, 430, 432, 456
```ts
stickerData: data.stickerData as Prisma.InputJsonValue,
data: { responseData: responseData as Prisma.InputJsonValue }
data: { storyId, userId, stickerType, responseData: responseData as Prisma.InputJsonValue }
const data = r.responseData as Record<string, string>;
```
**Explanation:** Line 456 is particularly unsafe -- `responseData` is a `Prisma.JsonValue` (which can be null, number, boolean, string, array, or object), but it's cast to `Record<string, string>` which is far more specific.

### Finding 8.21 — MusicPicker.tsx: API response casts (3 instances)
**File:** `apps/mobile/src/components/story/MusicPicker.tsx`
**Lines:** 92, 102, 112
```ts
return res as AudioTrack[];
```
**Explanation:** The API service returns an unknown type, and the component casts it to `AudioTrack[]` without validation. If the API changes its response shape, this produces silent data corruption.

### Finding 8.22 — Autocomplete.tsx: Union type narrowing via cast (5 instances)
**File:** `apps/mobile/src/components/ui/Autocomplete.tsx`
**Lines:** 83, 85, 92, 108, 163
```ts
(item as HashtagResult).name
(item as User).username
const hashtag = item as HashtagResult;
const user = item as User;
type === 'hashtag' ? (item as HashtagResult).id : (item as User).id
```
**Explanation:** These casts narrow a `User | HashtagResult` union based on the `type` prop. This is pattern is safe given the `type` check, but a discriminated union or type guard function would be more type-safe.

### Finding 8.23 — api.ts: null as T
**File:** `apps/mobile/src/services/api.ts`
**Line:** 163
```ts
if (res.status === 204) return null as T;
```
**Explanation:** `null` is cast to generic type `T`. If the caller expects a non-null `T` (e.g., `api.get<User>('/me')`), this silently returns null where a `User` is expected, causing crashes downstream when properties are accessed.

### Finding 8.24 — api.ts: Envelope unwrap cast
**File:** `apps/mobile/src/services/api.ts`
**Line:** 168
```ts
return { data: json.data, meta: json.meta } as T;
```
**Explanation:** The API envelope is destructured and cast to `T`. If `T` is `PaginatedResponse<User>`, this works. But if `T` is `User`, this returns `{ data, meta }` cast as `User`, which is silently wrong.

---

## CATEGORY 9: `as IconName` casts on arbitrary strings

### Finding 9.1 — 26 `as IconName` casts across mobile code
These cast string literals to `IconName` without compile-time validation that the string is a valid icon name:

| File | Line | Cast |
|------|------|------|
| `GlassHeader.tsx` | 62 | `icon as IconName` |
| `chat-folders.tsx` | 74 | `(item.icon as string) || FOLDER_ICONS[...]` then `as IconName` |
| `streaks.tsx` | 60 | `'trending-up' as IconName` |
| `image-editor.tsx` | 148 | `'sun' as IconName` |
| `image-editor.tsx` | 149 | `'circle' as IconName` |
| `image-editor.tsx` | 150 | `'droplet' as IconName` |
| `creator-dashboard.tsx` | 403 | `'heart' as IconName` |
| `creator-dashboard.tsx` | 404 | `'users' as IconName` |
| `challenges.tsx` | 55-61 | 7 casts: `'layers'`, `'globe'`, `'repeat'`, `'camera'`, `'trending-up'`, `'heart'`, `'edit'` |
| `video-editor.tsx` | 610-615 | 6 casts: `'scissors'`, `'fast-forward'`, `'sliders'`, `'type'`, `'music'`, `'volume-2'` |
| `2fa-setup.tsx` | 509 | `app.icon as IconName` |
| `achievements.tsx` | 68 | `'star' as IconName` |
| `duet-create.tsx` | 297-299 | 3 casts: `'layout'`, `'layers'`, `'user'` |

**Explanation:** The `IconName` type (defined in `Icon.tsx`) is a union of 44+ valid icon names. Some of these casts use icon names that ARE NOT in the valid set: `'sun'`, `'circle'`, `'droplet'`, `'scissors'`, `'fast-forward'`, `'sliders'`, `'type'`, `'music'`, `'volume-2'`, `'layout'`, `'star'` are NOT in the documented 44 valid names. These will silently render nothing or crash depending on the Icon component's implementation.

---

## CATEGORY 10: Ungated `console.*` statements

### Backend (0 instances in non-test code)
The backend correctly uses NestJS Logger (`this.logger.*`) everywhere. Zero ungated `console.*` calls found in production backend code.

### Mobile — `apps/mobile/src/` (31 instances)

| File | Line | Statement |
|------|------|-----------|
| `utils/deepLinking.ts` | 48 | `console.warn('Unsupported deep link URL:', url)` |
| `utils/deepLinking.ts` | 115 | `console.warn('Unknown deep link screen: ${screen}')` |
| `utils/deepLinking.ts` | 121 | `console.error('Error parsing deep link:', error, url)` |
| `utils/deepLinking.ts` | 266 | `console.warn('Unhandled deep link screen: ${screen}')` |
| `utils/sentry.ts` | 39 | `console.error('[Sentry]', error, context)` |
| `utils/sentry.ts` | 49 | `console.log('[Sentry:${level}]', message)` |
| `utils/registerServiceWorker.ts` | 34 | `console.warn('[SW] Registration failed:', error)` |
| `utils/performance.ts` | 50 | `console.warn('[Perf] Slow operation: ${name} took ${duration}ms')` |
| `services/api.ts` | 145 | `console.error('[API] Token getter failed:', e)` |
| `services/api.ts` | 159 | `console.error('[API] ${method} ${path} -> ${res.status}', error)` |
| `services/api.ts` | 176 | `console.warn('[API] Slow: ${method} ${path} -- ${duration}ms')` |
| `hooks/useFpsMonitor.ts` | 34 | `console.log(...)` (FPS stats) |
| `config/sentry.ts` | 14 | `console.log('[Sentry] No DSN configured...')` |
| `config/sentry.ts` | 41 | `console.log('[Sentry] Initialized successfully')` |
| `config/sentry.ts` | 43 | `console.log('[Sentry] Package not installed...')` |
| `config/sentry.ts` | 68 | `console.error('[Sentry] Failed to capture:', error)` |
| `services/pushNotifications.ts` | 25 | `console.log('Push not supported on simulator')` (gated by `__DEV__`) |
| `services/pushNotifications.ts` | 45 | `console.log('Push permission denied')` (gated by `__DEV__`) |
| `services/pushNotifications.ts` | 68 | `console.log('Push token registered:', tokenData.data)` (gated by `__DEV__`) |
| `services/pushNotifications.ts` | 71 | `console.error('Error registering for push:', error)` |
| `services/pushNotifications.ts` | 147 | `console.log('Notification channels configured')` (gated by `__DEV__`) |
| `services/pushNotifications.ts` | 149 | `console.error('Error configuring notification channels:', error)` |
| `services/pushNotifications.ts` | 185 | `console.log('Prayer notification scheduled')` (gated by `__DEV__`) |
| `services/pushNotifications.ts` | 188 | `console.error('Error scheduling prayer notification:', error)` |
| `services/pushNotifications.ts` | 235 | `console.log('Ramadan notification scheduled')` (gated by `__DEV__`) |
| `services/pushNotifications.ts` | 238 | `console.error('Error scheduling Ramadan notification:', error)` |
| `services/pushNotifications.ts` | 251 | `console.error('Error canceling notification:', error)` |
| `services/pushNotifications.ts` | 263 | `console.error('Error canceling all notifications:', error)` |
| `services/pushNotifications.ts` | 277 | `console.error('Error getting scheduled notifications:', error)` |
| `services/pushNotifications.ts` | 289 | `console.log('Push token unregistered')` (gated by `__DEV__`) |
| `services/pushNotifications.ts` | 291 | `console.error('Error unregistering push token:', error)` |

### Mobile — `apps/mobile/src/components/` (6 instances)

| File | Line | Statement |
|------|------|-----------|
| `risalah/StickerPackBrowser.tsx` | 78 | `console.error('Failed to load featured packs', error)` |
| `risalah/StickerPackBrowser.tsx` | 101 | `console.error('Failed to load packs', error)` |
| `risalah/StickerPackBrowser.tsx` | 127 | `console.error('Search failed', error)` |
| `risalah/StickerPackBrowser.tsx` | 176 | `console.error('Failed to toggle pack ownership', error)` |
| `risalah/StickerPackBrowser.tsx` | 186 | `console.error('Failed to fetch pack details', error)` |
| `ui/ScreenErrorBoundary.tsx` | 25-26 | `console.error('[ScreenErrorBoundary] Caught error:', error.message)` + component stack |

### Mobile — `apps/mobile/src/components/ui/` (2 instances)

| File | Line | Statement |
|------|------|-----------|
| `ImageLightbox.tsx` | 189 | `console.error('Error sharing image:', error)` |
| `ImageGallery.tsx` | 229 | `console.error('Error sharing image:', error)` |

### Mobile — `apps/mobile/app/` screens (18 instances)

| File | Line | Statement |
|------|------|-----------|
| `_layout.tsx` | 166 | `console.warn('[API] No auth token from Clerk')` |
| `(auth)/sign-in.tsx` | 66 | `console.error('Sign in error:', JSON.stringify(err))` |
| `(screens)/create-event.tsx` | 83 | `console.error('Failed to fetch communities:', err)` |
| `(screens)/conversation-media.tsx` | 211 | `console.error('Failed to open link:', err)` |
| `(screens)/broadcast-channels.tsx` | 85 | `console.error('Failed to load discover channels', error)` |
| `(screens)/broadcast-channels.tsx` | 101 | `console.error('Failed to load my channels', error)` |
| `(screens)/broadcast-channels.tsx` | 146 | `console.error('Failed to toggle subscription', error)` |
| `(screens)/broadcast/[id].tsx` | 59 | `console.error('Failed to load channel', error)` |
| `(screens)/broadcast/[id].tsx` | 73 | `console.error('Failed to load messages', error)` |
| `(screens)/broadcast/[id].tsx` | 100 | `console.error('Failed to send message', error)` |
| `(screens)/broadcast/[id].tsx` | 117 | `console.error('Failed to toggle mute', error)` |
| `(screens)/broadcast/[id].tsx` | 132 | `console.error('Failed to toggle subscription', error)` |
| `(screens)/broadcast/[id].tsx` | 153 | `console.error('Failed to pin/unpin message', error)` |
| `(screens)/broadcast/[id].tsx` | 164 | `console.error('Failed to delete message', error)` |
| `(screens)/community-posts.tsx` | 188 | `console.error('Create post error:', error)` |
| `(screens)/community-posts.tsx` | 225 | `console.error('Delete post error:', error)` |
| `(screens)/pinned-messages.tsx` | 67 | `console.error('Failed to unpin message', err)` |
| `(screens)/starred-messages.tsx` | 73 | `console.error('Failed to unstar message', err)` |
| `(screens)/saved.tsx` | 185 | `console.error('Failed to load folder:', error)` |

**Total: 55 console statements in production mobile code.** Of these, 6 are properly gated by `__DEV__`. The remaining 49 will output to the console in production builds, which:
1. Leaks internal state information (error messages, stack traces, token data)
2. Has minor performance impact on production
3. Violates the principle of using a structured logger

---

## CATEGORY 11: SQL Injection via `$queryRawUnsafe` (type safety dimension)

### Finding 11.1 — embeddings.service.ts: String interpolation in SQL (2 instances)
**File:** `apps/api/src/modules/embeddings/embeddings.service.ts`
**Lines:** 256, 290-293
```ts
// Line 256
? `AND e2."contentType" IN (${filterTypes.map(t => `'${t}'`).join(',')})`

// Lines 290-293
conditions.push(`"contentType" IN (${filterTypes.map(t => `'${t}'`).join(',')})`);
conditions.push(`"contentId" NOT IN (${excludeIds.map(id => `'${id}'`).join(',')})`);
```
**Explanation:** While `filterTypes` comes from an enum and `excludeIds` are likely CUIDs, the `$queryRawUnsafe` usage with string interpolation means TypeScript's type system cannot prevent SQL injection if these values are ever sourced from user input. This is documented as a P0 in the existing audit but is also a type safety issue -- the `$queryRawUnsafe` API's type signature accepts `string` (not template literal), intentionally bypassing Prisma's SQL injection protection.

---

## CATEGORY 12: Missing return type annotations on exported functions

The backend (`apps/api/src/`) uses NestJS decorators and Prisma return types that provide implicit return type inference. The mobile codebase similarly uses React hooks and component return types that are inferred. A spot-check of 20 random service files showed all exported methods have either explicit return types or clearly inferred return types from Prisma queries.

**No findings in this category.** The codebase has good return type hygiene.

---

## SEVERITY RANKING

### HIGH (could cause runtime crashes or security issues)
1. **Untyped catch `.message`/`.stack` access** (Findings 4.1-4.5) -- will throw `TypeError` if non-Error is thrown
2. **Non-null assertions on async data** (Findings 1.4-1.11) -- will crash if data isn't loaded
3. **`null as T` in API client** (Finding 8.23) -- silently returns null to callers expecting non-null
4. **`JSON.parse` without try/catch** (Findings 6.1-6.4) -- crashes on corrupted data
5. **SQL injection via type-unsafe `$queryRawUnsafe`** (Finding 11.1) -- known P0

### MEDIUM (could cause subtle bugs or maintenance issues)
6. **`as unknown as` double-casts on Stripe types** (Finding 2.1) -- masks API changes
7. **`as unknown as` on JSON imports** (Finding 2.2) -- no runtime validation
8. **Untyped `response.json()` calls** (Findings 7.1-7.12) -- propagates `any`
9. **String-to-enum casts without validation** (Findings 8.1-8.15) -- Prisma errors on bad input
10. **`as IconName` with invalid icon names** (Finding 9.1) -- renders nothing or crashes

### LOW (known limitations or minor issues)
11. **227 `as never` Expo Router casts** (Finding 3.1) -- framework limitation
12. **55 ungated console statements** (Category 10) -- info leak, performance
13. **`as const` assertions** (not findings, legitimate TypeScript pattern)
14. **Stories service `Record<string, string>` cast** (Finding 8.20) -- narrow cast on broad data

---

## POSITIVE FINDINGS (things done well)

1. **Zero `as any` in non-test code** -- strict adherence to project rule
2. **Zero `@ts-ignore` / `@ts-expect-error` anywhere in the codebase** -- excellent discipline
3. **Zero `: any` type annotations in non-test production code** -- all parameters typed
4. **Backend uses NestJS Logger consistently** -- zero console.* in backend production code
5. **Most catch blocks use `error instanceof Error ? error.message : String(error)` pattern** -- only 5 exceptions out of 50+ catch blocks
6. **Return types well-inferred** through Prisma and NestJS decorators
7. **Test files appropriately use `as any` for mocks** -- following the documented exception

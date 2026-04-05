# X03 — Cross-Module Notification Wiring Audit

**Auditor:** Claude Opus 4.6 (1M context)
**Date:** 2026-04-05
**Scope:** Every user action that should trigger a notification across ~87 service files
**Method:** Exhaustive grep of `NOTIFICATION_REQUESTED` and `notifications.create` calls, cross-referenced against all interactive user actions in every module

---

## Architecture Summary

| Layer | Component | Notes |
|-------|-----------|-------|
| **Emitter** | `eventEmitter.emit(NOTIFICATION_REQUESTED, ...)` | ~46 call sites across 15 service files |
| **Listener** | `NotificationEventListener` | `@OnEvent(NOTIFICATION_REQUESTED, { async: true })` |
| **Pipeline** | `NotificationsService.create()` | Self-notification guard, block/mute check, per-type settings, Redis dedup (5min), batching (30min for LIKE/COMMENT), push trigger |
| **Push** | `PushTriggerService` -> `PushService` | Switch/case for all 26 NotificationType values, Expo Push API |
| **Socket** | Redis pub/sub `notification:new` channel | Real-time badge update |

**Prisma `NotificationType` enum values (26):**
`LIKE`, `COMMENT`, `FOLLOW`, `FOLLOW_REQUEST`, `FOLLOW_REQUEST_ACCEPTED`, `MENTION`, `REPLY`, `CIRCLE_INVITE`, `CIRCLE_JOIN`, `MESSAGE`, `THREAD_REPLY`, `REPOST`, `QUOTE_POST`, `CHANNEL_POST`, `LIVE_STARTED`, `VIDEO_PUBLISHED`, `REEL_LIKE`, `REEL_COMMENT`, `VIDEO_LIKE`, `VIDEO_COMMENT`, `STORY_REPLY`, `POLL_VOTE`, `COLLAB_INVITE`, `TAG`, `SYSTEM`

---

## Complete Action-to-Notification Map

### WIRED CORRECTLY

| # | Action | Module | NotificationType | Recipient | Self-skip | Notes |
|---|--------|--------|-------------------|-----------|-----------|-------|
| 1 | Follow (public) | `follows.service.ts:120` | `FOLLOW` | target | Yes | |
| 2 | Follow request (private) | `follows.service.ts:88` | `FOLLOW_REQUEST` | target | Yes | |
| 3 | Follow request accepted | `follows.service.ts:402` | `FOLLOW_REQUEST_ACCEPTED` | requester | Yes | |
| 4 | First follower celebration | `follows.service.ts:138` | `SYSTEM` | target | N/A | |
| 5 | Like post | `posts.service.ts:959` | `LIKE` | post owner | Yes | |
| 6 | Comment on post (top-level) | `posts.service.ts:1417` | `COMMENT` | post owner | Yes | |
| 7 | Reply to comment (post) | `posts.service.ts:1408` | `REPLY` | parent comment author | Yes | |
| 8 | Share/repost post | `posts.service.ts:1160` | `REPOST`/`QUOTE_POST` | original owner | Yes | |
| 9 | Mention in post | `posts.service.ts:579` | `MENTION` | mentioned user | Yes | |
| 10 | Tag in post | `posts.service.ts:608` | `TAG` | tagged user | Yes | |
| 11 | Collab invite (post) | `posts.service.ts:631` | `COLLAB_INVITE` | invitee | Yes | |
| 12 | Like reel | `reels.service.ts:697` | `REEL_LIKE` | reel owner | Yes | |
| 13 | Comment on reel | `reels.service.ts:797` | `REEL_COMMENT` | reel owner | Yes | |
| 14 | Mention in reel | `reels.service.ts:257` | `MENTION` | mentioned user | Yes | |
| 15 | Tag in reel | `reels.service.ts:236` | `MENTION` | tagged user | Yes | Uses MENTION type, not TAG |
| 16 | Like video | `videos.service.ts:585` | `VIDEO_LIKE` | video owner | Yes | |
| 17 | Comment on video | `videos.service.ts:722` | `VIDEO_COMMENT` | video owner | Yes | |
| 18 | Video published | `videos.service.ts:228` | `VIDEO_PUBLISHED` | channel subscribers | Yes, skip self | Capped at 200 |
| 19 | Like thread | `threads.service.ts:713` | `LIKE` | thread owner | Yes | |
| 20 | Reply to thread | `threads.service.ts:980` | `THREAD_REPLY` | thread owner | Yes | |
| 21 | Repost thread | `threads.service.ts:783` | `REPOST` | thread owner | Yes | |
| 22 | Mention in thread | `threads.service.ts:442` | `MENTION` | mentioned user | Yes | |
| 23 | New message | `messages.service.ts:545` | `MESSAGE` | conversation members | Yes, skip sender | Capped at 1024 |
| 24 | Story reply | `stories.service.ts:504` | `STORY_REPLY` | story owner | Yes | |
| 25 | Mention in story | `stories.service.ts:231` | `MENTION` | mentioned user | Yes | |
| 26 | Poll vote | `polls.service.ts:167` | `POLL_VOTE` | poll creator | Yes | |
| 27 | Circle invite (add members) | `circles.service.ts:158` | `CIRCLE_INVITE` | added member | N/A | Capped at 50 |
| 28 | Circle join notification to owner | `circles.service.ts:171` | `CIRCLE_JOIN` | owner | Yes, skip self | Capped at 50 |
| 29 | Circle removal | `circles.service.ts:211` | `SYSTEM` | removed member | N/A | Capped at 50 |
| 30 | Channel post | `channel-posts.service.ts:46` | `CHANNEL_POST` | channel subscribers | Yes, skip self | Capped at 200 |
| 31 | Gift received | `gifts.service.ts:187` | `SYSTEM` | receiver | N/A | |
| 32 | Live started | `live.service.ts:191` | `LIVE_STARTED` | followers | Yes, skip self | Capped at 100 |
| 33 | Go live from rehearsal | `live.service.ts:522` | `LIVE_STARTED` | followers | Yes | Capped at 100 |
| 34 | Mentorship request | `community.service.ts:72` | `SYSTEM` | mentor | N/A | |
| 35 | Fatwa answered | `community.service.ts:189` | `SYSTEM` | asker | N/A | |
| 36 | Event RSVP | `events.service.ts:354` | `SYSTEM` | event organizer | Yes | |
| 37 | Challenge join | `gamification.service.ts:357` | `SYSTEM` | challenge creator | Yes | |
| 38 | Challenge completed | `gamification.service.ts:416` | `SYSTEM` | challenge creator | Yes | |
| 39 | New commerce order | `commerce.service.ts:262` | `SYSTEM` | seller | N/A | |
| 40 | Order status change | `commerce.service.ts:380` | `SYSTEM` | buyer | N/A | |
| 41 | Quran khatm | `islamic.service.ts:628` | `SYSTEM` | self | N/A | System notification |
| 42 | Screen time digest | `users.service.ts:841` | `SYSTEM` | users with limits | N/A | Capped at 10,000 |
| 43 | Content removal (post) | `posts.service.ts:1898` | `SYSTEM` | content author | N/A | Auto-moderation |
| 44 | Content removal (reel) | `reels.service.ts:1297` | `SYSTEM` | content author | N/A | Auto-moderation |
| 45 | Reel ready (processing done) | `reels.service.ts:288/304` | `SYSTEM` | author | N/A | |
| 46 | Scheduled content published | `scheduling.service.ts:471+` | `SYSTEM` | author | N/A | Posts, threads, reels, videos |

---

## FINDINGS

### F1 — CRITICAL: Story reactions (emoji) send NO notification to story owner

**Severity:** HIGH
**File:** `apps/api/src/modules/stories/stories.service.ts:581-615`
**Action:** `reactToStory()` — user reacts with emoji to someone's story
**Expected:** Story owner receives notification ("Someone reacted to your story")
**Actual:** No notification emitted. The reaction is silently persisted in `storyStickerResponse`.
**Impact:** Story owners have zero visibility that people are engaging with their stories via reactions. This is a primary engagement signal on every story-based platform (Instagram, Snapchat).
**Note:** `replyToStory()` correctly sends `STORY_REPLY` notification, but `reactToStory()` does not.

### F2 — CRITICAL: Story sticker responses (poll, quiz, question) send NO notification

**Severity:** HIGH
**File:** `apps/api/src/modules/stories/stories.service.ts:674-708`
**Action:** `submitStickerResponse()` — user answers a poll, quiz, slider, or question sticker
**Expected:** Story owner receives notification ("Someone answered your poll" / "New response to your quiz")
**Actual:** No notification emitted.
**Impact:** Story stickers are a major interactive feature (10 sticker types built). The owner has to manually open sticker analytics to see any responses.

### F3 — HIGH: Collab invite (standalone module) sends NO notification

**Severity:** HIGH
**File:** `apps/api/src/modules/collabs/collabs.service.ts:38`
**Action:** `invite()` — post owner invites a collaborator
**Expected:** Invited user receives a `COLLAB_INVITE` notification
**Actual:** The `CollabsService` has zero notification imports/emissions. The `PostsService.createPost()` does send a collab invite notification via `dto.collaboratorUsername`, but the standalone `/collabs/invite` endpoint creates the `PostCollab` record with zero notification.
**Impact:** Users invited via the collabs API (not during post creation) will never know they were invited.

### F4 — HIGH: Collab accept/decline sends NO notification to post owner

**Severity:** HIGH
**File:** `apps/api/src/modules/collabs/collabs.service.ts:53,64`
**Action:** `accept()` / `decline()` — invitee responds to collab invitation
**Expected:** Post owner receives notification ("X accepted/declined your collaboration")
**Actual:** No notification emitted.
**Impact:** Post owner has no way to know if their collab invitation was accepted or declined without polling the endpoint.

### F5 — HIGH: Community join sends NO notification to community owner

**Severity:** HIGH
**File:** `apps/api/src/modules/communities/communities.service.ts:293`
**Action:** `join()` — user joins a public community
**Expected:** Community owner receives notification ("Someone joined your community")
**Actual:** No notification of any kind. Compare with `circles.service.ts` which emits `CIRCLE_JOIN` notifications for each member added.
**Impact:** Community owners have zero visibility into growth unless they check the members list.

### F6 — MEDIUM: Community member removal sends NO notification

**Severity:** MEDIUM
**File:** `apps/api/src/modules/communities/communities.service.ts` (no `removeMembers` method, only `leave`)
**Observation:** `CommunitiesService` has no `removeMembers` method at all, while `CirclesService.removeMembers()` sends SYSTEM notifications to removed members. If a community admin removes a member via any admin mechanism, the member will not be notified.

### F7 — MEDIUM: Scholar Q&A — question answered sends NO notification

**Severity:** MEDIUM
**File:** `apps/api/src/modules/scholar-qa/scholar-qa.service.ts:134`
**Action:** `markAnswered()` — scholar marks a question as answered during live Q&A
**Expected:** Question asker receives notification ("Your question was answered!")
**Actual:** No notification emitted. The status is silently updated.
**Impact:** Users who submitted questions have to keep the Q&A session open or manually poll to know their question was answered.
**Note:** `community.service.ts:answerFatwa()` correctly sends a notification for fatwa answers.

### F8 — MEDIUM: Scholar Q&A — session started sends NO notification

**Severity:** MEDIUM
**File:** `apps/api/src/modules/scholar-qa/scholar-qa.service.ts:112`
**Action:** `startSession()` — scholar starts a scheduled Q&A session
**Expected:** Users who submitted questions (or followers) get notified the session is now live
**Actual:** No notification emitted.

### F9 — MEDIUM: Broadcast channel message sends push but NO in-app notification

**Severity:** MEDIUM
**File:** `apps/api/src/modules/broadcast/broadcast.service.ts:157-215`
**Action:** `sendMessage()` — channel owner/admin sends broadcast message
**Observation:** Uses a parallel notification path. When `queueService` is available, it uses `addBulkPushJob` which sends push notifications directly (bypassing `NotificationsService`). The fallback path uses `prisma.notification.createMany` with `type: 'SYSTEM'`, which is correct but creates DB records without triggering the push pipeline via `NotificationEventListener`. Neither path uses the standard `NOTIFICATION_REQUESTED` event.
**Impact:** Push-only path: no in-app notification record (users can't see it in their notification feed). Fallback path: DB record exists but no push delivery.

### F10 — MEDIUM: Live stream guest invite sends NO notification

**Severity:** MEDIUM
**File:** `apps/api/src/modules/live/live.service.ts:419-434`
**Action:** `inviteGuest()` — host invites user as guest to live stream
**Expected:** Invited user receives notification ("You've been invited to join a live stream")
**Actual:** No notification emitted.
**Impact:** Invited guest must be watching the stream or receive out-of-band communication.

### F11 — MEDIUM: Audio room — NO notifications for any action

**Severity:** MEDIUM
**File:** `apps/api/src/modules/audio-rooms/audio-rooms.service.ts`
**Action:** All actions — create room, join room, raise hand, promote to speaker, etc.
**Expected:** Room host gets notified when someone joins; participants notified when promoted to speaker; host followers notified when room starts.
**Actual:** Zero notification imports or emissions in the entire service.
**Impact:** Audio rooms operate completely silently. No discoverability unless users are actively browsing the rooms list.

### F12 — MEDIUM: Video reply to comment sends NO notification

**Severity:** MEDIUM
**File:** `apps/api/src/modules/video-replies/video-replies.service.ts:38`
**Action:** `create()` — user creates a video reply to a comment
**Expected:** Original comment author receives notification ("Someone replied to your comment with a video")
**Actual:** No notification emitted.
**Impact:** Video replies are a unique engagement feature with zero notification support.

### F13 — LOW: Reel tag uses `MENTION` type instead of `TAG`

**Severity:** LOW
**File:** `apps/api/src/modules/reels/reels.service.ts:236`
**Action:** Tag user in reel
**Expected:** Uses `TAG` notification type (consistent with posts)
**Actual:** Uses `MENTION` type with title "Tagged you"
**Impact:** Inconsistent type means the tag notification is grouped with mentions in the notification feed and respects the `notifyMentions` setting instead of its own setting. Post tags correctly use `TAG` type.

### F14 — LOW: VIDEO_COMMENT_LIKE type not in Prisma enum

**Severity:** LOW
**File:** `apps/api/src/modules/videos/videos.service.ts:835`
**Action:** Like a video comment
**Emitted type:** `'VIDEO_COMMENT_LIKE'`
**Prisma enum:** Does NOT include `VIDEO_COMMENT_LIKE`
**Impact:** `NotificationsService.create()` validates types at runtime (line 206-209). This notification will be silently dropped every time because `VIDEO_COMMENT_LIKE` is not in `Object.values(NotificationType)`. The `logger.warn` fires but no notification is ever created.
**The entire video comment like notification is dead code.**

### F15 — LOW: Content moderation system notification has actorId = userId (self)

**Severity:** LOW
**File:** `apps/api/src/modules/posts/posts.service.ts:1898`
**Action:** Auto-moderation removes content
**Emitted:** `actorId: userId` (user is both actor and recipient)
**Impact:** `NotificationsService.create()` has `if (params.userId === params.actorId) return null;` (line 203). System moderation notifications are silently dropped because the actorId equals the userId.
**The entire content removal notification for posts is dead code.**
**Same issue:** `reels.service.ts:1297` — reel content removal notification also uses `actorId: userId`.

### F16 — LOW: Message notification leaks plaintext content to APNs/FCM servers

**Severity:** LOW (defense-in-depth concern)
**File:** `apps/api/src/modules/messages/messages.service.ts:496-501`
**Action:** Unencrypted message notification
**Observation:** For non-E2E messages, the actual message content (truncated to 100 chars) is sent as the push notification body via Expo Push -> APNs/FCM. This means Apple/Google servers process and potentially log the plaintext. For E2E messages, this is correctly handled with generic "New message" body.
**Impact:** Expected behavior for non-E2E messages (same as any chat app without E2E), but worth noting that the platform sends message content to third-party push infrastructure for non-encrypted conversations.

### F17 — INFO: Fan-out caps are inconsistent

| Service | Fan-out cap | Action |
|---------|-------------|--------|
| `videos.service.ts:223` | 200 subscribers | VIDEO_PUBLISHED |
| `channel-posts.service.ts:42` | 200 subscribers | CHANNEL_POST |
| `live.service.ts:187` | 100 followers | LIVE_STARTED |
| `circles.service.ts:157` | 50 members | CIRCLE_INVITE / CIRCLE_JOIN |
| `messages.service.ts:534` | 1024 members | MESSAGE |
| `broadcast.service.ts:183` | 10,000 subscribers | Broadcast message |
| `users.service.ts:833` | 10,000 users | Screen time digest |

**Observation:** No consistent fan-out policy. Channel posts cap at 200 but broadcast messages at 10,000. If a channel has 500 subscribers, 300 won't get VIDEO_PUBLISHED notifications.

### F18 — INFO: Push payload size not enforced

**Severity:** INFO
**File:** `apps/api/src/modules/notifications/push.service.ts`
**Observation:** APNs limit is 4KB, FCM is 4KB. No payload size check before sending. The `title + body + data` fields are constructed without truncation of the data object. While `body` is truncated in most builders, the `data` field can include arbitrary keys like `actorName`, `preview`, etc.
**Impact:** Very unlikely to exceed 4KB in practice (titles are short, bodies are truncated), but there's no enforcement layer.

### F19 — INFO: Batching only covers 5 of 26 notification types

**Severity:** INFO
**File:** `apps/api/src/modules/notifications/notifications.service.ts:293`
**Batchable types:** `LIKE`, `REEL_LIKE`, `VIDEO_LIKE`, `COMMENT`, `REEL_COMMENT`
**Not batched:** `VIDEO_COMMENT`, `FOLLOW`, `MENTION`, `TAG`, `POLL_VOTE`, `THREAD_REPLY`, `REPLY`, all SYSTEM types
**Impact:** If 100 people reply to the same thread, the owner gets 100 separate notifications. If 100 people like the same thread, they still get 100 notifications (thread LIKE is not in batchable types — only post LIKE is).

### F20 — INFO: `typeToSetting` map missing some notification types

**Severity:** INFO
**File:** `apps/api/src/modules/notifications/notifications.service.ts:253-263`
**Missing from map:** `CIRCLE_INVITE`, `CIRCLE_JOIN`, `VIDEO_COMMENT`, `SYSTEM`, `THREAD_REPLY` (is mapped to `notifyComments` which is correct), but `VIDEO_COMMENT` is NOT mapped. Users cannot disable video comment notifications via settings.
**Types with no setting key:** `CIRCLE_INVITE`, `CIRCLE_JOIN`, `VIDEO_COMMENT` — these always send regardless of user preferences.

### F21 — INFO: Stories service uses direct `notifications.create()` instead of event emitter

**Severity:** INFO
**File:** `apps/api/src/modules/stories/stories.service.ts:504,231`
**Observation:** `StoriesService` injects `NotificationsService` directly and calls `notifications.create()` instead of using `eventEmitter.emit(NOTIFICATION_REQUESTED, ...)`. This creates a direct dependency on `NotificationsModule` rather than being decoupled via events.
**Same pattern:** `live.service.ts`, `scheduling.service.ts` — all use direct `notifications.create()` calls.
**Impact:** Functional but inconsistent with the event-driven architecture documented in `notification.events.ts`.

---

## Checklist Results

| # | Check | Result | Details |
|---|-------|--------|---------|
| 1 | Every action has notification? | **FAIL** | 12 missing actions (F1-F12) |
| 2 | Fan-out capped? | **PARTIAL** | Capped but inconsistent (F17), 50-10,000 range |
| 3 | Self-notification prevented? | **PARTIAL** | Most services check `userId !== actorId`. BUT content moderation notifications (F15) set `actorId: userId` causing silent self-drop. `NotificationsService.create()` has global guard. |
| 4 | Blocked/muted suppressed? | **PASS** | `notifications.service.ts:232-248` checks both block directions + mute before creating |
| 5 | E2E content not leaked? | **PASS** | E2E messages use generic "New message" body (line 496-497). Story reply uses generic "Replied to your story" (push.service.ts:387). No encrypted content in push payloads. |
| 6 | Batch dedup? | **PARTIAL** | Redis 5-min dedup key (line 280). 30-min batching for 5 types only (F19). Thread likes NOT batched. |
| 7 | Dead references? | **FAIL** | `VIDEO_COMMENT_LIKE` type is not in Prisma enum (F14) — silently dropped. Content removal notifications use self-actorId (F15) — silently dropped. |
| 8 | Push payload size? | **WARN** | No enforcement (F18), relies on content being naturally short |

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| **CRITICAL** | 2 | F1 (story reaction), F2 (sticker response) |
| **HIGH** | 3 | F3 (collab invite module), F4 (collab accept/decline), F5 (community join) |
| **MEDIUM** | 5 | F6 (community remove), F7 (scholar Q&A answered), F8 (scholar Q&A started), F9 (broadcast dual path), F10 (live guest invite), F11 (audio rooms), F12 (video reply) |
| **LOW** | 4 | F13 (reel tag type), F14 (VIDEO_COMMENT_LIKE dead), F15 (content removal dead), F16 (message plaintext to push) |
| **INFO** | 5 | F17 (inconsistent caps), F18 (no payload size check), F19 (limited batching), F20 (settings map gaps), F21 (mixed direct/event patterns) |
| **TOTAL** | **19** | |

**Dead code identified:** 2 notification paths that appear to work but silently produce zero notifications (F14, F15).

# X22: Content Moderation Coverage — Hostile Audit

**Date:** 2026-04-05
**Scope:** Every content creation/edit endpoint — is `moderateText()`/`moderateContent()` called?
**Moderation service:** `ContentSafetyService.moderateText()` in `apps/api/src/modules/moderation/content-safety.service.ts`
**Injection pattern:** Services inject `ContentSafetyService` as `contentSafety`

---

## Services That HAVE ContentSafetyService Injected

Only 12 service files inject `contentSafety` or `ContentSafetyService`:

1. `posts.service.ts`
2. `threads.service.ts`
3. `reels.service.ts`
4. `videos.service.ts`
5. `stories.service.ts`
6. `messages.service.ts`
7. `channels.service.ts`
8. `channel-posts.service.ts`
9. `community.service.ts`
10. `users.service.ts`
11. `moderation/content-safety.service.ts` (self)
12. `moderation/moderation.service.ts` (references in comments)

---

## MODERATED: Content Types With Moderation

| Content Type | Create | Edit/Update | Comments | Notes |
|-------------|--------|-------------|----------|-------|
| **Posts** | YES (`create`) | YES (`update`) | YES (`addComment`, `editComment`) | Full coverage. Create, edit, and comment all moderated. |
| **Threads** | YES (`create`) | YES (`updateThread`) | YES (`addReply`) | Full coverage. Create, update, reply, continuation all moderated. |
| **Thread continuations** | YES (`createContinuation`) | N/A | N/A | Moderated. |
| **Reels** | YES (`create` — caption) | YES (`updateReel` — caption) | **NO** (`comment`) | **GAP: Reel comments are NOT moderated.** |
| **Videos** | YES (`create`) | YES (`update`) | YES (`comment`) | Full coverage. Text + thumbnail moderation. |
| **Stories** | YES (`create` — textOverlay + stickerData) | N/A (no edit) | N/A | Moderated on create. Image moderation async. |
| **Messages** | Partial (see below) | YES (`editMessage`) | N/A | **Complex — see details below.** |
| **Channels** | YES (name + description) | YES (name + description) | N/A | Full coverage. |
| **Channel posts** | YES | N/A (no edit) | N/A | Moderated on create. |
| **Community boards** | YES (`createBoard`) | N/A | N/A | Moderated via `moderateContent()` helper. |
| **Study circles** | YES (`createStudyCircle`) | N/A | N/A | Moderated. |
| **Fatwa Q&A** | YES (`askFatwa`) | N/A | N/A | Moderated. |
| **Community opportunities** | YES (`createOpportunity`) | N/A | N/A | Moderated. |
| **Community events** | YES (`createEvent` in community.service) | N/A | N/A | Moderated. |
| **Voice posts** | YES (transcript only) | N/A | N/A | Transcript moderated if provided. Audio content itself NOT moderated. |
| **Watch parties** | YES (`createWatchParty`) | N/A | N/A | Moderated. |
| **Collections** | YES (`createCollection`) | N/A | N/A | Moderated. |
| **Waqf** | YES (`createWaqf`) | N/A | N/A | Moderated. |
| **User profile** | YES (`updateProfile` — bio, displayName, location) | Same | N/A | Moderated. |
| **Post caption override** | YES (`shareToRisalah`) | N/A | N/A | Moderated (`modResult`). |

---

## FINDINGS: Content Types WITHOUT Moderation

| # | Finding | Severity | Service | Method | What's Unmoderated |
|---|---------|----------|---------|--------|--------------------|
| X22-C1 | **Reel comments are NOT moderated** | HIGH | `reels.service.ts` | `comment()` | Reel comments go through `sanitizeText()` only. No `moderateText()` call. Post comments, thread replies, and video comments are all moderated. Reel comments are the gap. An attacker can post hate speech, harassment, or harmful content in reel comments with zero automated detection. |
| X22-C2 | **Broadcast messages are NOT moderated** | HIGH | `broadcast.service.ts` | `sendMessage()` | `BroadcastService` does NOT inject `ContentSafetyService`. Broadcast messages (which go to potentially thousands of subscribers) have zero content moderation. Admin/owner can send anything. |
| X22-C3 | **Events are NOT moderated** | MEDIUM | `events.service.ts` | `createEvent()`, `updateEvent()` | `EventsService` does NOT inject `ContentSafetyService`. Event title, description, and location fields are unmoderated. An attacker can create events with harmful titles visible on community pages. |
| X22-C4 | **Discord forum threads are NOT moderated** | HIGH | `discord-features.service.ts` | `createForumThread()` | Forum thread title and content are persisted with NO moderation. `DiscordFeaturesService` does NOT inject `ContentSafetyService`. Forum replies (`replyToForumThread()`) are also unmoderated. |
| X22-C5 | **Discord forum replies are NOT moderated** | HIGH | `discord-features.service.ts` | `replyToForumThread()` | Reply content goes directly to DB with no moderation check. |
| X22-C6 | **Webhook execute content is NOT moderated** | MEDIUM | `discord-features.service.ts` | `executeWebhook()` | External webhook payloads inject content into communities with no moderation. The 4000-char limit exists but no content safety check. |
| X22-C7 | **Live session titles are NOT moderated** | MEDIUM | `live.service.ts` | `create()` | Live session title and description are unmoderated. `LiveService` does NOT inject `ContentSafetyService`. Harmful live stream titles visible on discovery page. |
| X22-C8 | **Audio room titles are NOT moderated** | MEDIUM | `audio-rooms.service.ts` | `create()` | Audio room title and description are unmoderated. `AudioRoomsService` does NOT inject `ContentSafetyService`. |
| X22-C9 | **Mosque posts are NOT moderated** | MEDIUM | `mosques.service.ts` | `createPost()` | `MosquesService` does NOT inject `ContentSafetyService`. Mosque post content goes directly to DB. |
| X22-C10 | **Mosque creation name/address are NOT moderated** | LOW | `mosques.service.ts` | `create()` | Mosque name, address, and other fields are unmoderated. |
| X22-C11 | **Community notes are NOT moderated** | MEDIUM | `community-notes.service.ts` | `createNote()` | Community notes attached to posts/reels are unmoderated. `CommunityNotesService` does NOT inject `ContentSafetyService`. |
| X22-C12 | **Halal restaurant reviews are NOT moderated** | MEDIUM | `halal.service.ts` | `addReview()` | Review comments are unmoderated. `HalalService` does NOT inject `ContentSafetyService`. |
| X22-C13 | **Halal restaurant names are NOT moderated** | LOW | `halal.service.ts` | `create()` | Restaurant name, address, etc. are unmoderated. |
| X22-C14 | **Story chains are NOT moderated** | MEDIUM | `story-chains.service.ts` | `createChain()` | Chain prompt goes through `sanitizeText()` but no `moderateText()`. `StoryChainsService` does NOT inject `ContentSafetyService`. |
| X22-C15 | **Gamification challenges are NOT moderated** | MEDIUM | `gamification.service.ts` | `createChallenge()` | Challenge title and description are unmoderated. `GamificationService` does NOT inject `ContentSafetyService`. |
| X22-C16 | **Gamification series are NOT moderated** | MEDIUM | `gamification.service.ts` | `createSeries()` | Series title and description are unmoderated. |
| X22-C17 | **Sticker pack names are NOT moderated** | LOW | `stickers.service.ts` | `createPack()` | Pack name is unmoderated. `StickersService` does NOT inject `ContentSafetyService`. |
| X22-C18 | **Custom emoji pack names are NOT moderated** | LOW | `telegram-features.service.ts` | `createEmojiPack()` | Pack name and description are unmoderated. `TelegramFeaturesService` does NOT inject `ContentSafetyService`. |
| X22-C19 | **Chat folder names are NOT moderated** | Info | `telegram-features.service.ts` | `createChatFolder()` | Private to user, low risk. |
| X22-C20 | **Community create (circles) is NOT moderated** | MEDIUM | `communities.service.ts` | `create()` | Community name, description, and rules are unmoderated. `CommunitiesService` does NOT inject `ContentSafetyService`. Community names are publicly visible. |
| X22-C21 | **Community update is NOT moderated** | MEDIUM | `communities.service.ts` | `update()` | Updated name, description, and rules are unmoderated. |
| X22-C22 | **Video replies are NOT moderated** | LOW | `video-replies.service.ts` | `create()` | Video replies are media (video URLs) not text, but `VideoRepliesService` does NOT inject `ContentSafetyService`. No image/video moderation on the reply media. |
| X22-C23 | **Reel template names are NOT moderated** | Info | `reel-templates.service.ts` | `create()` | Template name is unmoderated. Low risk since templates are metadata. |
| X22-C24 | **Draft content is NOT moderated on save** | Info | `drafts.service.ts` | `saveDraft()`, `updateDraft()` | Drafts are private and not visible to others. Moderation deferred to publish time. Correct design. |
| X22-C25 | **Messages: only non-E2E plaintext is moderated** | Info | `messages.service.ts` | `sendMessage()` | E2E encrypted messages bypass moderation (server can't read ciphertext). This is architecturally correct — the server literally cannot moderate E2E content. Plaintext messages ARE moderated on edit but NOT on initial send. See X22-C26. |
| X22-C26 | **Message send: plaintext content NOT moderated on initial create** | HIGH | `messages.service.ts` | `sendMessage()` | When sending a new non-encrypted message, `sendMessage()` does NOT call `moderateText()`. Only `editMessage()` calls moderation. An attacker can send abusive plaintext DMs/group messages with no automated detection. The moderation call exists at line 627 only in the `editMessage` path. The initial `sendMessage` flow (line 416+) has NO moderation call before `tx.message.create`. |
| X22-C27 | **Islamic dhikr challenge is NOT moderated** | MEDIUM | `islamic.service.ts` | `createDhikrChallenge()` | Challenge text is unmoderated. |

---

## Moderation Architecture Analysis

### How moderation works when present

Moderation is **synchronous and blocking** in the request path:
```
1. Service method called
2. contentSafety.moderateText(text) called
3. If !safe → throw BadRequestException (content rejected)
4. If safe → proceed to prisma.create/update
```

### What happens when moderation fails (service error)?

The `ContentSafetyService.moderateText()` method has internal try/catch. If the AI moderation provider is down, it **degrades gracefully** — returns `{ safe: true }` as a fallback. This means:

- **If moderation service is down, all content is auto-approved.** This is a deliberate fail-open design (prioritizes availability over safety).
- There is no async re-check queue for content that was auto-approved during an outage.

### Image moderation

- Stories: `moderateStoryImage()` called async (fire-and-forget) after create
- Videos: thumbnail `moderateImage()` called sync on create and update
- Other media types (reel videos, post images, message attachments): **NO image moderation**

---

## SEVERITY SUMMARY

| Severity | Count | Examples |
|----------|-------|---------|
| **HIGH** | 5 | Reel comments, broadcast messages, forum threads/replies, message send |
| **MEDIUM** | 11 | Events, live titles, audio rooms, mosque posts, community notes, halal reviews, challenges, communities, dhikr |
| **LOW** | 5 | Mosque names, halal restaurants, sticker packs, video replies, audio room titles |
| **Info** | 4 | Chat folders, drafts, reel templates, E2E messages |

---

## TOP PRIORITY FIXES

1. **X22-C26 (HIGH):** Add `moderateText()` to `sendMessage()` for non-encrypted plaintext messages. This is the highest-volume content creation endpoint.
2. **X22-C1 (HIGH):** Add `moderateText()` to `reels.service.ts` `comment()` method.
3. **X22-C2 (HIGH):** Add `ContentSafetyService` to `BroadcastService` and moderate `sendMessage()`.
4. **X22-C4/C5 (HIGH):** Add `ContentSafetyService` to `DiscordFeaturesService` and moderate forum thread/reply creation.
5. **X22-C3 (MEDIUM):** Add `ContentSafetyService` to `EventsService` and moderate event create/update.
6. **X22-C20/C21 (MEDIUM):** Add `ContentSafetyService` to `CommunitiesService` and moderate create/update.

---

## SERVICES THAT NEED ContentSafetyService INJECTED

These services create user-visible text content but do NOT have `ContentSafetyService`:

| Service | File | Content Types |
|---------|------|---------------|
| `BroadcastService` | `broadcast.service.ts` | Broadcast messages (to thousands of subscribers) |
| `DiscordFeaturesService` | `discord-features.service.ts` | Forum threads, forum replies, webhook payloads |
| `EventsService` | `events.service.ts` | Event title, description |
| `LiveService` | `live.service.ts` | Live session title, description |
| `AudioRoomsService` | `audio-rooms.service.ts` | Room title, description |
| `MosquesService` | `mosques.service.ts` | Mosque name, posts |
| `CommunityNotesService` | `community-notes.service.ts` | Notes on posts/reels |
| `HalalService` | `halal.service.ts` | Restaurant names, review comments |
| `StoryChainsService` | `story-chains.service.ts` | Chain prompts |
| `GamificationService` | `gamification.service.ts` | Challenge titles, series titles |
| `StickersService` | `stickers.service.ts` | Pack names |
| `TelegramFeaturesService` | `telegram-features.service.ts` | Emoji pack names |
| `CommunitiesService` | `communities.service.ts` | Community name, description, rules |
| `IslamicService` | `islamic.service.ts` | Dhikr challenge text |

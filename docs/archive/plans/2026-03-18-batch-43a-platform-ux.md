# Batch 43A: Platform & UX Parity (Core UX) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 13 platform UX features (Tier 8, Part 1) that bring Mizanly to full feature parity with Instagram/WhatsApp/YouTube on interaction mechanics, privacy, and wellbeing.

**Architecture:** Extends existing modules (messages, mutes, blocks, posts, notifications, settings, feed). Adds 4 new Prisma models + extends 2. Mobile adds ~8 new screens + enhances several existing ones. No new backend modules — everything integrates into existing structure.

**Tech Stack:** NestJS 10 + Prisma + Expo SDK 52 + expo-contacts (contact sync) + expo-local-authentication (biometric) + Zustand

---

## NEW PRISMA MODELS (Agent 0 — Schema)

Add to `apps/api/prisma/schema.prisma`:

```prisma
model Restrict {
  restricterId  String
  restrictedId  String
  createdAt     DateTime @default(now())
  @@id([restricterId, restrictedId])
  @@index([restrictedId])
  @@map("restricts")
}

model DMNote {
  id        String   @id @default(uuid())
  userId    String   @unique
  content   String   @db.VarChar(60)
  expiresAt DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("dm_notes")
}

model ScreenTimeLog {
  id          String   @id @default(uuid())
  userId      String
  date        DateTime @db.Date
  totalSeconds Int     @default(0)
  sessions    Int      @default(0)
  createdAt   DateTime @default(now())
  @@unique([userId, date])
  @@index([userId, date(sort: Desc)])
  @@map("screen_time_logs")
}

model QuietModeSetting {
  id          String    @id @default(uuid())
  userId      String    @unique
  isActive    Boolean   @default(false)
  autoReply   String?   @db.VarChar(200)
  startTime   String?   // "22:00" HH:mm format
  endTime     String?   // "07:00" HH:mm format
  isScheduled Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@map("quiet_mode_settings")
}
```

Extend existing `Comment` model — add field:
```prisma
isHidden Boolean @default(false)
```

Extend existing `UserSettings` model — add fields:
```prisma
screenTimeLimitMinutes Int?
undoSendSeconds        Int     @default(5)
autoPlaySetting        String  @default("wifi") // wifi | always | never
```

---

## AGENT 1: Contact Sync

**Creates:**
- `apps/api/src/modules/users/dto/contact-sync.dto.ts`
- `apps/mobile/app/(screens)/contact-sync.tsx`

**Modifies:**
- `apps/api/src/modules/users/users.service.ts` (add findByPhoneNumbers method)
- `apps/api/src/modules/users/users.controller.ts` (add sync endpoint)
- `apps/mobile/src/services/api.ts` (add to usersApi)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — contact-sync.dto.ts:**
```typescript
import { IsArray, IsString } from 'class-validator';
export class ContactSyncDto {
  @IsArray() @IsString({ each: true }) phoneNumbers: string[];
}
```

**Backend — users.service.ts — add method:**
```typescript
async findByPhoneNumbers(userId: string, phoneNumbers: string[]) {
  // Normalize phone numbers, find matching users, exclude self + blocked
  const users = await this.prisma.user.findMany({
    where: {
      phone: { in: phoneNumbers },
      id: { not: userId },
    },
    select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
  });
  // Check which are already followed
  const follows = await this.prisma.follow.findMany({
    where: { followerId: userId, followingId: { in: users.map(u => u.id) } },
  });
  const followedSet = new Set(follows.map(f => f.followingId));
  return users.map(u => ({ ...u, isFollowing: followedSet.has(u.id) }));
}
```

**Endpoint:** `POST /users/contacts/sync` (ClerkAuthGuard)

**Mobile — contact-sync.tsx (~300 lines):**
- Permission request (expo-contacts)
- Extract phone numbers from device contacts
- Send to API, show results as FlatList of user cards
- "Follow" button per user
- ScreenErrorBoundary, Skeleton, EmptyState

**~400 lines total**

---

## AGENT 2: Biometric App Lock

**Creates:**
- `apps/mobile/app/(screens)/biometric-lock.tsx`

**Modifies:**
- `apps/mobile/src/store/index.ts` (add biometricLockEnabled state)
- `apps/mobile/app/(screens)/settings.tsx` (add biometric lock row)
- `apps/mobile/app/_layout.tsx` (add lock check on app foreground)
- `apps/mobile/src/i18n/en.json` + `ar.json`

Uses `expo-local-authentication` for Face ID / fingerprint.

**Store — add:**
```typescript
biometricLockEnabled: boolean;
setBiometricLockEnabled: (enabled: boolean) => void;
```

**biometric-lock.tsx (~200 lines):**
- Check biometric availability via `LocalAuthentication.hasHardwareAsync()`
- Toggle switch to enable/disable
- Test authentication button
- Info text explaining feature
- ScreenErrorBoundary

**_layout.tsx — add lock check:**
On app state change to 'active', if biometricLockEnabled:
```typescript
const result = await LocalAuthentication.authenticateAsync({
  promptMessage: 'Unlock Mizanly',
  fallbackLabel: 'Use passcode',
});
if (!result.success) { /* show lock overlay */ }
```

**~300 lines total**

---

## AGENT 3: DM Notes

**Creates:**
- `apps/api/src/modules/messages/dto/dm-note.dto.ts`
- `apps/mobile/app/(screens)/dm-note-editor.tsx`

**Modifies:**
- `apps/api/prisma/schema.prisma` (DMNote model — from Agent 0)
- `apps/api/src/modules/messages/messages.service.ts` (add DM note methods)
- `apps/api/src/modules/messages/messages.controller.ts` (add endpoints)
- `apps/mobile/src/services/api.ts` (add to messagesApi)
- `apps/mobile/src/types/index.ts` (add DMNote type)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — dm-note.dto.ts:**
```typescript
export class CreateDMNoteDto {
  @IsString() @MaxLength(60) content: string;
  @IsOptional() @IsInt() @Min(1) @Max(72) expiresInHours?: number; // default 24
}
```

**Backend — messages.service.ts — add methods:**
- `createDMNote(userId, dto)` — create/update note, set expiresAt = now + hours
- `getDMNote(userId)` — find unexpired note
- `deleteDMNote(userId)` — delete own note
- `getDMNotesForConversationList(userId)` — get notes from users you have conversations with

**Endpoints:**
```
POST   /messages/notes          (ClerkAuthGuard)
GET    /messages/notes/me       (ClerkAuthGuard)
DELETE /messages/notes/me       (ClerkAuthGuard)
GET    /messages/notes/contacts (ClerkAuthGuard) — notes from DM contacts
```

**Mobile — dm-note-editor.tsx (~200 lines):**
- Text input (max 60 chars) with CharCountRing
- Expiry picker (1h, 4h, 12h, 24h, 48h, 72h)
- Preview of how note appears in DM list
- GradientButton to post
- Delete option if note exists
- ScreenErrorBoundary

**~400 lines total**

---

## AGENT 4: Restrict User

**Creates:**
- `apps/api/src/modules/restricts/restricts.module.ts`
- `apps/api/src/modules/restricts/restricts.service.ts`
- `apps/api/src/modules/restricts/restricts.controller.ts`
- `apps/mobile/app/(screens)/restricted.tsx`

**Modifies:**
- `apps/api/prisma/schema.prisma` (Restrict model — from Agent 0)
- `apps/api/src/app.module.ts` (register RestrictsModule)
- `apps/mobile/src/services/api.ts` (add restrictsApi)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — restricts.service.ts:**
```typescript
async restrict(restricterId: string, restrictedId: string) {
  if (restricterId === restrictedId) throw new BadRequestException('Cannot restrict yourself');
  return this.prisma.restrict.create({ data: { restricterId, restrictedId } });
}

async unrestrict(restricterId: string, restrictedId: string) {
  return this.prisma.restrict.delete({
    where: { restricterId_restrictedId: { restricterId, restrictedId } },
  });
}

async getRestrictedList(userId: string, cursor?: string, limit = 20) { ... }

async isRestricted(restricterId: string, restrictedId: string): Promise<boolean> { ... }
```

**Endpoints:**
```
POST   /restricts/:userId    (ClerkAuthGuard)
DELETE /restricts/:userId    (ClerkAuthGuard)
GET    /restricts            (ClerkAuthGuard) — paginated list
```

**Mobile — restricted.tsx (~200 lines):**
- FlatList of restricted users with Avatar + name
- Swipe to unrestrict or "Unrestrict" button
- EmptyState when none
- ScreenErrorBoundary, RefreshControl

**~300 lines total**

---

## AGENT 5: Hide Reply

**Modifies:**
- `apps/api/prisma/schema.prisma` (add isHidden to Comment — from Agent 0)
- `apps/api/src/modules/posts/posts.service.ts` (add hideComment, unhideComment, filter hidden)
- `apps/api/src/modules/posts/posts.controller.ts` (add endpoints)
- `apps/mobile/src/services/api.ts` (add to postsApi)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — posts.service.ts — add methods:**
```typescript
async hideComment(commentId: string, userId: string) {
  // Only post author can hide comments on their post
  const comment = await this.prisma.comment.findUnique({
    where: { id: commentId },
    include: { post: { select: { userId: true } } },
  });
  if (!comment) throw new NotFoundException();
  if (comment.post.userId !== userId) throw new ForbiddenException();
  return this.prisma.comment.update({ where: { id: commentId }, data: { isHidden: true } });
}

async unhideComment(commentId: string, userId: string) { /* same auth check, set false */ }
```

**Modify `getComments`:** Add `isHidden: false` to where clause. Add separate endpoint `GET /posts/:id/comments/hidden` for post author to see hidden replies.

**Endpoints:**
```
POST   /posts/:postId/comments/:commentId/hide   (ClerkAuthGuard)
DELETE /posts/:postId/comments/:commentId/hide   (ClerkAuthGuard)
GET    /posts/:postId/comments/hidden             (ClerkAuthGuard) — author only
```

**~200 lines total**

---

## AGENT 6: Undo Send

**Modifies:**
- `apps/mobile/src/store/index.ts` (add undoSendSeconds setting)
- `apps/mobile/app/(screens)/conversation/[id].tsx` (add undo toast after sending)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Mobile — conversation/[id].tsx — modify send flow:**
When user sends a message:
1. Show message immediately in UI (optimistic)
2. Show "Undo" toast/bar at bottom for N seconds (configurable, default 5)
3. If "Undo" tapped: remove message from UI, cancel API call
4. If timer expires: actually send via API + socket

Implementation:
```typescript
const [pendingMessage, setPendingMessage] = useState<{ content: string; timer: NodeJS.Timeout } | null>(null);

const handleSend = () => {
  // Add to local messages (optimistic)
  const timer = setTimeout(() => {
    // Actually send via mutation
    sendMutation.mutate({ content, conversationId });
    setPendingMessage(null);
  }, undoSendSeconds * 1000);
  setPendingMessage({ content, timer });
};

const handleUndo = () => {
  if (pendingMessage) {
    clearTimeout(pendingMessage.timer);
    // Remove optimistic message from list
    setPendingMessage(null);
  }
};
```

**~200 lines total**

---

## AGENT 7: Muted Conversations

**Modifies:**
- `apps/api/src/modules/messages/messages.service.ts` (add mute/unmute conversation methods)
- `apps/api/src/modules/messages/messages.controller.ts` (add endpoints)
- `apps/mobile/app/(screens)/conversation-info.tsx` (add mute toggle)
- `apps/mobile/src/services/api.ts` (add to messagesApi)
- `apps/mobile/src/i18n/en.json` + `ar.json`

Schema already has `ConversationMember.isMuted`. Just wire it up.

**Backend — messages.service.ts — add methods:**
```typescript
async muteConversation(userId: string, conversationId: string) {
  return this.prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { isMuted: true },
  });
}
async unmuteConversation(userId: string, conversationId: string) { /* isMuted: false */ }
```

**Endpoints:**
```
POST   /messages/conversations/:id/mute   (ClerkAuthGuard)
DELETE /messages/conversations/:id/mute   (ClerkAuthGuard)
```

**Mobile — conversation-info.tsx — add toggle:**
Add "Mute Conversation" switch row in the settings section.

**~200 lines total**

---

## AGENT 8: Quiet Mode

**Creates:**
- `apps/api/src/modules/settings/dto/quiet-mode.dto.ts`
- `apps/mobile/app/(screens)/quiet-mode.tsx`

**Modifies:**
- `apps/api/prisma/schema.prisma` (QuietModeSetting — from Agent 0)
- `apps/api/src/modules/settings/settings.service.ts` (add quiet mode methods)
- `apps/api/src/modules/settings/settings.controller.ts` (add endpoints)
- `apps/api/src/modules/notifications/notifications.service.ts` (check quiet mode before sending)
- `apps/mobile/src/services/api.ts` (add to settingsApi)
- `apps/mobile/app/(screens)/settings.tsx` (add quiet mode row)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — quiet-mode.dto.ts:**
```typescript
export class UpdateQuietModeDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(200) autoReply?: string;
  @IsOptional() @IsString() startTime?: string; // HH:mm
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsBoolean() isScheduled?: boolean;
}
```

**Endpoints:**
```
GET    /settings/quiet-mode    (ClerkAuthGuard)
PATCH  /settings/quiet-mode    (ClerkAuthGuard)
```

**notifications.service.ts — integrate:**
Before sending any push notification, check if user has active quiet mode. If yes, queue instead of send.

**Mobile — quiet-mode.tsx (~250 lines):**
- Toggle: "Quiet Mode" on/off
- Schedule option: start time + end time pickers
- Auto-reply text input (max 200 chars) with CharCountRing
- Info card: "Notifications will be silenced. DM senders will see your auto-reply."
- ScreenErrorBoundary

**~300 lines total**

---

## AGENT 9: Digital Wellbeing / Screen Time

**Creates:**
- `apps/mobile/app/(screens)/screen-time.tsx`

**Modifies:**
- `apps/api/prisma/schema.prisma` (ScreenTimeLog — from Agent 0)
- `apps/api/src/modules/settings/settings.service.ts` (add screen time log methods)
- `apps/api/src/modules/settings/settings.controller.ts` (add endpoints)
- `apps/mobile/src/store/index.ts` (add session tracking state)
- `apps/mobile/app/_layout.tsx` (add session timer)
- `apps/mobile/app/(screens)/settings.tsx` (add screen time row)
- `apps/mobile/src/services/api.ts`
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend endpoints:**
```
POST   /settings/screen-time/log     (ClerkAuthGuard) — log session
GET    /settings/screen-time/stats   (ClerkAuthGuard) — weekly stats
PATCH  /settings/screen-time/limit   (ClerkAuthGuard) — set daily limit
```

**Mobile — screen-time.tsx (~350 lines):**
- Today's usage: large time display (hours:minutes)
- Weekly bar chart (7 bars, one per day)
- Average daily usage
- Daily limit setter (15min increments via BottomSheet)
- "Take a Break" reminder toggle
- Session count today
- ScreenErrorBoundary, RefreshControl, Skeleton

**_layout.tsx — session tracking:**
Track app foreground time using AppState listener. Log to backend periodically (every 5min). Show warning when approaching limit.

**~500 lines total**

---

## AGENT 10: Auto-play Settings

**Modifies:**
- `apps/api/src/modules/settings/settings.service.ts` (add autoplay getter/setter)
- `apps/api/src/modules/settings/settings.controller.ts` (add endpoint)
- `apps/mobile/app/(screens)/media-settings.tsx` (add autoplay section)
- `apps/mobile/src/store/index.ts` (add autoPlaySetting)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Store — add:**
```typescript
autoPlaySetting: 'wifi' | 'always' | 'never';
setAutoPlaySetting: (s: 'wifi' | 'always' | 'never') => void;
```

**media-settings.tsx — add section:**
Three radio options: "WiFi only" (default), "Always", "Never". Saved to backend + local store.

**~200 lines total**

---

## AGENT 11: Clear Mode + Comment Swipe-to-Like

**Modifies:**
- `apps/mobile/app/(screens)/video/[id].tsx` (add clear mode toggle)
- `apps/mobile/app/(screens)/reel/[id].tsx` (add clear mode toggle)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Clear mode (~150 lines):**
Tap-to-toggle: hide all UI overlays (likes, comments, share buttons, caption). Tap again to show. Use Animated opacity.

**Comment swipe-to-like (~150 lines):**
Add PanGestureHandler to comment rows. Swipe right >50px triggers like with haptic feedback. Show heart icon sliding in from left.

**~300 lines total**

---

## AGENT 12: Cross-post Between Spaces

**Creates:**
- `apps/api/src/modules/posts/dto/cross-post.dto.ts`
- `apps/mobile/app/(screens)/cross-post.tsx`

**Modifies:**
- `apps/api/src/modules/posts/posts.service.ts` (add crossPost method)
- `apps/api/src/modules/posts/posts.controller.ts` (add endpoint)
- `apps/mobile/src/services/api.ts` (add to postsApi)
- `apps/mobile/src/i18n/en.json` + `ar.json`

**Backend — cross-post.dto.ts:**
```typescript
export class CrossPostDto {
  @IsArray() @IsIn(['SAF', 'MAJLIS', 'BAKRA', 'MINBAR'], { each: true })
  targetSpaces: string[];
  @IsOptional() @IsString() @MaxLength(2000) captionOverride?: string;
}
```

**Backend — posts.service.ts — add method:**
```typescript
async crossPost(userId: string, postId: string, dto: CrossPostDto) {
  const post = await this.prisma.post.findFirst({ where: { id: postId, userId } });
  if (!post) throw new NotFoundException();
  // For each target space, create a new post with same content + media but different space
  const newPosts = [];
  for (const space of dto.targetSpaces) {
    const newPost = await this.prisma.post.create({
      data: {
        userId,
        content: dto.captionOverride || post.content,
        mediaUrls: post.mediaUrls,
        mediaTypes: post.mediaTypes,
        postType: post.postType,
        space,
        crossPostedFromId: postId,
      },
    });
    newPosts.push(newPost);
  }
  return newPosts;
}
```

Note: May need to add `crossPostedFromId String?` and `space String?` to Post model if not present.

**Endpoint:** `POST /posts/:id/cross-post` (ClerkAuthGuard)

**Mobile — cross-post.tsx (~250 lines):**
- Source post preview card
- Space selector: checkboxes for Saf, Majlis, Bakra, Minbar (exclude current)
- Optional caption override input
- "Cross-post" GradientButton
- Success confirmation
- ScreenErrorBoundary

**~400 lines total**

---

## CONFLICT MATRIX

| File | Agents |
|------|--------|
| `schema.prisma` | 0 only (first) |
| `settings.service.ts` | 8, 9, 10 (distinct methods) |
| `settings.controller.ts` | 8, 9, 10 (distinct endpoints) |
| `posts.service.ts` | 5, 12 (distinct methods) |
| `posts.controller.ts` | 5, 12 (distinct endpoints) |
| `messages.service.ts` | 3, 7 (distinct methods) |
| `messages.controller.ts` | 3, 7 (distinct endpoints) |
| `store/index.ts` | 2, 9, 10 (distinct fields) |
| `settings.tsx` | 2, 8, 9 (different rows) |
| `_layout.tsx` | 2, 9 (biometric + screen time — different hooks) |
| `i18n/*.json` | All (each adds own namespace) |
| `api.ts` | 1, 3, 4, 5, 7, 8, 9, 10, 12 (each adds to different API groups) |

**Resolution:** Agent 0 (schema) first. All others parallel — they touch distinct sections.

---

## EXECUTION ORDER

1. **Agent 0** (schema) — MUST complete first
2. **Agents 1-12** — all in parallel after Agent 0
3. **Final**: `npx prisma db push` + verify

---

## ESTIMATED OUTPUT

| Agent | Feature | Lines |
|-------|---------|-------|
| 0 | Schema | ~80 |
| 1 | Contact sync | ~400 |
| 2 | Biometric app lock | ~300 |
| 3 | DM Notes | ~400 |
| 4 | Restrict user | ~300 |
| 5 | Hide reply | ~200 |
| 6 | Undo send | ~200 |
| 7 | Muted conversations | ~200 |
| 8 | Quiet mode | ~300 |
| 9 | Screen time / wellbeing | ~500 |
| 10 | Auto-play settings | ~200 |
| 11 | Clear mode + swipe-to-like | ~300 |
| 12 | Cross-post between spaces | ~400 |
| **TOTAL** | | **~3,780** |

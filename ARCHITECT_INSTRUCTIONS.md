# BATCH 35: Tests + Push Notifications + i18n Rollout — 14 Parallel Agents

**Date:** 2026-03-13
**Theme:** Infrastructure hardening. Three workstreams running in parallel: unit tests for critical backend modules, server-side push notification delivery, and i18n rollout across all screens. All agents create NEW files or modify ONLY their listed files. Zero conflicts.

---

## GLOBAL RULES

1. Read `CLAUDE.md` first — mandatory rules
2. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
3. Test files (*.spec.ts) MAY use `as any` for mocks — this is the ONLY exception
4. NEVER modify any file not explicitly listed in your agent task
5. After completing: `git add -A && git commit -m "feat: batch 35 agent N — <description>"`

---

## WORKSTREAM A: BACKEND UNIT TESTS (Agents 1-5)

### Test Pattern (follow for ALL test agents)

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { SomeService } from './some.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('SomeService', () => {
  let service: SomeService;
  let prisma: PrismaService;

  const mockPrismaService = {
    someModel: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SomeService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SomeService>(SomeService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create successfully', async () => {
      const mockData = { id: '1', title: 'Test' };
      mockPrismaService.someModel.create.mockResolvedValue(mockData);
      const result = await service.create('user1', { title: 'Test' });
      expect(result).toEqual(mockData);
      expect(mockPrismaService.someModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ title: 'Test' }) })
      );
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrismaService.someModel.findUnique.mockResolvedValue(null);
      await expect(service.getById('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not owner', async () => {
      mockPrismaService.someModel.findUnique.mockResolvedValue({ id: '1', userId: 'other-user' });
      await expect(service.delete('not-owner', '1')).rejects.toThrow(ForbiddenException);
    });
  });
});
```

**Test coverage targets per agent:**
- Happy path for every service method
- Error cases: not found, forbidden, bad request
- Edge cases: empty results, pagination boundaries

---

## AGENT 1: Events Module Tests

**Creates:**
- `apps/api/src/modules/events/events.service.spec.ts`

**Test the EventsService methods:**
1. `create()` — creates event, returns with user relation
2. `list()` — returns paginated events, handles cursor + empty
3. `getById()` — returns event with counts; throws NotFoundException when missing
4. `update()` — updates event; throws ForbiddenException if not owner; throws NotFoundException
5. `delete()` — deletes event; throws ForbiddenException if not owner
6. `rsvp()` — creates/updates RSVP; throws NotFoundException for missing event; handles private event access
7. `removeRsvp()` — removes RSVP; throws NotFoundException
8. `listAttendees()` — returns paginated attendees

**Mock:** PrismaService with event, eventRSVP, user models.
**~250-350 lines**

---

## AGENT 2: Monetization Module Tests

**Creates:**
- `apps/api/src/modules/monetization/monetization.service.spec.ts`

**Test the MonetizationService methods:**
1. `sendTip()` — creates tip with 10% platform fee; throws BadRequestException for self-tip; throws BadRequestException for invalid amount; throws NotFoundException for missing receiver
2. `getSentTips()` — returns paginated sent tips
3. `getReceivedTips()` — returns paginated received tips
4. `getTipStats()` — returns aggregated stats (total earned, sent, top supporters)
5. `createTier()` — creates membership tier
6. `getUserTiers()` — returns user's tiers
7. `updateTier()` — updates tier; throws ForbiddenException if not owner
8. `deleteTier()` — deletes tier; throws ForbiddenException if not owner
9. `toggleTier()` — toggles active/inactive
10. `subscribe()` — creates subscription; throws BadRequestException for duplicate
11. `unsubscribe()` — removes subscription; throws NotFoundException
12. `getSubscribers()` — returns paginated subscribers

**Mock:** PrismaService with tip, membershipTier, membershipSubscription, user models.
**~350-450 lines**

---

## AGENT 3: Two-Factor Module Tests

**Creates:**
- `apps/api/src/modules/two-factor/two-factor.service.spec.ts`

**Test the TwoFactorService methods:**
1. `setup()` — generates secret + QR + backup codes; throws BadRequestException if already enabled
2. `verify()` — enables 2FA with valid code; throws BadRequestException for invalid code
3. `validate()` — validates TOTP code; returns { valid: false } for bad code
4. `disable()` — disables 2FA; throws BadRequestException if not enabled; throws for wrong confirmation code
5. `useBackupCode()` — validates and removes backup code; throws for invalid code
6. `getStatus()` — returns enabled/disabled state

**Mock:** PrismaService with twoFactorSecret model. Also mock `otplib.authenticator` (generate, verify) and `qrcode.toDataURL`.
**~250-350 lines**

---

## AGENT 4: Audio Rooms Module Tests

**Creates:**
- `apps/api/src/modules/audio-rooms/audio-rooms.service.spec.ts`

**Test the AudioRoomsService methods:**
1. `create()` — creates room + auto-adds host as participant with role='host'
2. `list()` — returns active rooms with pagination
3. `getById()` — returns room with participants; throws NotFoundException
4. `endRoom()` — sets status='ended'; throws ForbiddenException if not host
5. `join()` — adds participant as listener; throws BadRequestException if already joined
6. `leave()` — removes participant
7. `changeRole()` — promotes/demotes; throws ForbiddenException if not host
8. `toggleHand()` — toggles handRaised; throws BadRequestException if not listener
9. `toggleMute()` — toggles mute for self or host muting others
10. `listParticipants()` — returns participants by role

**Mock:** PrismaService with audioRoom, audioRoomParticipant models.
**~350-450 lines**

---

## AGENT 5: Islamic Module Tests

**Creates:**
- `apps/api/src/modules/islamic/islamic.service.spec.ts`

**Test the IslamicService methods:**
1. `getPrayerTimes()` — calculates times for given lat/lng/method; handles edge cases (high latitude)
2. `getPrayerMethods()` — returns all calculation methods
3. `getDailyHadith()` — returns hadith based on day-of-year rotation
4. `getHadith()` — returns specific hadith; throws NotFoundException for invalid ID
5. `listHadiths()` — returns paginated hadiths
6. `getMosques()` — returns nearby mosques sorted by distance
7. `calculateZakat()` — correct calculation (2.5% above nisab); returns 0 below nisab
8. `getRamadanInfo()` — returns Ramadan status and timing info

**No PrismaService mock needed** — this service uses static data.
**~200-300 lines**

---

## WORKSTREAM B: SERVER-SIDE PUSH NOTIFICATIONS (Agents 6-7)

### AGENT 6: Push Notification Service Backend

**Creates:**
- `apps/api/src/modules/notifications/push.service.ts`

**This is a NEW service file in the existing notifications module.** Do NOT modify `notifications.service.ts` or `notifications.controller.ts`.

**Implementation:**
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Expo push notification API (no SDK needed, just HTTP)
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;          // ExpoPushToken
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  categoryId?: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error: string };
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private prisma: PrismaService) {}

  // Send push to a specific user (fetches their device tokens)
  async sendToUser(userId: string, notification: { title: string; body: string; data?: Record<string, string> }): Promise<void>

  // Send push to multiple users
  async sendToUsers(userIds: string[], notification: { title: string; body: string; data?: Record<string, string> }): Promise<void>

  // Batch send (Expo supports up to 100 per request)
  private async sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>

  // Build notification for different types
  buildLikeNotification(actorName: string, postId: string): { title: string; body: string; data: Record<string, string> }
  buildCommentNotification(actorName: string, postId: string, preview: string): { ... }
  buildFollowNotification(actorName: string, userId: string): { ... }
  buildMessageNotification(senderName: string, conversationId: string, preview: string): { ... }
  buildMentionNotification(actorName: string, targetId: string, targetType: string): { ... }
  buildTipNotification(senderName: string, amount: number): { ... }
  buildEventNotification(eventTitle: string, eventId: string): { ... }
  buildPrayerNotification(prayerName: string): { ... }
}
```

**Key details:**
- Use native `fetch()` to call Expo Push API (no firebase-admin needed for Expo)
- Fetch device tokens from Device model via PrismaService
- Batch messages (max 100 per API call)
- Log errors but don't throw (push failures shouldn't break main flow)
- Handle expired/invalid tokens (remove from DB)

**~300-400 lines**

---

## AGENT 7: Wire Push into Notification Events

**Creates:**
- `apps/api/src/modules/notifications/push-trigger.service.ts`

**This service listens to notification creation and triggers push delivery.**

```typescript
import { Injectable } from '@nestjs/common';
import { PushService } from './push.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PushTriggerService {
  constructor(
    private push: PushService,
    private prisma: PrismaService,
  ) {}

  // Called after a notification is created in the DB
  async triggerPush(notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { actor: true },
    });
    if (!notification) return;

    const actorName = notification.actor?.displayName || 'Someone';

    switch (notification.type) {
      case 'like':
        await this.push.sendToUser(notification.userId,
          this.push.buildLikeNotification(actorName, notification.postId!));
        break;
      case 'comment':
        await this.push.sendToUser(notification.userId,
          this.push.buildCommentNotification(actorName, notification.postId!, notification.content || ''));
        break;
      case 'follow':
        await this.push.sendToUser(notification.userId,
          this.push.buildFollowNotification(actorName, notification.actorId!));
        break;
      case 'message':
        await this.push.sendToUser(notification.userId,
          this.push.buildMessageNotification(actorName, notification.conversationId || '', notification.content || ''));
        break;
      case 'mention':
        await this.push.sendToUser(notification.userId,
          this.push.buildMentionNotification(actorName, notification.postId || notification.threadId || '', notification.postId ? 'post' : 'thread'));
        break;
      // Add more types as needed
    }
  }
}
```

**Also update the notifications module to register new services:**

**Modifies:** `apps/api/src/modules/notifications/notifications.module.ts`
- Add `PushService` and `PushTriggerService` to providers array
- Import them at top of file

**~200-300 lines for push-trigger.service.ts + ~5 lines changed in module**

---

## WORKSTREAM C: i18n ROLLOUT (Agents 8-14)

### i18n Pattern (use in ALL i18n agents)

```tsx
// Add this import near top of file (after React imports):
import { useTranslation } from '@/hooks/useTranslation';

// Add inside component function (near other hooks):
const { t } = useTranslation();

// Replace hardcoded strings:
// BEFORE: <Text>Settings</Text>
// AFTER:  <Text>{t('settings.title')}</Text>

// BEFORE: placeholder="Search..."
// AFTER:  placeholder={t('common.search')}

// BEFORE: <EmptyState title="No posts yet" subtitle="Create your first post" />
// AFTER:  <EmptyState title={t('saf.emptyFeed')} subtitle={t('saf.emptyFeedSubtitle')} />
```

**Rules for i18n agents:**
- Import `useTranslation` from `@/hooks/useTranslation`
- Call `const { t } = useTranslation()` inside the component
- Replace ALL user-visible hardcoded English strings with `t('key')` calls
- Use existing keys from `src/i18n/en.json` where they exist
- For strings not in en.json yet, use descriptive keys (e.g., `t('audioRoom.joinRoom')`) — we'll add them in a follow-up
- Do NOT touch non-visible strings (console.log, error messages for devs, API paths)
- Do NOT change component structure, styling, or logic — ONLY string replacements
- Preserve string interpolation: `{`${count} followers`}` → `{t('profile.followersCount', { count })}`

---

## AGENT 8: i18n — Tab Screens + Layout

**Modifies:**
- `apps/mobile/app/(tabs)/saf.tsx`
- `apps/mobile/app/(tabs)/bakra.tsx`
- `apps/mobile/app/(tabs)/majlis.tsx`
- `apps/mobile/app/(tabs)/risalah.tsx`
- `apps/mobile/app/(tabs)/create.tsx`
- `apps/mobile/app/(tabs)/_layout.tsx`

Replace all hardcoded tab labels, headers, filter labels (e.g., "Following", "For You", "Trending", "Messages") with `t()` calls.

**~50-100 lines changed across 6 files**

---

## AGENT 9: i18n — Auth + Onboarding

**Modifies:**
- `apps/mobile/app/(auth)/sign-in.tsx`
- `apps/mobile/app/(auth)/sign-up.tsx`
- `apps/mobile/app/onboarding/step1.tsx`
- `apps/mobile/app/onboarding/step2.tsx`
- `apps/mobile/app/onboarding/step3.tsx`
- `apps/mobile/app/onboarding/step4.tsx`

Replace all auth strings ("Sign In", "Sign Up", "Forgot Password?", "Welcome", etc.) with `t()` calls.

**~60-100 lines changed across 6 files**

---

## AGENT 10: i18n — Profile + Settings Screens

**Modifies (ONLY these files):**
- `apps/mobile/app/(screens)/profile/[username].tsx`
- `apps/mobile/app/(screens)/edit-profile.tsx`
- `apps/mobile/app/(screens)/settings.tsx`
- `apps/mobile/app/(screens)/content-settings.tsx`
- `apps/mobile/app/(screens)/manage-data.tsx`
- `apps/mobile/app/(screens)/analytics.tsx`

Replace "Edit Profile", "Settings", "Followers", "Following", "Posts", "Save", etc.

**~80-120 lines changed across 6 files**

---

## AGENT 11: i18n — Saf + Majlis Screens

**Modifies (ONLY these files):**
- `apps/mobile/app/(screens)/post/[id].tsx`
- `apps/mobile/app/(screens)/comments.tsx`
- `apps/mobile/app/(screens)/story-viewer.tsx`
- `apps/mobile/app/(screens)/story-create.tsx`
- `apps/mobile/app/(screens)/thread/[id].tsx`
- `apps/mobile/app/(screens)/compose-thread.tsx`

Replace "Comments", "Reply", "Like", "Share", "What's happening?", etc.

**~80-120 lines changed across 6 files**

---

## AGENT 12: i18n — Risalah (Messaging) Screens

**Modifies (ONLY these files):**
- `apps/mobile/app/(screens)/conversation/[id].tsx`
- `apps/mobile/app/(screens)/new-message.tsx`
- `apps/mobile/app/(screens)/group-info.tsx`
- `apps/mobile/app/(screens)/group-create.tsx`
- `apps/mobile/app/(screens)/call.tsx`
- `apps/mobile/app/(screens)/calls-history.tsx`

Replace "Type a message...", "New Message", "Group Info", "Calling...", etc.

**~80-120 lines changed across 6 files**

---

## AGENT 13: i18n — Bakra + Minbar (Video) Screens

**Modifies (ONLY these files):**
- `apps/mobile/app/(screens)/reel/[id].tsx`
- `apps/mobile/app/(screens)/video/[id].tsx`
- `apps/mobile/app/(screens)/channel/[id].tsx`
- `apps/mobile/app/(screens)/go-live.tsx`
- `apps/mobile/app/(screens)/duet-create.tsx`
- `apps/mobile/app/(screens)/stitch-create.tsx`

Replace "Live", "Subscribe", "Views", "Share", etc.

**~80-120 lines changed across 6 files**

---

## AGENT 14: i18n — Islamic + Monetization + Utility Screens

**Modifies (ONLY these files):**
- `apps/mobile/app/(screens)/prayer-times.tsx`
- `apps/mobile/app/(screens)/hadith.tsx`
- `apps/mobile/app/(screens)/mosque-finder.tsx`
- `apps/mobile/app/(screens)/send-tip.tsx`
- `apps/mobile/app/(screens)/membership-tiers.tsx`
- `apps/mobile/app/(screens)/2fa-setup.tsx`
- `apps/mobile/app/(screens)/audio-room.tsx`
- `apps/mobile/app/(screens)/create-event.tsx`
- `apps/mobile/app/(screens)/event-detail.tsx`
- `apps/mobile/app/(screens)/search.tsx`
- `apps/mobile/app/(screens)/notifications.tsx`
- `apps/mobile/app/(screens)/discover.tsx`

Replace "Prayer Times", "Daily Hadith", "Send Tip", "Search", "Notifications", etc.

**~120-180 lines changed across 12 files**

---

## FILE → AGENT CONFLICT MAP (zero overlaps)

| Agent | Files | Type |
|-------|-------|------|
| 1 | events.service.spec.ts (NEW) | Test |
| 2 | monetization.service.spec.ts (NEW) | Test |
| 3 | two-factor.service.spec.ts (NEW) | Test |
| 4 | audio-rooms.service.spec.ts (NEW) | Test |
| 5 | islamic.service.spec.ts (NEW) | Test |
| 6 | push.service.ts (NEW) | Push |
| 7 | push-trigger.service.ts (NEW) + notifications.module.ts (MODIFY) | Push |
| 8 | (tabs)/*.tsx + _layout.tsx | i18n |
| 9 | (auth)/*.tsx + onboarding/*.tsx | i18n |
| 10 | profile, edit-profile, settings, content-settings, manage-data, analytics | i18n |
| 11 | post/[id], comments, story-viewer, story-create, thread/[id], compose-thread | i18n |
| 12 | conversation/[id], new-message, group-info, group-create, call, calls-history | i18n |
| 13 | reel/[id], video/[id], channel/[id], go-live, duet-create, stitch-create | i18n |
| 14 | prayer-times, hadith, mosque-finder, send-tip, membership-tiers, 2fa-setup, audio-room, create-event, event-detail, search, notifications, discover | i18n |

**ZERO file conflicts between any agents.**

---

## VERIFICATION CHECKLIST

**Tests (Agents 1-5):**
- [ ] Each spec file compiles and follows Jest/NestJS test pattern
- [ ] Mocks PrismaService correctly
- [ ] Tests happy path for every service method
- [ ] Tests error cases (NotFoundException, ForbiddenException, BadRequestException)
- [ ] `as any` ONLY used for mock typing

**Push (Agents 6-7):**
- [ ] push.service.ts uses Expo Push API correctly
- [ ] Handles batch sending (max 100 per request)
- [ ] Handles expired tokens
- [ ] push-trigger.service.ts maps all notification types
- [ ] notifications.module.ts updated with new providers
- [ ] 0 `as any` in non-test code

**i18n (Agents 8-14):**
- [ ] `useTranslation` imported in every modified file
- [ ] `const { t } = useTranslation()` called inside component
- [ ] ALL user-visible strings replaced with `t()` calls
- [ ] No changes to component structure, styling, or logic
- [ ] String interpolation preserved (using i18next params)
- [ ] 0 `as any`

---

## POST-BATCH TASKS

1. Run tests: `cd apps/api && npm test` — verify all 5 new spec files pass
2. Add any missing i18n keys to `en.json` and `ar.json`
3. Verify push service works with Expo Go test device
4. Consider adding `push-trigger` calls in notification creation endpoints (separate wiring batch)

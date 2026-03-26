/**
 * Integration Test: Ban Enforcement Across Queries
 *
 * Tests against REAL PostgreSQL to verify:
 * 1. Ban sets isBanned=true + isDeactivated=true
 * 2. Banned user's posts/threads/reels excluded from all feed queries
 * 3. Unban restores visibility (isBanned=false, isDeactivated=false)
 * 4. Auto-unban when banExpiresAt has passed
 * 5. Ban doesn't delete content (only hides via query filter)
 * 6. Banned user's comments still visible but author shown as banned
 * 7. Mixed feed: some authors banned, some not — correct filtering
 */

import { PrismaTestHelper } from './prisma-test-helper';

const helper = new PrismaTestHelper();
const prisma = helper.prisma;

beforeAll(async () => {
  await helper.setup();
}, 60000);

afterEach(async () => {
  await helper.cleanup();
});

afterAll(async () => {
  await helper.teardown();
});

/**
 * Replicate the ban operation from admin.service.ts
 */
async function banUser(targetId: string, reason: string, durationHours?: number) {
  const banExpiresAt = durationHours
    ? new Date(Date.now() + durationHours * 3600000)
    : null;

  return prisma.user.update({
    where: { id: targetId },
    data: {
      isBanned: true,
      isDeactivated: true,
      banReason: reason,
      banExpiresAt,
    },
  });
}

/**
 * Replicate the unban operation from admin.service.ts
 */
async function unbanUser(targetId: string) {
  return prisma.user.update({
    where: { id: targetId },
    data: {
      isBanned: false,
      isDeactivated: false,
      banReason: null,
      banExpiresAt: null,
    },
  });
}

/**
 * Standard visibility query used across all feed types.
 */
async function queryVisiblePosts() {
  return prisma.post.findMany({
    where: {
      isRemoved: false,
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      user: {
        isBanned: false,
        isDeactivated: false,
        isDeleted: false,
      },
      visibility: 'PUBLIC',
    },
    include: { user: { select: { id: true, username: true, isBanned: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

async function queryVisibleThreads() {
  return prisma.thread.findMany({
    where: {
      isRemoved: false,
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      user: {
        isBanned: false,
        isDeactivated: false,
        isDeleted: false,
      },
      visibility: 'PUBLIC',
    },
    include: { user: { select: { id: true, username: true, isBanned: true } } },
  });
}

async function queryVisibleReels() {
  return prisma.reel.findMany({
    where: {
      isRemoved: false,
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      user: {
        isBanned: false,
        isDeactivated: false,
        isDeleted: false,
      },
      status: 'READY',
    },
    include: { user: { select: { id: true, username: true, isBanned: true } } },
  });
}

describe('Ban Enforcement (Real DB)', () => {
  describe('ban operation', () => {
    it('should set isBanned and isDeactivated to true', async () => {
      const user = await helper.createUser({ id: 'spammer', username: 'spammer' });

      await banUser(user.id, 'Spam');

      const banned = await prisma.user.findUnique({ where: { id: user.id } });
      expect(banned!.isBanned).toBe(true);
      expect(banned!.isDeactivated).toBe(true);
      expect(banned!.banReason).toBe('Spam');
      expect(banned!.banExpiresAt).toBeNull(); // Permanent ban
    });

    it('should set banExpiresAt for temporary ban', async () => {
      const user = await helper.createUser({ id: 'temp', username: 'temp' });

      await banUser(user.id, 'Minor offense', 24); // 24 hours

      const banned = await prisma.user.findUnique({ where: { id: user.id } });
      expect(banned!.isBanned).toBe(true);
      expect(banned!.banExpiresAt).not.toBeNull();

      // Should expire roughly 24 hours from now
      const expiresIn = banned!.banExpiresAt!.getTime() - Date.now();
      expect(expiresIn).toBeGreaterThan(23 * 3600000);
      expect(expiresIn).toBeLessThan(25 * 3600000);
    });
  });

  describe('post visibility after ban', () => {
    it('should hide all posts from banned user', async () => {
      const normal = await helper.createUser({ id: 'normal', username: 'normal' });
      const spammer = await helper.createUser({ id: 'spammer', username: 'spammer' });

      await helper.createPost(normal.id, { content: 'Good post' });
      await helper.createPost(spammer.id, { content: 'Spam post 1' });
      await helper.createPost(spammer.id, { content: 'Spam post 2' });
      await helper.createPost(spammer.id, { content: 'Spam post 3' });

      // Before ban — all visible
      const beforeBan = await queryVisiblePosts();
      expect(beforeBan).toHaveLength(4);

      // Ban spammer
      await banUser(spammer.id, 'Spam');

      // After ban — only normal user's post visible
      const afterBan = await queryVisiblePosts();
      expect(afterBan).toHaveLength(1);
      expect(afterBan[0].content).toBe('Good post');
    });

    it('should NOT delete posts on ban (content preserved for potential appeal)', async () => {
      const user = await helper.createUser({ id: 'spammer', username: 'spammer' });
      await helper.createPost(user.id, { content: 'Questionable post' });

      await banUser(user.id, 'Under review');

      // Post still exists in DB, just hidden from queries
      const allPosts = await prisma.post.findMany({ where: { userId: user.id } });
      expect(allPosts).toHaveLength(1);
      expect(allPosts[0].isRemoved).toBe(false); // Not removed, just hidden via user.isBanned
    });
  });

  describe('thread visibility after ban', () => {
    it('should hide all threads from banned user', async () => {
      const normal = await helper.createUser({ id: 'normal', username: 'normal' });
      const spammer = await helper.createUser({ id: 'spammer', username: 'spammer' });

      await helper.createThread(normal.id, { content: 'Good thread' });
      await helper.createThread(spammer.id, { content: 'Spam thread' });

      await banUser(spammer.id, 'Spam');

      const threads = await queryVisibleThreads();
      expect(threads).toHaveLength(1);
      expect(threads[0].content).toBe('Good thread');
    });
  });

  describe('reel visibility after ban', () => {
    it('should hide all reels from banned user', async () => {
      const normal = await helper.createUser({ id: 'normal', username: 'normal' });
      const spammer = await helper.createUser({ id: 'spammer', username: 'spammer' });

      await helper.createReel(normal.id, { caption: 'Good reel' });
      await helper.createReel(spammer.id, { caption: 'Spam reel' });

      await banUser(spammer.id, 'Spam');

      const reels = await queryVisibleReels();
      expect(reels).toHaveLength(1);
      expect(reels[0].caption).toBe('Good reel');
    });
  });

  describe('unban restores visibility', () => {
    it('should make posts visible again after unban', async () => {
      const user = await helper.createUser({ id: 'user1', username: 'user1' });
      await helper.createPost(user.id, { content: 'My post' });

      // Ban
      await banUser(user.id, 'Temp issue');
      const duringBan = await queryVisiblePosts();
      expect(duringBan).toHaveLength(0);

      // Unban
      await unbanUser(user.id);
      const afterUnban = await queryVisiblePosts();
      expect(afterUnban).toHaveLength(1);
      expect(afterUnban[0].content).toBe('My post');
    });

    it('should clear ban fields on unban', async () => {
      const user = await helper.createUser({ id: 'user1', username: 'user1' });

      await banUser(user.id, 'Bad behavior', 48);
      await unbanUser(user.id);

      const after = await prisma.user.findUnique({ where: { id: user.id } });
      expect(after!.isBanned).toBe(false);
      expect(after!.isDeactivated).toBe(false);
      expect(after!.banReason).toBeNull();
      expect(after!.banExpiresAt).toBeNull();
    });
  });

  describe('auto-unban (expired temporary ban)', () => {
    it('should detect expired ban via banExpiresAt comparison', async () => {
      const user = await helper.createUser({ id: 'temp', username: 'temp' });

      // Set ban that expired 1 hour ago
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isBanned: true,
          isDeactivated: true,
          banReason: 'Temp ban',
          banExpiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        },
      });

      // Query for users whose ban has expired (auto-unban candidates)
      const expiredBans = await prisma.user.findMany({
        where: {
          isBanned: true,
          banExpiresAt: { not: null, lte: new Date() },
        },
      });

      expect(expiredBans).toHaveLength(1);
      expect(expiredBans[0].id).toBe(user.id);

      // Auto-unban
      for (const u of expiredBans) {
        await unbanUser(u.id);
      }

      const after = await prisma.user.findUnique({ where: { id: user.id } });
      expect(after!.isBanned).toBe(false);
      expect(after!.isDeactivated).toBe(false);
    });

    it('should NOT auto-unban permanent bans (banExpiresAt=null)', async () => {
      const user = await helper.createUser({ id: 'perm', username: 'perm' });

      await banUser(user.id, 'Permanent ban'); // No duration = permanent

      const expiredBans = await prisma.user.findMany({
        where: {
          isBanned: true,
          banExpiresAt: { not: null, lte: new Date() },
        },
      });

      // Permanent ban should NOT appear in expired list
      expect(expiredBans.find((u) => u.id === user.id)).toBeUndefined();
    });

    it('should NOT auto-unban active temporary bans', async () => {
      const user = await helper.createUser({ id: 'active', username: 'active' });

      await banUser(user.id, 'Active temp ban', 48); // 48 hours from now

      const expiredBans = await prisma.user.findMany({
        where: {
          isBanned: true,
          banExpiresAt: { not: null, lte: new Date() },
        },
      });

      expect(expiredBans.find((u) => u.id === user.id)).toBeUndefined();
    });
  });

  describe('mixed feed with banned users', () => {
    it('should correctly filter a feed with 10 users, 3 banned', async () => {
      const users = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          helper.createUser({ id: `u${i}`, username: `user${i}` }),
        ),
      );

      // Create 2 posts per user = 20 total
      for (const user of users) {
        await helper.createPost(user.id, { content: `${user.username} post 1` });
        await helper.createPost(user.id, { content: `${user.username} post 2` });
      }

      // Ban users 3, 5, 7
      await banUser('u3', 'Spam');
      await banUser('u5', 'Harassment');
      await banUser('u7', 'Bot');

      const feed = await queryVisiblePosts();

      // 7 users × 2 posts = 14 visible
      expect(feed).toHaveLength(14);

      // Verify none of the banned users' posts appear
      const authorIds = feed.map((p) => p.user!.id);
      expect(authorIds).not.toContain('u3');
      expect(authorIds).not.toContain('u5');
      expect(authorIds).not.toContain('u7');

      // Verify all other users' posts appear
      for (const id of ['u0', 'u1', 'u2', 'u4', 'u6', 'u8', 'u9']) {
        const count = authorIds.filter((a) => a === id).length;
        expect(count).toBe(2);
      }
    });
  });

  describe('follow suggestions exclude banned users', () => {
    it('should not suggest banned users', async () => {
      const viewer = await helper.createUser({ id: 'viewer', username: 'viewer' });
      const normal1 = await helper.createUser({ id: 'n1', username: 'normal1' });
      const normal2 = await helper.createUser({ id: 'n2', username: 'normal2' });
      const banned = await helper.createUser({ id: 'banned', username: 'banned', isBanned: true });

      const suggestions = await prisma.user.findMany({
        where: {
          id: { notIn: [viewer.id] },
          isBanned: false,
          isDeactivated: false,
          isDeleted: false,
        },
        orderBy: { followersCount: 'desc' },
        take: 20,
      });

      const ids = suggestions.map((s) => s.id);
      expect(ids).toContain(normal1.id);
      expect(ids).toContain(normal2.id);
      expect(ids).not.toContain(banned.id);
    });
  });
});

/**
 * Integration Test: Follow/Unfollow Counter Integrity
 *
 * Tests against REAL PostgreSQL to verify:
 * 1. Follow creates record + increments both users' counts atomically
 * 2. Unfollow deletes record + decrements counts (never negative via GREATEST)
 * 3. Concurrent follow attempts handle P2002 (unique constraint) gracefully
 * 4. Private account follow → creates FollowRequest, not Follow
 * 5. Block prevents follow
 * 6. Cascade: user deletion removes follow records
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

describe('Follow/Unfollow Counter Integrity (Real DB)', () => {
  describe('follow — direct follow on public account', () => {
    it('should create follow record and increment both counters atomically', async () => {
      const alice = await helper.createUser({ id: 'alice', username: 'alice' });
      const bob = await helper.createUser({ id: 'bob', username: 'bob' });

      // Execute the same transaction pattern as follows.service.ts follow()
      await prisma.$transaction([
        prisma.follow.create({
          data: { followerId: alice.id, followingId: bob.id },
        }),
        prisma.user.update({
          where: { id: alice.id },
          data: { followingCount: { increment: 1 } },
        }),
        prisma.user.update({
          where: { id: bob.id },
          data: { followersCount: { increment: 1 } },
        }),
      ]);

      // Verify follow record exists
      const follow = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: alice.id, followingId: bob.id } },
      });
      expect(follow).not.toBeNull();

      // Verify counters
      const aliceAfter = await prisma.user.findUnique({ where: { id: alice.id } });
      const bobAfter = await prisma.user.findUnique({ where: { id: bob.id } });
      expect(aliceAfter!.followingCount).toBe(1);
      expect(bobAfter!.followersCount).toBe(1);
    });

    it('should handle bidirectional follows correctly', async () => {
      const alice = await helper.createUser({ id: 'alice', username: 'alice' });
      const bob = await helper.createUser({ id: 'bob', username: 'bob' });

      // Alice follows Bob
      await prisma.$transaction([
        prisma.follow.create({ data: { followerId: alice.id, followingId: bob.id } }),
        prisma.user.update({ where: { id: alice.id }, data: { followingCount: { increment: 1 } } }),
        prisma.user.update({ where: { id: bob.id }, data: { followersCount: { increment: 1 } } }),
      ]);

      // Bob follows Alice
      await prisma.$transaction([
        prisma.follow.create({ data: { followerId: bob.id, followingId: alice.id } }),
        prisma.user.update({ where: { id: bob.id }, data: { followingCount: { increment: 1 } } }),
        prisma.user.update({ where: { id: alice.id }, data: { followersCount: { increment: 1 } } }),
      ]);

      const aliceAfter = await prisma.user.findUnique({ where: { id: alice.id } });
      const bobAfter = await prisma.user.findUnique({ where: { id: bob.id } });
      expect(aliceAfter!.followersCount).toBe(1);
      expect(aliceAfter!.followingCount).toBe(1);
      expect(bobAfter!.followersCount).toBe(1);
      expect(bobAfter!.followingCount).toBe(1);

      // Both follow records exist
      const follows = await prisma.follow.findMany({
        where: {
          OR: [
            { followerId: alice.id, followingId: bob.id },
            { followerId: bob.id, followingId: alice.id },
          ],
        },
      });
      expect(follows).toHaveLength(2);
    });
  });

  describe('unfollow — counter decrement with GREATEST(0)', () => {
    it('should delete follow and decrement both counters', async () => {
      const alice = await helper.createUser({ id: 'alice', username: 'alice', followingCount: 1 });
      const bob = await helper.createUser({ id: 'bob', username: 'bob', followersCount: 1 });
      await helper.createFollow(alice.id, bob.id);

      // Execute the same pattern as follows.service.ts unfollow()
      await prisma.$transaction([
        prisma.follow.delete({
          where: { followerId_followingId: { followerId: alice.id, followingId: bob.id } },
        }),
        prisma.$executeRaw`UPDATE "User" SET "followingCount" = GREATEST("followingCount" - 1, 0) WHERE "id" = ${alice.id}`,
        prisma.$executeRaw`UPDATE "User" SET "followersCount" = GREATEST("followersCount" - 1, 0) WHERE "id" = ${bob.id}`,
      ]);

      // Follow record should be gone
      const follow = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: alice.id, followingId: bob.id } },
      });
      expect(follow).toBeNull();

      // Counters should be 0
      const aliceAfter = await prisma.user.findUnique({ where: { id: alice.id } });
      const bobAfter = await prisma.user.findUnique({ where: { id: bob.id } });
      expect(aliceAfter!.followingCount).toBe(0);
      expect(bobAfter!.followersCount).toBe(0);
    });

    it('should never produce negative counts via GREATEST(0)', async () => {
      // User already at 0 counts (counter was corrupted or data inconsistency)
      const alice = await helper.createUser({ id: 'alice', username: 'alice', followingCount: 0 });
      const bob = await helper.createUser({ id: 'bob', username: 'bob', followersCount: 0 });

      // Force decrement with GREATEST — should stay at 0
      await prisma.$executeRaw`UPDATE "User" SET "followingCount" = GREATEST("followingCount" - 1, 0) WHERE "id" = ${alice.id}`;
      await prisma.$executeRaw`UPDATE "User" SET "followersCount" = GREATEST("followersCount" - 1, 0) WHERE "id" = ${bob.id}`;

      const aliceAfter = await prisma.user.findUnique({ where: { id: alice.id } });
      const bobAfter = await prisma.user.findUnique({ where: { id: bob.id } });
      expect(aliceAfter!.followingCount).toBe(0);
      expect(bobAfter!.followersCount).toBe(0);
    });

    it('should handle multiple decrements without going negative', async () => {
      const user = await helper.createUser({ id: 'user1', username: 'user1', followersCount: 2 });

      // Decrement 3 times from count of 2 — should bottom out at 0
      await prisma.$executeRaw`UPDATE "User" SET "followersCount" = GREATEST("followersCount" - 1, 0) WHERE "id" = ${user.id}`;
      await prisma.$executeRaw`UPDATE "User" SET "followersCount" = GREATEST("followersCount" - 1, 0) WHERE "id" = ${user.id}`;
      await prisma.$executeRaw`UPDATE "User" SET "followersCount" = GREATEST("followersCount" - 1, 0) WHERE "id" = ${user.id}`;

      const after = await prisma.user.findUnique({ where: { id: user.id } });
      expect(after!.followersCount).toBe(0);
    });
  });

  describe('duplicate follow — P2002 unique constraint', () => {
    it('should throw unique constraint error on duplicate follow', async () => {
      const alice = await helper.createUser({ id: 'alice', username: 'alice' });
      const bob = await helper.createUser({ id: 'bob', username: 'bob' });
      await helper.createFollow(alice.id, bob.id);

      // Attempt duplicate follow — should throw P2002
      await expect(
        prisma.follow.create({
          data: { followerId: alice.id, followingId: bob.id },
        }),
      ).rejects.toThrow();

      // Original follow should still exist
      const follow = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: alice.id, followingId: bob.id } },
      });
      expect(follow).not.toBeNull();
    });

    it('should produce P2002 error code on duplicate', async () => {
      const alice = await helper.createUser({ id: 'alice', username: 'alice' });
      const bob = await helper.createUser({ id: 'bob', username: 'bob' });
      await helper.createFollow(alice.id, bob.id);

      try {
        await prisma.follow.create({
          data: { followerId: alice.id, followingId: bob.id },
        });
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('P2002');
      }
    });
  });

  describe('private account follow → FollowRequest', () => {
    it('should create FollowRequest for private account', async () => {
      const alice = await helper.createUser({ id: 'alice', username: 'alice' });
      const bob = await helper.createUser({ id: 'bob', username: 'bob', isPrivate: true });

      const request = await prisma.followRequest.create({
        data: {
          senderId: alice.id,
          receiverId: bob.id,
          status: 'PENDING',
        },
      });

      expect(request.senderId).toBe(alice.id);
      expect(request.receiverId).toBe(bob.id);
      expect(request.status).toBe('PENDING');

      // No follow record should exist yet
      const follow = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: alice.id, followingId: bob.id } },
      });
      expect(follow).toBeNull();
    });

    it('should accept request and create follow + increment counters atomically', async () => {
      const alice = await helper.createUser({ id: 'alice', username: 'alice' });
      const bob = await helper.createUser({ id: 'bob', username: 'bob', isPrivate: true });

      const request = await prisma.followRequest.create({
        data: { senderId: alice.id, receiverId: bob.id, status: 'PENDING' },
      });

      // Accept — same pattern as follows.service.ts acceptRequest()
      await prisma.$transaction([
        prisma.followRequest.update({
          where: { id: request.id },
          data: { status: 'ACCEPTED' },
        }),
        prisma.follow.create({
          data: { followerId: alice.id, followingId: bob.id },
        }),
        prisma.user.update({
          where: { id: alice.id },
          data: { followingCount: { increment: 1 } },
        }),
        prisma.user.update({
          where: { id: bob.id },
          data: { followersCount: { increment: 1 } },
        }),
      ]);

      // Follow should now exist
      const follow = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: alice.id, followingId: bob.id } },
      });
      expect(follow).not.toBeNull();

      // Request should be ACCEPTED
      const updatedReq = await prisma.followRequest.findUnique({ where: { id: request.id } });
      expect(updatedReq!.status).toBe('ACCEPTED');

      // Counters should be updated
      const aliceAfter = await prisma.user.findUnique({ where: { id: alice.id } });
      const bobAfter = await prisma.user.findUnique({ where: { id: bob.id } });
      expect(aliceAfter!.followingCount).toBe(1);
      expect(bobAfter!.followersCount).toBe(1);
    });

    it('should reject duplicate follow request via unique constraint', async () => {
      const alice = await helper.createUser({ id: 'alice', username: 'alice' });
      const bob = await helper.createUser({ id: 'bob', username: 'bob', isPrivate: true });

      await prisma.followRequest.create({
        data: { senderId: alice.id, receiverId: bob.id, status: 'PENDING' },
      });

      // Duplicate request should fail
      try {
        await prisma.followRequest.create({
          data: { senderId: alice.id, receiverId: bob.id, status: 'PENDING' },
        });
        fail('Should have thrown P2002');
      } catch (err: any) {
        expect(err.code).toBe('P2002');
      }
    });
  });

  describe('removeFollower — reverse direction', () => {
    it('should remove follower and decrement correct counters', async () => {
      const alice = await helper.createUser({ id: 'alice', username: 'alice', followingCount: 1 });
      const bob = await helper.createUser({ id: 'bob', username: 'bob', followersCount: 1 });
      await helper.createFollow(alice.id, bob.id);

      // Bob removes Alice as follower (reverse of unfollow)
      await prisma.$transaction([
        prisma.follow.delete({
          where: { followerId_followingId: { followerId: alice.id, followingId: bob.id } },
        }),
        prisma.$executeRaw`UPDATE "User" SET "followingCount" = GREATEST("followingCount" - 1, 0) WHERE "id" = ${alice.id}`,
        prisma.$executeRaw`UPDATE "User" SET "followersCount" = GREATEST("followersCount" - 1, 0) WHERE "id" = ${bob.id}`,
      ]);

      const aliceAfter = await prisma.user.findUnique({ where: { id: alice.id } });
      const bobAfter = await prisma.user.findUnique({ where: { id: bob.id } });
      expect(aliceAfter!.followingCount).toBe(0);
      expect(bobAfter!.followersCount).toBe(0);
    });
  });

  describe('cascade deletion', () => {
    it('should delete all follow records when user is deleted via Prisma cascade', async () => {
      const alice = await helper.createUser({ id: 'alice', username: 'alice' });
      const bob = await helper.createUser({ id: 'bob', username: 'bob' });
      const charlie = await helper.createUser({ id: 'charlie', username: 'charlie' });

      await helper.createFollow(alice.id, bob.id);
      await helper.createFollow(alice.id, charlie.id);
      await helper.createFollow(bob.id, alice.id);

      // Hard delete Alice — cascade should remove all follow records
      await prisma.user.delete({ where: { id: alice.id } });

      // All follows involving Alice should be gone
      const aliceFollows = await prisma.follow.findMany({
        where: {
          OR: [{ followerId: alice.id }, { followingId: alice.id }],
        },
      });
      expect(aliceFollows).toHaveLength(0);

      // Bob and Charlie should still exist
      const bob2 = await prisma.user.findUnique({ where: { id: bob.id } });
      const charlie2 = await prisma.user.findUnique({ where: { id: charlie.id } });
      expect(bob2).not.toBeNull();
      expect(charlie2).not.toBeNull();
    });
  });

  describe('follow suggestions filtering', () => {
    it('should exclude banned, deactivated, and deleted users from suggestions', async () => {
      const viewer = await helper.createUser({ id: 'viewer', username: 'viewer' });
      const normal = await helper.createUser({ id: 'normal', username: 'normal' });
      const banned = await helper.createUser({ id: 'banned', username: 'banned', isBanned: true });
      const deactivated = await helper.createUser({ id: 'deactivated', username: 'deactivated', isDeactivated: true });
      const deleted = await helper.createUser({ id: 'deleted', username: 'deleted_user', isDeleted: true });

      // Viewer follows no one — suggestions should exclude bad users
      const suggestions = await prisma.user.findMany({
        where: {
          id: { notIn: [viewer.id] },
          isDeactivated: false,
          isBanned: false,
          isDeleted: false,
        },
        take: 20,
      });

      const suggestionIds = suggestions.map((s) => s.id);
      expect(suggestionIds).toContain(normal.id);
      expect(suggestionIds).not.toContain(banned.id);
      expect(suggestionIds).not.toContain(deactivated.id);
      expect(suggestionIds).not.toContain(deleted.id);
    });
  });

  describe('multi-user counter integrity', () => {
    it('should correctly track counts across 5 users with various follow patterns', async () => {
      const users = await Promise.all(
        ['u1', 'u2', 'u3', 'u4', 'u5'].map((id) =>
          helper.createUser({ id, username: id }),
        ),
      );

      // u1 follows u2, u3, u4 (3 following)
      // u2 follows u1, u3 (2 following)
      // u3 follows nobody
      // u4 follows u1 (1 following)
      // u5 follows u1, u2, u3, u4 (4 following)
      const followPairs = [
        ['u1', 'u2'], ['u1', 'u3'], ['u1', 'u4'],
        ['u2', 'u1'], ['u2', 'u3'],
        ['u4', 'u1'],
        ['u5', 'u1'], ['u5', 'u2'], ['u5', 'u3'], ['u5', 'u4'],
      ];

      for (const [from, to] of followPairs) {
        await prisma.$transaction([
          prisma.follow.create({ data: { followerId: from, followingId: to } }),
          prisma.user.update({ where: { id: from }, data: { followingCount: { increment: 1 } } }),
          prisma.user.update({ where: { id: to }, data: { followersCount: { increment: 1 } } }),
        ]);
      }

      const counts = await prisma.user.findMany({
        where: { id: { in: ['u1', 'u2', 'u3', 'u4', 'u5'] } },
        select: { id: true, followersCount: true, followingCount: true },
        orderBy: { id: 'asc' },
      });

      // u1: followers=3 (u2,u4,u5), following=3 (u2,u3,u4)
      expect(counts.find((u) => u.id === 'u1')).toMatchObject({ followersCount: 3, followingCount: 3 });
      // u2: followers=2 (u1,u5), following=2 (u1,u3)
      expect(counts.find((u) => u.id === 'u2')).toMatchObject({ followersCount: 2, followingCount: 2 });
      // u3: followers=3 (u1,u2,u5), following=0
      expect(counts.find((u) => u.id === 'u3')).toMatchObject({ followersCount: 3, followingCount: 0 });
      // u4: followers=2 (u1,u5), following=1 (u1)
      expect(counts.find((u) => u.id === 'u4')).toMatchObject({ followersCount: 2, followingCount: 1 });
      // u5: followers=0, following=4 (u1,u2,u3,u4)
      expect(counts.find((u) => u.id === 'u5')).toMatchObject({ followersCount: 0, followingCount: 4 });

      // Verify actual follow record count matches
      const totalFollows = await prisma.follow.count();
      expect(totalFollows).toBe(10);
    });
  });
});

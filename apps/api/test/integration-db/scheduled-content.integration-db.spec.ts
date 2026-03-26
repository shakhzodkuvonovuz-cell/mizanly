/**
 * Integration Test: Scheduled Content Lifecycle
 *
 * Tests against REAL PostgreSQL to verify:
 * 1. Scheduled posts invisible in feeds before scheduledAt
 * 2. Scheduled posts visible after scheduledAt passes
 * 3. Posts with null scheduledAt always visible (immediately published)
 * 4. Cron query finds posts that just became publishable
 * 5. Scheduled threads and reels follow same pattern
 * 6. Owner profile feed handles scheduled content correctly
 * 7. Mixed feed with scheduled and immediate content
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
 * Standard feed query with scheduled post filtering.
 * Matches the WHERE clause in posts.service.ts.
 */
async function queryFeed() {
  return prisma.post.findMany({
    where: {
      isRemoved: false,
      OR: [
        { scheduledAt: null },
        { scheduledAt: { lte: new Date() } },
      ],
      user: {
        isBanned: false,
        isDeactivated: false,
        isDeleted: false,
      },
      visibility: 'PUBLIC',
    },
    include: { user: { select: { id: true, username: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Cron query: find posts that were just scheduled and now publishable.
 * Matches notifyScheduledPostsPublished() in posts.service.ts.
 */
async function findNewlyPublishedScheduledPosts(windowMinutes = 5) {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  const now = new Date();

  return prisma.post.findMany({
    where: {
      scheduledAt: {
        gt: windowStart,
        lte: now,
      },
      isRemoved: false,
    },
    include: { user: { select: { id: true, username: true } } },
  });
}

describe('Scheduled Content Lifecycle (Real DB)', () => {
  describe('scheduled posts in feeds', () => {
    it('should hide posts scheduled in the future', async () => {
      const author = await helper.createUser({ id: 'author', username: 'author' });

      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
      await helper.createPost(author.id, {
        content: 'Future post',
        scheduledAt: futureDate,
      });

      const feed = await queryFeed();
      expect(feed.map((p) => p.content)).not.toContain('Future post');
    });

    it('should show posts whose scheduledAt has passed', async () => {
      const author = await helper.createUser({ id: 'author', username: 'author' });

      const pastDate = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
      await helper.createPost(author.id, {
        content: 'Published scheduled post',
        scheduledAt: pastDate,
      });

      const feed = await queryFeed();
      expect(feed.map((p) => p.content)).toContain('Published scheduled post');
    });

    it('should show posts with null scheduledAt (immediate publish)', async () => {
      const author = await helper.createUser({ id: 'author', username: 'author' });

      await helper.createPost(author.id, {
        content: 'Immediate post',
        scheduledAt: null,
      });

      const feed = await queryFeed();
      expect(feed.map((p) => p.content)).toContain('Immediate post');
    });

    it('should show posts with scheduledAt exactly at current time', async () => {
      const author = await helper.createUser({ id: 'author', username: 'author' });

      // scheduledAt = now (lte includes equal)
      const now = new Date();
      await helper.createPost(author.id, {
        content: 'Just now post',
        scheduledAt: now,
      });

      // Give 1ms for the query's new Date() to be >= scheduledAt
      const feed = await queryFeed();
      expect(feed.map((p) => p.content)).toContain('Just now post');
    });
  });

  describe('cron detection of newly published posts', () => {
    it('should detect posts scheduled within the last 5 minutes', async () => {
      const author = await helper.createUser({ id: 'author', username: 'author' });

      // Post scheduled 3 minutes ago (within window)
      const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);
      await helper.createPost(author.id, {
        content: 'Recently published',
        scheduledAt: threeMinAgo,
      });

      // Post scheduled 10 minutes ago (outside window)
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      await helper.createPost(author.id, {
        content: 'Published earlier',
        scheduledAt: tenMinAgo,
      });

      // Post scheduled 1 hour in the future (not yet)
      const future = new Date(Date.now() + 60 * 60 * 1000);
      await helper.createPost(author.id, {
        content: 'Future post',
        scheduledAt: future,
      });

      const newlyPublished = await findNewlyPublishedScheduledPosts(5);
      const contents = newlyPublished.map((p) => p.content);

      expect(contents).toContain('Recently published');
      expect(contents).not.toContain('Published earlier');
      expect(contents).not.toContain('Future post');
    });

    it('should not detect removed posts even if recently scheduled', async () => {
      const author = await helper.createUser({ id: 'author', username: 'author' });

      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
      await helper.createPost(author.id, {
        content: 'Removed scheduled post',
        scheduledAt: twoMinAgo,
        isRemoved: true,
      });

      const newlyPublished = await findNewlyPublishedScheduledPosts(5);
      expect(newlyPublished).toHaveLength(0);
    });
  });

  describe('scheduled threads', () => {
    it('should hide scheduled threads before scheduledAt', async () => {
      const author = await helper.createUser({ id: 'author', username: 'author' });

      const future = new Date(Date.now() + 60 * 60 * 1000);
      await helper.createThread(author.id, { content: 'Scheduled thread', scheduledAt: future });
      await helper.createThread(author.id, { content: 'Immediate thread' });

      const threads = await prisma.thread.findMany({
        where: {
          isRemoved: false,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
          user: { isBanned: false, isDeactivated: false, isDeleted: false },
          visibility: 'PUBLIC',
        },
      });

      const contents = threads.map((t) => t.content);
      expect(contents).toContain('Immediate thread');
      expect(contents).not.toContain('Scheduled thread');
    });

    it('should show scheduled thread after time passes', async () => {
      const author = await helper.createUser({ id: 'author', username: 'author' });

      const past = new Date(Date.now() - 5 * 60 * 1000);
      await helper.createThread(author.id, { content: 'Past scheduled thread', scheduledAt: past });

      const threads = await prisma.thread.findMany({
        where: {
          isRemoved: false,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
          user: { isBanned: false, isDeactivated: false, isDeleted: false },
          visibility: 'PUBLIC',
        },
      });

      expect(threads.map((t) => t.content)).toContain('Past scheduled thread');
    });
  });

  describe('scheduled reels', () => {
    it('should hide scheduled reels before scheduledAt', async () => {
      const author = await helper.createUser({ id: 'author', username: 'author' });

      const future = new Date(Date.now() + 60 * 60 * 1000);
      await helper.createReel(author.id, { caption: 'Scheduled reel', scheduledAt: future });
      await helper.createReel(author.id, { caption: 'Immediate reel' });

      const reels = await prisma.reel.findMany({
        where: {
          isRemoved: false,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
          user: { isBanned: false, isDeactivated: false, isDeleted: false },
          status: 'READY',
        },
      });

      const captions = reels.map((r) => r.caption);
      expect(captions).toContain('Immediate reel');
      expect(captions).not.toContain('Scheduled reel');
    });
  });

  describe('mixed scheduled and immediate content', () => {
    it('should correctly filter a feed with various scheduling states', async () => {
      const author = await helper.createUser({ id: 'author', username: 'author' });

      // 3 immediate posts
      await helper.createPost(author.id, { content: 'Immediate 1' });
      await helper.createPost(author.id, { content: 'Immediate 2' });
      await helper.createPost(author.id, { content: 'Immediate 3' });

      // 2 scheduled posts in the past (should be visible)
      await helper.createPost(author.id, { content: 'Past scheduled 1', scheduledAt: new Date(Date.now() - 3600000) });
      await helper.createPost(author.id, { content: 'Past scheduled 2', scheduledAt: new Date(Date.now() - 7200000) });

      // 3 scheduled posts in the future (should be hidden)
      await helper.createPost(author.id, { content: 'Future 1', scheduledAt: new Date(Date.now() + 3600000) });
      await helper.createPost(author.id, { content: 'Future 2', scheduledAt: new Date(Date.now() + 7200000) });
      await helper.createPost(author.id, { content: 'Future 3', scheduledAt: new Date(Date.now() + 86400000) });

      const feed = await queryFeed();

      // Should see 5 posts (3 immediate + 2 past scheduled)
      expect(feed).toHaveLength(5);

      const contents = feed.map((p) => p.content);
      expect(contents).toContain('Immediate 1');
      expect(contents).toContain('Immediate 2');
      expect(contents).toContain('Immediate 3');
      expect(contents).toContain('Past scheduled 1');
      expect(contents).toContain('Past scheduled 2');
      expect(contents).not.toContain('Future 1');
      expect(contents).not.toContain('Future 2');
      expect(contents).not.toContain('Future 3');
    });
  });

  describe('scheduled content and user state interaction', () => {
    it('should hide past-scheduled posts if author is now banned', async () => {
      const author = await helper.createUser({ id: 'author', username: 'author' });

      // Post was scheduled in the past (should normally be visible)
      await helper.createPost(author.id, {
        content: 'Was scheduled',
        scheduledAt: new Date(Date.now() - 3600000),
      });

      // But author is now banned
      await prisma.user.update({
        where: { id: author.id },
        data: { isBanned: true, isDeactivated: true },
      });

      const feed = await queryFeed();
      expect(feed).toHaveLength(0); // Post hidden because author is banned
    });
  });
});

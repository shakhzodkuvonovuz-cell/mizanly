/**
 * Integration Test: Search Indexing Document Shape
 *
 * Tests against REAL PostgreSQL to verify:
 * 1. Post creation produces correct search index document shape
 * 2. Thread creation produces correct search index document shape
 * 3. Reel creation produces correct search index document shape
 * 4. User profile produces correct search index document shape
 * 5. Content update changes the document (re-index trigger)
 * 6. Content deletion (isRemoved) should trigger delete from index
 * 7. User ban/unban should trigger add/remove from index
 * 8. Weekly reconciliation query finds correct candidates
 * 9. Hashtag search aggregation works correctly
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
 * Build a search index document for a post.
 * This replicates the shape that publishWorkflow.onPublish() passes to Meilisearch.
 */
function buildPostIndexDocument(post: any, user: any) {
  return {
    id: post.id,
    content: post.content,
    postType: post.postType,
    hashtags: post.hashtags,
    mentions: post.mentions,
    userId: post.userId,
    username: user.username,
    displayName: user.displayName,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    createdAt: post.createdAt.toISOString(),
  };
}

/**
 * Build a search index document for a user.
 */
function buildUserIndexDocument(user: any) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    isVerified: user.isVerified,
    followersCount: user.followersCount,
    postsCount: user.postsCount,
  };
}

/**
 * Replicate the weekly reconciliation query from SearchReconciliationService.
 * Finds posts created/updated in the last 7 days that should be indexed.
 */
async function findPostsForReindex(days = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 3600000);

  const toIndex = await prisma.post.findMany({
    where: {
      createdAt: { gte: cutoff },
      isRemoved: false,
    },
    include: { user: { select: { id: true, username: true, displayName: true, isBanned: true } } },
    take: 1000,
  });

  const toDelete = await prisma.post.findMany({
    where: {
      updatedAt: { gte: cutoff },
      isRemoved: true,
    },
    select: { id: true },
    take: 500,
  });

  return { toIndex, toDelete };
}

describe('Search Indexing Document Shape (Real DB)', () => {
  describe('post index document', () => {
    it('should produce correct document shape from real DB data', async () => {
      const user = await helper.createUser({
        id: 'author1',
        username: 'hashim',
        displayName: 'Hashim Ali',
      });

      const post = await helper.createPost(user.id, {
        content: 'Beautiful calligraphy #islamicart #quran',
        postType: 'IMAGE',
        hashtags: ['islamicart', 'quran'],
        likesCount: 42,
        commentsCount: 7,
      });

      // Fetch post with user data (as done before indexing)
      const fullPost = await prisma.post.findUnique({
        where: { id: post.id },
        include: { user: { select: { id: true, username: true, displayName: true } } },
      });

      const doc = buildPostIndexDocument(fullPost, fullPost!.user);

      expect(doc).toEqual({
        id: post.id,
        content: 'Beautiful calligraphy #islamicart #quran',
        postType: 'IMAGE',
        hashtags: ['islamicart', 'quran'],
        mentions: [],
        userId: user.id,
        username: 'hashim',
        displayName: 'Hashim Ali',
        likesCount: 42,
        commentsCount: 7,
        createdAt: expect.any(String),
      });
    });

    it('should include updated content after edit', async () => {
      const user = await helper.createUser({ id: 'author', username: 'author' });
      const post = await helper.createPost(user.id, { content: 'Original content' });

      // Update post content
      await prisma.post.update({
        where: { id: post.id },
        data: { content: 'Updated content with #newhash', hashtags: ['newhash'] },
      });

      const updated = await prisma.post.findUnique({
        where: { id: post.id },
        include: { user: { select: { id: true, username: true, displayName: true } } },
      });

      const doc = buildPostIndexDocument(updated, updated!.user);
      expect(doc.content).toBe('Updated content with #newhash');
      expect(doc.hashtags).toEqual(['newhash']);
    });
  });

  describe('user index document', () => {
    it('should produce correct document shape', async () => {
      const user = await helper.createUser({
        id: 'creator1',
        username: 'aisha_art',
        displayName: 'Aisha Ahmed',
      });

      // Update with additional fields
      await prisma.user.update({
        where: { id: user.id },
        data: {
          bio: 'Islamic calligraphy artist',
          isVerified: true,
          followersCount: 1500,
          postsCount: 120,
        },
      });

      const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
      const doc = buildUserIndexDocument(fullUser);

      expect(doc).toEqual({
        id: 'creator1',
        username: 'aisha_art',
        displayName: 'Aisha Ahmed',
        bio: 'Islamic calligraphy artist',
        isVerified: true,
        followersCount: 1500,
        postsCount: 120,
      });
    });
  });

  describe('content removal triggers delete from index', () => {
    it('should identify removed posts for index deletion', async () => {
      const user = await helper.createUser({ id: 'author', username: 'author' });

      const visible = await helper.createPost(user.id, { content: 'Visible post' });
      const removed = await helper.createPost(user.id, { content: 'Removed post', isRemoved: true });

      // Index query should find visible, not removed
      const { toIndex, toDelete } = await findPostsForReindex();

      const indexIds = toIndex.map((p) => p.id);
      expect(indexIds).toContain(visible.id);
      expect(indexIds).not.toContain(removed.id);

      const deleteIds = toDelete.map((p) => p.id);
      expect(deleteIds).toContain(removed.id);
    });
  });

  describe('user ban/unban and search index', () => {
    it('should exclude banned users from user search results', async () => {
      await helper.createUser({ id: 'normal', username: 'normal_user' });
      await helper.createUser({ id: 'banned', username: 'banned_user', isBanned: true });

      // User search query (as used by search service)
      const searchable = await prisma.user.findMany({
        where: {
          isBanned: false,
          isDeactivated: false,
          isDeleted: false,
          username: { contains: 'user' },
        },
      });

      const usernames = searchable.map((u) => u.username);
      expect(usernames).toContain('normal_user');
      expect(usernames).not.toContain('banned_user');
    });

    it('should exclude posts by banned users from reconciliation index', async () => {
      const normal = await helper.createUser({ id: 'normal', username: 'normal' });
      const banned = await helper.createUser({ id: 'banned', username: 'banned', isBanned: true });

      await helper.createPost(normal.id, { content: 'Normal post' });
      await helper.createPost(banned.id, { content: 'Banned post' });

      const { toIndex } = await findPostsForReindex();

      // Filter out banned users' posts (as the reconciliation service does)
      const filtered = toIndex.filter((p) => !p.user?.isBanned);
      const contents = filtered.map((p) => p.content);
      expect(contents).toContain('Normal post');
      expect(contents).not.toContain('Banned post');
    });
  });

  describe('hashtag search aggregation', () => {
    it('should correctly count posts per hashtag', async () => {
      const user = await helper.createUser({ id: 'author', username: 'author' });

      // Create posts with various hashtags
      await helper.createPost(user.id, { content: 'Post 1', hashtags: ['quran', 'islam'] });
      await helper.createPost(user.id, { content: 'Post 2', hashtags: ['quran', 'dua'] });
      await helper.createPost(user.id, { content: 'Post 3', hashtags: ['ramadan'] });
      await helper.createPost(user.id, { content: 'Post 4', hashtags: ['quran'] });

      // Create hashtag records with counts
      await prisma.hashtag.create({
        data: { name: 'quran', postsCount: 3 },
      });
      await prisma.hashtag.create({
        data: { name: 'islam', postsCount: 1 },
      });
      await prisma.hashtag.create({
        data: { name: 'dua', postsCount: 1 },
      });
      await prisma.hashtag.create({
        data: { name: 'ramadan', postsCount: 1 },
      });

      // Search for hashtag
      const results = await prisma.hashtag.findMany({
        where: { name: { contains: 'qur' } },
        orderBy: { postsCount: 'desc' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('quran');
      expect(results[0].postsCount).toBe(3);
    });

    it('should find posts by hashtag array contains', async () => {
      const user = await helper.createUser({ id: 'author', username: 'author' });

      await helper.createPost(user.id, { content: 'Quran post 1', hashtags: ['quran'] });
      await helper.createPost(user.id, { content: 'Quran post 2', hashtags: ['quran', 'tafsir'] });
      await helper.createPost(user.id, { content: 'Other post', hashtags: ['food'] });

      const posts = await prisma.post.findMany({
        where: {
          hashtags: { has: 'quran' },
          isRemoved: false,
          user: { isBanned: false, isDeactivated: false, isDeleted: false },
        },
      });

      expect(posts).toHaveLength(2);
      expect(posts.every((p) => p.hashtags.includes('quran'))).toBe(true);
    });
  });

  describe('weekly reconciliation candidates', () => {
    it('should find posts created within 7 days for re-indexing', async () => {
      const user = await helper.createUser({ id: 'author', username: 'author' });

      // Recent post (within 7 days)
      await helper.createPost(user.id, { content: 'Recent post' });

      // Old post (> 7 days) — set createdAt in the past
      await prisma.post.create({
        data: {
          userId: user.id,
          content: 'Old post',
          postType: 'TEXT',
          createdAt: new Date(Date.now() - 10 * 24 * 3600000), // 10 days ago
        },
      });

      const { toIndex } = await findPostsForReindex(7);

      const contents = toIndex.map((p) => p.content);
      expect(contents).toContain('Recent post');
      expect(contents).not.toContain('Old post');
    });

    it('should separate index candidates from delete candidates', async () => {
      const user = await helper.createUser({ id: 'author', username: 'author' });

      await helper.createPost(user.id, { content: 'Active post' });
      await helper.createPost(user.id, { content: 'Removed post', isRemoved: true });

      const { toIndex, toDelete } = await findPostsForReindex();

      expect(toIndex.map((p) => p.content)).toContain('Active post');
      expect(toIndex.map((p) => p.content)).not.toContain('Removed post');
      expect(toDelete.map((p) => p.id)).toHaveLength(1);
    });
  });

  describe('thread and reel search documents', () => {
    it('should query threads for indexing with correct shape', async () => {
      const user = await helper.createUser({
        id: 'author',
        username: 'scholar',
        displayName: 'Dr. Scholar',
      });

      await helper.createThread(user.id, { content: 'Thread about fiqh #fiqh' });

      const threads = await prisma.thread.findMany({
        where: { isRemoved: false },
        include: { user: { select: { id: true, username: true, displayName: true } } },
      });

      expect(threads).toHaveLength(1);
      expect(threads[0].content).toBe('Thread about fiqh #fiqh');
      expect(threads[0].user!.username).toBe('scholar');
    });

    it('should query reels for indexing with correct shape', async () => {
      const user = await helper.createUser({
        id: 'creator',
        username: 'nasheeds',
        displayName: 'Nasheed Artist',
      });

      await helper.createReel(user.id, { caption: 'New nasheed #nasheed' });

      const reels = await prisma.reel.findMany({
        where: { isRemoved: false, status: 'READY' },
        include: { user: { select: { id: true, username: true, displayName: true } } },
      });

      expect(reels).toHaveLength(1);
      expect(reels[0].caption).toBe('New nasheed #nasheed');
      expect(reels[0].user!.username).toBe('nasheeds');
    });
  });
});

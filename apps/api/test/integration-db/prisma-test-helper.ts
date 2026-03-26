/**
 * Prisma Test Helper — manages real PostgreSQL connections for integration tests.
 *
 * This helper:
 * 1. Connects to a real PostgreSQL instance (CI or local)
 * 2. Pushes the Prisma schema (creates/updates all tables)
 * 3. Provides cleanup utilities between tests (truncate all tables)
 * 4. Disconnects on teardown
 *
 * Environment:
 * - CI: PostgreSQL is provisioned by GitHub Actions (see .github/workflows/ci.yml)
 * - Local: Requires a running PostgreSQL instance (docker or native)
 *
 * Usage:
 *   const helper = new PrismaTestHelper();
 *   beforeAll(() => helper.setup());
 *   afterEach(() => helper.cleanup());
 *   afterAll(() => helper.teardown());
 *   // Use helper.prisma for queries
 */

import { PrismaClient, NotificationType, CoinTransactionType } from '@prisma/client';
import { execSync } from 'child_process';
import * as path from 'path';

// Tables to preserve during cleanup (Prisma internal tables)
const PRESERVED_TABLES = ['_prisma_migrations'];

export class PrismaTestHelper {
  public prisma: PrismaClient;
  private tableNames: string[] = [];

  constructor() {
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://mizanly:mizanly_test@localhost:5432/mizanly_test';
    this.prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });
  }

  /**
   * Setup: connect to DB and push schema.
   * Called once in beforeAll.
   */
  async setup(): Promise<void> {
    // Push schema to test database (creates tables if they don't exist)
    const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://mizanly:mizanly_test@localhost:5432/mizanly_test';

    try {
      execSync(
        `npx prisma db push --schema="${schemaPath}" --skip-generate --accept-data-loss`,
        {
          env: { ...process.env, DATABASE_URL: databaseUrl },
          stdio: 'pipe',
          timeout: 60000,
        },
      );
    } catch (err) {
      const error = err as { stderr?: Buffer };
      const stderr = error.stderr?.toString() || '';
      // If tables already exist and are in sync, that's fine
      if (!stderr.includes('error')) {
        // Schema push succeeded or was already in sync
      } else {
        throw new Error(`Prisma schema push failed: ${stderr}`);
      }
    }

    await this.prisma.$connect();

    // Discover all table names for cleanup
    const tables = await this.prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    this.tableNames = tables
      .map((t) => t.tablename)
      .filter((name) => !PRESERVED_TABLES.includes(name));
  }

  /**
   * Cleanup: truncate all tables between tests.
   * Called in afterEach.
   * Uses TRUNCATE ... CASCADE to handle foreign key constraints.
   */
  async cleanup(): Promise<void> {
    if (this.tableNames.length === 0) return;

    // Truncate all tables in a single statement with CASCADE
    const tableList = this.tableNames.map((t) => `"${t}"`).join(', ');
    await this.prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${tableList} CASCADE`,
    );
  }

  /**
   * Teardown: disconnect from DB.
   * Called in afterAll.
   */
  async teardown(): Promise<void> {
    await this.prisma.$disconnect();
  }

  // ---------------------------------------------------------------------------
  // Seed helpers — create test data for specific test scenarios
  // ---------------------------------------------------------------------------

  /**
   * Create a user with sensible defaults.
   * Returns the created user.
   */
  async createUser(overrides: Partial<{
    id: string;
    clerkId: string;
    username: string;
    displayName: string;
    email: string;
    role: 'USER' | 'ADMIN' | 'CREATOR' | 'MODERATOR';
    isBanned: boolean;
    banReason: string;
    banExpiresAt: Date;
    isDeactivated: boolean;
    isDeleted: boolean;
    deletedAt: Date;
    isPrivate: boolean;
    followersCount: number;
    followingCount: number;
    postsCount: number;
  }> = {}) {
    const id = overrides.id || `user_${Math.random().toString(36).slice(2, 10)}`;
    return this.prisma.user.create({
      data: {
        id,
        clerkId: overrides.clerkId || `clerk_${id}`,
        username: overrides.username || `user_${id.slice(5)}`,
        displayName: overrides.displayName || `Test User ${id.slice(5)}`,
        email: overrides.email || `${id}@test.com`,
        role: overrides.role || 'USER',
        isBanned: overrides.isBanned ?? false,
        banReason: overrides.banReason,
        banExpiresAt: overrides.banExpiresAt,
        isDeactivated: overrides.isDeactivated ?? false,
        isDeleted: overrides.isDeleted ?? false,
        deletedAt: overrides.deletedAt,
        isPrivate: overrides.isPrivate ?? false,
        followersCount: overrides.followersCount ?? 0,
        followingCount: overrides.followingCount ?? 0,
        postsCount: overrides.postsCount ?? 0,
      },
    });
  }

  /**
   * Create a post with sensible defaults.
   */
  async createPost(userId: string, overrides: Partial<{
    id: string;
    content: string;
    postType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL';
    visibility: 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE';
    isRemoved: boolean;
    scheduledAt: Date | null;
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    savesCount: number;
    viewsCount: number;
    createdAt: Date;
    hashtags: string[];
  }> = {}) {
    const id = overrides.id || `post_${Math.random().toString(36).slice(2, 10)}`;
    return this.prisma.post.create({
      data: {
        id,
        userId,
        content: overrides.content || `Test post ${id}`,
        postType: overrides.postType || 'TEXT',
        visibility: overrides.visibility || 'PUBLIC',
        isRemoved: overrides.isRemoved ?? false,
        scheduledAt: overrides.scheduledAt === undefined ? null : overrides.scheduledAt,
        likesCount: overrides.likesCount ?? 0,
        commentsCount: overrides.commentsCount ?? 0,
        sharesCount: overrides.sharesCount ?? 0,
        savesCount: overrides.savesCount ?? 0,
        viewsCount: overrides.viewsCount ?? 0,
        createdAt: overrides.createdAt ?? new Date(),
        hashtags: overrides.hashtags ?? [],
      },
    });
  }

  /**
   * Create a thread with sensible defaults.
   */
  async createThread(userId: string, overrides: Partial<{
    id: string;
    content: string;
    isRemoved: boolean;
    scheduledAt: Date | null;
    visibility: 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE';
  }> = {}) {
    const id = overrides.id || `thread_${Math.random().toString(36).slice(2, 10)}`;
    return this.prisma.thread.create({
      data: {
        id,
        userId,
        content: overrides.content || `Test thread ${id}`,
        isChainHead: true,
        isRemoved: overrides.isRemoved ?? false,
        scheduledAt: overrides.scheduledAt === undefined ? null : overrides.scheduledAt,
        visibility: overrides.visibility || 'PUBLIC',
      },
    });
  }

  /**
   * Create a reel with sensible defaults.
   */
  async createReel(userId: string, overrides: Partial<{
    id: string;
    caption: string;
    isRemoved: boolean;
    scheduledAt: Date | null;
    status: 'PROCESSING' | 'READY' | 'FAILED';
  }> = {}) {
    const id = overrides.id || `reel_${Math.random().toString(36).slice(2, 10)}`;
    return this.prisma.reel.create({
      data: {
        id,
        userId,
        caption: overrides.caption || `Test reel ${id}`,
        videoUrl: 'https://example.com/test-video.mp4',
        duration: 15.0,
        isRemoved: overrides.isRemoved ?? false,
        scheduledAt: overrides.scheduledAt === undefined ? null : overrides.scheduledAt,
        status: overrides.status || 'READY',
      },
    });
  }

  /**
   * Create a follow relationship.
   */
  async createFollow(followerId: string, followingId: string) {
    return this.prisma.follow.create({
      data: { followerId, followingId },
    });
  }

  /**
   * Create a coin balance for a user.
   */
  async createCoinBalance(userId: string, coins = 0, diamonds = 0) {
    return this.prisma.coinBalance.create({
      data: { userId, coins, diamonds },
    });
  }

  /**
   * Create user settings (required by some queries).
   */
  async createUserSettings(userId: string) {
    return this.prisma.userSettings.create({
      data: { userId },
    });
  }

  /**
   * Create a comment on a post.
   */
  async createComment(postId: string, userId: string, content = 'Test comment') {
    return this.prisma.comment.create({
      data: { postId, userId, content },
    });
  }

  /**
   * Create a notification.
   */
  async createNotification(userId: string, overrides: Partial<{
    actorId: string;
    type: string;
    postId: string;
    isRead: boolean;
  }> = {}) {
    return this.prisma.notification.create({
      data: {
        userId,
        actorId: overrides.actorId,
        type: (overrides.type as NotificationType) || NotificationType.LIKE,
        postId: overrides.postId,
        isRead: overrides.isRead ?? false,
      },
    });
  }

  /**
   * Create a block relationship.
   */
  async createBlock(blockerId: string, blockedId: string) {
    return this.prisma.block.create({
      data: { blockerId, blockedId },
    });
  }

  /**
   * Create a mute relationship.
   */
  async createMute(userId: string, mutedId: string) {
    return this.prisma.mute.create({
      data: { userId, mutedId },
    });
  }

  /**
   * Create a story.
   */
  async createStory(userId: string, overrides: Partial<{
    id: string;
    mediaUrl: string;
    mediaType: string;
    expiresAt: Date;
  }> = {}) {
    const id = overrides.id || `story_${Math.random().toString(36).slice(2, 10)}`;
    return this.prisma.story.create({
      data: {
        id,
        userId,
        mediaUrl: overrides.mediaUrl || 'https://example.com/story.jpg',
        mediaType: overrides.mediaType || 'image/jpeg',
        expiresAt: overrides.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  /**
   * Create a saved post.
   */
  async createSavedPost(userId: string, postId: string) {
    return this.prisma.savedPost.create({
      data: { userId, postId },
    });
  }

  /**
   * Create a post reaction (like).
   */
  async createPostReaction(userId: string, postId: string) {
    return this.prisma.postReaction.create({
      data: { userId, postId, reaction: 'LIKE' },
    });
  }

  /**
   * Create a gift record.
   */
  async createGiftRecord(senderId: string, receiverId: string, overrides: Partial<{
    giftType: string;
    coinCost: number;
  }> = {}) {
    return this.prisma.giftRecord.create({
      data: {
        senderId,
        receiverId,
        giftType: overrides.giftType || 'rose',
        coinCost: overrides.coinCost || 1,
      },
    });
  }

  /**
   * Create a coin transaction.
   */
  async createCoinTransaction(userId: string, type: string, amount: number, description?: string) {
    return this.prisma.coinTransaction.create({
      data: {
        userId,
        type: type as CoinTransactionType,
        amount,
        description,
      },
    });
  }

  /**
   * Create a processed webhook event (for idempotency tests).
   */
  async createProcessedWebhookEvent(eventId: string) {
    return this.prisma.processedWebhookEvent.create({
      data: { eventId },
    });
  }
}

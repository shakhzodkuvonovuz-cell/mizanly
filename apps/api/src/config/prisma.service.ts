import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Enable Prisma query event logging for slow query detection
    super({
      log: [
        { emit: 'event', level: 'query' },
      ],
    });

    // Prisma query-level timing: log slow queries for performance investigation
    (this as any).$on('query', (e: { query: string; duration: number; params: string }) => {
      if (e.duration > 500) {
        this.logger.error(`VERY SLOW query (${e.duration}ms): ${e.query.slice(0, 300)}`);
      } else if (e.duration > 100) {
        this.logger.warn(`Slow query (${e.duration}ms): ${e.query.slice(0, 200)}`);
      }
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected');
      // Apply CHECK constraints (idempotent — safe to run on every startup)
      await this.applyCheckConstraints();
    } catch (error) {
      this.logger.error('Failed to connect to database — retrying in 1s', error instanceof Error ? error.message : error);
      // Retry once after 1 second before falling back to lazy connection on first query
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.$connect();
        this.logger.log('Database connected on retry');
      } catch (retryError) {
        this.logger.error('Database retry failed — will attempt connection on first query', retryError instanceof Error ? retryError.message : retryError);
      }
    }
  }

  /** Apply CHECK constraints on startup — prevents negative counters/balances at DB level.
   *  Idempotent: uses IF NOT EXISTS so safe to run on every startup. */
  private async applyCheckConstraints() {
    const constraints = [
      `ALTER TABLE coin_balances ADD CONSTRAINT IF NOT EXISTS coins_non_negative CHECK (coins >= 0)`,
      `ALTER TABLE coin_balances ADD CONSTRAINT IF NOT EXISTS diamonds_non_negative CHECK (diamonds >= 0)`,
      `ALTER TABLE posts ADD CONSTRAINT IF NOT EXISTS posts_likes_non_negative CHECK ("likesCount" >= 0)`,
      `ALTER TABLE posts ADD CONSTRAINT IF NOT EXISTS posts_comments_non_negative CHECK ("commentsCount" >= 0)`,
      `ALTER TABLE reels ADD CONSTRAINT IF NOT EXISTS reels_likes_non_negative CHECK ("likesCount" >= 0)`,
      `ALTER TABLE reels ADD CONSTRAINT IF NOT EXISTS reels_views_non_negative CHECK ("viewsCount" >= 0)`,
      `ALTER TABLE threads ADD CONSTRAINT IF NOT EXISTS threads_likes_non_negative CHECK ("likesCount" >= 0)`,
      `ALTER TABLE videos ADD CONSTRAINT IF NOT EXISTS videos_likes_non_negative CHECK ("likesCount" >= 0)`,
      `ALTER TABLE videos ADD CONSTRAINT IF NOT EXISTS videos_views_non_negative CHECK ("viewsCount" >= 0)`,
      `ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_followers_non_negative CHECK ("followersCount" >= 0)`,
      `ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_following_non_negative CHECK ("followingCount" >= 0)`,
      `ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_posts_non_negative CHECK ("postsCount" >= 0)`,
    ];
    for (const sql of constraints) {
      try {
        await this.$executeRawUnsafe(sql);
      } catch {
        // Constraint already exists or table doesn't exist yet — skip silently
      }
    }
    this.logger.log('CHECK constraints applied (12 non-negative guards)');

    // Apply pg_trgm GIN indexes for fast ILIKE search (replaces sequential scan)
    try {
      await this.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
      const trigramIndexes = [
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_content_trgm ON posts USING GIN (content gin_trgm_ops)`,
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_threads_content_trgm ON threads USING GIN (content gin_trgm_ops)`,
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_username_trgm ON users USING GIN (username gin_trgm_ops)`,
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_displayname_trgm ON users USING GIN ("displayName" gin_trgm_ops)`,
      ];
      for (const sql of trigramIndexes) {
        await this.$executeRawUnsafe(sql).catch(() => {}); // CONCURRENTLY may fail inside transaction
      }
      this.logger.log('pg_trgm GIN indexes applied (4 search indexes)');
    } catch {
      // pg_trgm extension not available (some hosted PostgreSQL plans don't support it)
      this.logger.warn('pg_trgm extension not available — ILIKE search uses sequential scan');
    }

    // E2E partial index: speed up queries that filter encrypted vs unencrypted messages
    try {
      await this.$executeRawUnsafe(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_e2e_version ON messages ("e2eVersion") WHERE "e2eVersion" IS NOT NULL`,
      ).catch(() => {});
      this.logger.log('E2E partial index applied on messages.e2eVersion');
    } catch {
      this.logger.warn('E2E partial index creation failed');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

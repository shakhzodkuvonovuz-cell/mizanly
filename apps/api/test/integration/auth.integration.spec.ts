import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, createUnauthTestApp } from './test-app';
import { FeedModule } from '../../src/modules/feed/feed.module';
import { PostsModule } from '../../src/modules/posts/posts.module';
import { UsersModule } from '../../src/modules/users/users.module';
import { PrismaModule } from '../../src/config/prisma.module';
import { RedisModule } from '../../src/config/redis.module';
import { EmbeddingsModule } from '../../src/modules/embeddings/embeddings.module';
import { PrismaService } from '../../src/config/prisma.service';
import {
  mockRedis,
  mockConfigService,
  mockNotificationsService,
  mockPushTriggerService,
  mockPushService,
  mockGamificationService,
  mockAiService,
  mockStreamService,
  mockAsyncJobService,
  mockAnalyticsService,
  mockFeatureFlagsService,
} from '../../src/common/test/mock-providers';

// Minimal Prisma mock for auth tests
const authPrismaMock = {
  user: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  post: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  follow: { findMany: jest.fn().mockResolvedValue([]) },
  block: { findMany: jest.fn().mockResolvedValue([]) },
  mute: { findMany: jest.fn().mockResolvedValue([]) },
  feedInteraction: {
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  like: { findMany: jest.fn().mockResolvedValue([]) },
  bookmark: { findMany: jest.fn().mockResolvedValue([]) },
  hashtag: { upsert: jest.fn() },
  notification: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) },
  dataExport: { findMany: jest.fn().mockResolvedValue([]) },
  $queryRaw: jest.fn().mockResolvedValue([]),
};

const sharedProviders = [
  { provide: PrismaService, useValue: authPrismaMock },
  mockRedis,
  mockConfigService,
  mockNotificationsService,
  mockPushTriggerService,
  mockPushService,
  mockGamificationService,
  mockAiService,
  mockStreamService,
  mockAsyncJobService,
  mockAnalyticsService,
  mockFeatureFlagsService,
];

describe('Auth Flow Integration Tests', () => {
  let authApp: INestApplication;
  let unauthApp: INestApplication;

  beforeAll(async () => {
    const sharedImports = [FeedModule, PrismaModule, RedisModule, EmbeddingsModule];

    authApp = await createTestApp({
      imports: sharedImports,
      providers: sharedProviders,
      userId: 'auth-user-1',
    });

    unauthApp = await createUnauthTestApp({
      imports: sharedImports,
      providers: sharedProviders,
    });
  });

  afterAll(async () => {
    await authApp.close();
    await unauthApp.close();
  });

  describe('Anonymous browsing (public endpoints)', () => {
    it('GET /feed/trending without token → 200 (anonymous browsing works)', async () => {
      const response = await request(unauthApp.getHttpServer())
        .get('/api/v1/feed/trending')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('GET /feed/featured without token → 200', async () => {
      const response = await request(unauthApp.getHttpServer())
        .get('/api/v1/feed/featured')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Auth-required endpoints (write operations)', () => {
    it('POST /posts without token → 403 (auth required for writes)', async () => {
      await request(unauthApp.getHttpServer())
        .post('/api/v1/posts')
        .send({
          postType: 'TEXT',
          content: 'Unauthorized post attempt',
          visibility: 'PUBLIC',
        })
        .expect(403);
    });

    it('POST /feed/signal without token → 403 (auth required)', async () => {
      await request(unauthApp.getHttpServer())
        .post('/api/v1/feed/signal')
        .send({ postId: 'p-1', signal: 'like' })
        .expect(403);
    });
  });

  describe('Authenticated requests', () => {
    it('GET /feed/trending with auth → 200', async () => {
      const response = await request(authApp.getHttpServer())
        .get('/api/v1/feed/trending')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });
});

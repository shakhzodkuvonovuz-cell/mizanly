import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, createUnauthTestApp } from './test-app';
import { FeedModule } from '../../src/modules/feed/feed.module';
import { PrismaModule } from '../../src/config/prisma.module';
import { RedisModule } from '../../src/config/redis.module';
import { PrismaService } from '../../src/config/prisma.service';
import { EmbeddingsModule } from '../../src/modules/embeddings/embeddings.module';
import {
  mockRedis,
  mockConfigService,
  mockPrismaService,
} from '../../src/common/test/mock-providers';

// Extended Prisma mock with feed-related models
const feedPrismaMock = {
  ...mockPrismaService.useValue,
  post: {
    findMany: jest.fn().mockResolvedValue([
      {
        id: 'post-1',
        userId: 'creator-1',
        content: 'Trending post about prayer',
        postType: 'TEXT',
        likesCount: 150,
        commentsCount: 30,
        sharesCount: 10,
        viewsCount: 2000,
        createdAt: new Date(),
        user: { id: 'creator-1', username: 'imam_ahmed', displayName: 'Imam Ahmed', avatarUrl: null, isVerified: true },
      },
      {
        id: 'post-2',
        userId: 'creator-2',
        content: 'Another trending post',
        postType: 'PHOTO',
        likesCount: 80,
        commentsCount: 15,
        sharesCount: 5,
        viewsCount: 1000,
        createdAt: new Date(),
        user: { id: 'creator-2', username: 'sister_fatima', displayName: 'Fatima', avatarUrl: null, isVerified: false },
      },
    ]),
    count: jest.fn().mockResolvedValue(2),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  follow: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  block: { findMany: jest.fn().mockResolvedValue([]) },
  mute: { findMany: jest.fn().mockResolvedValue([]) },
  feedInteraction: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'fi-1' }),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  like: { findMany: jest.fn().mockResolvedValue([]) },
  bookmark: { findMany: jest.fn().mockResolvedValue([]) },
  $queryRaw: jest.fn().mockResolvedValue([]),
};

describe('Feed Integration Tests', () => {
  let authApp: INestApplication;
  let unauthApp: INestApplication;

  beforeAll(async () => {
    const commonOptions = {
      imports: [FeedModule, PrismaModule, RedisModule, EmbeddingsModule],
      providers: [
        { provide: PrismaService, useValue: feedPrismaMock },
        mockRedis,
        mockConfigService,
      ],
    };

    authApp = await createTestApp({ ...commonOptions, userId: 'user-A' });
    unauthApp = await createUnauthTestApp(commonOptions);
  });

  afterAll(async () => {
    await authApp.close();
    await unauthApp.close();
  });

  describe('GET /api/v1/feed/trending', () => {
    it('should return trending posts for authenticated user', async () => {
      const response = await request(authApp.getHttpServer())
        .get('/api/v1/feed/trending')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('success', true);
    });

    it('should return trending posts for anonymous user (no auth token)', async () => {
      const response = await request(unauthApp.getHttpServer())
        .get('/api/v1/feed/trending')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('success', true);
    });

    it('should accept cursor and limit query params', async () => {
      const response = await request(authApp.getHttpServer())
        .get('/api/v1/feed/trending?cursor=abc123&limit=10')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('GET /api/v1/feed/featured', () => {
    it('should return featured posts', async () => {
      const response = await request(authApp.getHttpServer())
        .get('/api/v1/feed/featured')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });
});

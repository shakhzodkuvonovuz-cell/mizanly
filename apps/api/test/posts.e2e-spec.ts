import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClerkAuthGuard } from '../src/common/guards/clerk-auth.guard';
import { PostsService } from '../src/modules/posts/posts.service';
import { PrismaService } from '../src/config/prisma.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PostType, Visibility } from '@prisma/client';

// Mock guard that always authenticates
class MockClerkAuthGuard extends ClerkAuthGuard {
  canActivate(context: any) {
    const request = context.switchToHttp().getRequest();
    // Simulate authenticated user
    request.user = { id: 'test-user-id', clerkId: 'test-clerk-id' };
    return true;
  }
}

describe('PostsController (e2e)', () => {
  let app: INestApplication;
  let postsService: PostsService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ClerkAuthGuard)
      .useClass(MockClerkAuthGuard)
      .overrideProvider(PrismaService)
      .useValue({
        // minimal mock
        $queryRaw: jest.fn(),
        user: { findUnique: jest.fn(), update: jest.fn() },
        post: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
        like: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
        follow: { findMany: jest.fn() },
        block: { findMany: jest.fn() },
        mute: { findMany: jest.fn() },
        hashtag: { upsert: jest.fn() },
        report: { create: jest.fn() },
      })
      .overrideProvider(NotificationsService)
      .useValue({
        notifyLike: jest.fn(),
        notifyComment: jest.fn(),
      })
      .overrideProvider('REDIS')
      .useValue({
        get: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    postsService = moduleFixture.get<PostsService>(PostsService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/posts', () => {
    it('should create a post', async () => {
      const mockPost = {
        id: 'post-123',
        userId: 'test-user-id',
        postType: PostType.TEXT,
        content: 'Test content',
        visibility: Visibility.PUBLIC,
        mediaUrls: [],
        mediaTypes: [],
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        savesCount: 0,
        viewsCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jest.spyOn(postsService, 'create').mockResolvedValue(mockPost);

      const response = await request(app.getHttpServer())
        .post('/api/v1/posts')
        .send({
          postType: 'TEXT',
          content: 'Test content',
          visibility: 'PUBLIC',
        })
        .expect(201);

      expect(response.body.data).toEqual(
        expect.objectContaining({
          id: 'post-123',
          content: 'Test content',
        }),
      );
    });
  });

  describe('GET /api/v1/posts/:id', () => {
    it('should return a post', async () => {
      const mockPost = {
        id: 'post-123',
        userId: 'test-user-id',
        postType: PostType.TEXT,
        content: 'Test content',
        visibility: Visibility.PUBLIC,
        mediaUrls: [],
        mediaTypes: [],
        likesCount: 5,
        commentsCount: 2,
        sharesCount: 1,
        savesCount: 0,
        viewsCount: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jest.spyOn(postsService, 'getById').mockResolvedValue(mockPost);

      const response = await request(app.getHttpServer())
        .get('/api/v1/posts/post-123')
        .expect(200);

      expect(response.body.data).toEqual(
        expect.objectContaining({
          id: 'post-123',
          content: 'Test content',
        }),
      );
    });

    it('should return 404 for nonexistent post', async () => {
      jest.spyOn(postsService, 'getById').mockRejectedValue(
        new Error('Not found'),
      );

      await request(app.getHttpServer())
        .get('/api/v1/posts/nonexistent')
        .expect(404);
    });
  });

  describe('DELETE /api/v1/posts/:id', () => {
    it('should delete a post', async () => {
      jest.spyOn(postsService, 'delete').mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete('/api/v1/posts/post-123')
        .expect(204);
    });

    it('should return 403 if user is not the author', async () => {
      jest.spyOn(postsService, 'delete').mockRejectedValue(
        new Error('Forbidden'),
      );

      await request(app.getHttpServer())
        .delete('/api/v1/posts/post-123')
        .expect(403);
    });
  });
});
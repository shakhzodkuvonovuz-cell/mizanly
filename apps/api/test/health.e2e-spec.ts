import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { HealthModule } from '../src/modules/health/health.module';
import { PrismaModule } from '../src/config/prisma.module';
import { RedisModule } from '../src/config/redis.module';
import { PrismaService } from '../src/config/prisma.service';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HealthModule, PrismaModule, RedisModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $use: jest.fn(),
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
      })
      .overrideProvider('REDIS')
      .useValue({
        ping: jest.fn().mockResolvedValue('PONG'),
        get: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('/api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('status');
        expect(['healthy', 'degraded']).toContain(res.body.status);
        expect(res.body).toHaveProperty('database');
        expect(res.body).toHaveProperty('timestamp');
      });
  });
});
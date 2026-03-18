import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { AsyncJobService } from '../../common/services/async-jobs.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
    private jobs: AsyncJobService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check — checks DB + Redis' })
  async check() {
    const [dbOk, redisOk] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping().then(() => true).catch(() => false),
    ]);

    const allHealthy = dbOk && redisOk;
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? 'up' : 'down',
        redis: redisOk ? 'up' : 'down',
      },
      version: process.env.npm_package_version ?? '0.1.0',
    };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'API metrics (counts, system health, job stats)' })
  async metrics() {
    const [userCount, postCount, threadCount, reelCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.post.count(),
      this.prisma.thread.count(),
      this.prisma.reel.count({ where: { status: 'READY' } }),
    ]);
    return {
      timestamp: new Date().toISOString(),
      counts: { users: userCount, posts: postCount, threads: threadCount, reels: reelCount },
      jobs: this.jobs.getStats(),
      uptime: Math.round(process.uptime()),
      memory: {
        heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    };
  }
}

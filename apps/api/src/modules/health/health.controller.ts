import { Controller, Get, Inject, UseGuards, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { AsyncJobService } from '../../common/services/async-jobs.service';
import { FeatureFlagsService } from '../../common/services/feature-flags.service';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
    private jobs: AsyncJobService,
    private flags: FeatureFlagsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check dashboard — DB, Redis, R2, Stream status' })
  async check() {
    const [dbOk, redisOk, r2Ok, streamOk] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping().then(() => true).catch(() => false),
      // R2 health: check if public URL is reachable
      fetch(`${process.env.R2_PUBLIC_URL || 'https://media.mizanly.app'}/`, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
        .then(r => r.status < 500).catch(() => false),
      // Cloudflare Stream health: check API
      process.env.CF_STREAM_API_TOKEN
        ? fetch('https://api.cloudflare.com/client/v4/accounts/' + (process.env.CF_ACCOUNT_ID || '') + '/stream', {
            method: 'GET',
            headers: { Authorization: `Bearer ${process.env.CF_STREAM_API_TOKEN}` },
            signal: AbortSignal.timeout(3000),
          }).then(r => r.ok).catch(() => false)
        : Promise.resolve(null), // Not configured
    ]);

    const criticalHealthy = dbOk && redisOk;
    const allHealthy = criticalHealthy && r2Ok && (streamOk === null || streamOk);
    return {
      status: allHealthy ? 'healthy' : criticalHealthy ? 'degraded' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? 'up' : 'down',
        redis: redisOk ? 'up' : 'down',
        storage: r2Ok ? 'up' : 'down',
        stream: streamOk === null ? 'not_configured' : streamOk ? 'up' : 'down',
      },
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: Math.round(process.uptime()),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — returns 200 if DB+Redis are up, 503 otherwise' })
  async ready() {
    const [dbOk, redisOk] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping().then(() => true).catch(() => false),
    ]);
    if (!dbOk || !redisOk) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: dbOk ? 'up' : 'down',
        redis: redisOk ? 'up' : 'down',
      });
    }
    return { status: 'ready' };
  }

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe — always returns 200 if process is running' })
  live() {
    return { status: 'alive', uptime: Math.round(process.uptime()) };
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

  @Get('config')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get client configuration (feature flags for mobile app)' })
  async getConfig(@CurrentUser('id') userId?: string) {
    const allFlags = await this.flags.getAllFlags();
    // For percentage-based flags, resolve per-user
    const resolved: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(allFlags)) {
      if (value === 'true') resolved[key] = true;
      else if (value === 'false') resolved[key] = false;
      else if (userId) resolved[key] = await this.flags.isEnabledForUser(key, userId);
      else resolved[key] = false; // Anonymous users don't get percentage rollouts
    }
    return { flags: resolved };
  }
}

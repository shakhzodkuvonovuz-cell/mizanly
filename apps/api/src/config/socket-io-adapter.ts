import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

/**
 * Socket.io Redis adapter for horizontal scaling.
 * Allows multiple server instances to share WebSocket connections.
 *
 * When REDIS_URL is set, uses Redis pub/sub for cross-instance messaging.
 * Falls back to default in-memory adapter when Redis is unavailable.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;
  private readonly logger = new Logger('RedisIoAdapter');

  async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set — using in-memory Socket.io adapter (single instance only)');
      return;
    }

    try {
      const pubClient = new Redis(redisUrl, { lazyConnect: true });
      const subClient = pubClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Socket.io Redis adapter connected — horizontal scaling enabled');
    } catch (error) {
      this.logger.error('Failed to connect Socket.io Redis adapter — falling back to in-memory');
    }
  }

  createIOServer(port: number, options?: Record<string, unknown>) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}

/**
 * Initialize Redis adapter for the NestJS app.
 * Call this in main.ts before app.listen().
 */
export async function initRedisAdapter(app: INestApplication): Promise<void> {
  const adapter = new RedisIoAdapter(app);
  await adapter.connectToRedis();
  app.useWebSocketAdapter(adapter);
}

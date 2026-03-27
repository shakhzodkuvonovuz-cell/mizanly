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

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

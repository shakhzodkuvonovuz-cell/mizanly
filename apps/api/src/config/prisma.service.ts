import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

// Count fields that must never go negative
const COUNT_FIELDS = [
  'followersCount', 'followingCount', 'postsCount',
  'likesCount', 'commentsCount', 'repostsCount', 'viewsCount',
  'bookmarksCount', 'sharesCount',
];

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    // Clamp count fields to >= 0 after any update
    (this as unknown as PrismaClient & { $use: Function }).$use(async (params: any, next: any) => {
      const result = await next(params);
      if (params.action === 'update' && result && typeof result === 'object') {
        const record = result as Record<string, unknown>;
        for (const field of COUNT_FIELDS) {
          if (field in record && typeof record[field] === 'number' && record[field] < 0) {
            record[field] = 0;
          }
        }
      }
      return result;
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

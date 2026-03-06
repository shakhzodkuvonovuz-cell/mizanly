import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

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
    this.$use(async (params: any, next: any) => {
      const result = await next(params);
      if (params.action === 'update' && result && typeof result === 'object') {
        for (const field of COUNT_FIELDS) {
          if (field in result && typeof result[field] === 'number' && result[field] < 0) {
            result[field] = 0;
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

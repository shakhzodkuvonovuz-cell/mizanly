import Redis from 'ioredis';
import { PrismaService } from '../../config/prisma.service';

const CACHE_TTL_SECONDS = 60;
const CACHE_KEY_PREFIX = 'excluded_users:';

/**
 * Shared utility to get user IDs that should be excluded from feeds, recommendations, etc.
 * Fetches blocked (bidirectional), muted, and restricted users.
 * Results are cached in Redis for 60 seconds per user to avoid N+1 queries
 * when multiple services need the same exclusion list in the same request cycle.
 *
 * Safety-critical: no artificial cap on blocks/mutes — must enforce completely.
 * Upper bound of 10,000 per relation type to prevent DoS on pathological accounts.
 */
export async function getExcludedUserIds(
  prisma: PrismaService,
  redis: Redis,
  userId: string,
): Promise<string[]> {
  // Check Redis cache first
  const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis failure — fall through to DB query
  }

  const [blocks, mutes, restricts] = await Promise.all([
    prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
      take: 10000,
    }),
    prisma.mute.findMany({
      where: { userId },
      select: { mutedId: true },
      take: 10000,
    }),
    prisma.restrict.findMany({
      where: { restricterId: userId },
      select: { restrictedId: true },
      take: 10000,
    }),
  ]);

  const excluded = new Set<string>();
  for (const b of blocks) {
    if (b.blockerId === userId) excluded.add(b.blockedId);
    else excluded.add(b.blockerId);
  }
  for (const m of mutes) {
    excluded.add(m.mutedId);
  }
  for (const r of restricts) {
    excluded.add(r.restrictedId);
  }

  const result = [...excluded];

  // J07-H4 FIX: Skip Redis caching for large sets (>1000 IDs ≈ 27KB+)
  // to avoid oversized JSON blobs. DB query with indexes is fast enough.
  if (result.length <= 1000) {
    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
    } catch {
      // Redis failure non-blocking
    }
  }

  return result;
}

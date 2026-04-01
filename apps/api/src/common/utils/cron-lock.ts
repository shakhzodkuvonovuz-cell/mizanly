import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

/**
 * Distributed cron lock using Redis SET NX EX.
 *
 * Prevents multiple instances from running the same cron job simultaneously.
 * Returns true if the lock was acquired, false if another instance holds it.
 *
 * @param redis - Redis client
 * @param lockKey - Unique lock identifier (e.g., 'cron:publishOverdueContent')
 * @param ttlSeconds - Lock TTL — should be slightly less than the cron interval
 * @param logger - Optional logger for skip messages
 */
export async function acquireCronLock(
  redis: Redis,
  lockKey: string,
  ttlSeconds: number,
  logger?: Logger,
): Promise<boolean> {
  const result = await redis.set(lockKey, '1', 'EX', ttlSeconds, 'NX');
  if (!result) {
    logger?.debug(`Cron lock not acquired: ${lockKey} (another instance is running)`);
    return false;
  }
  return true;
}

import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

/**
 * Distributed cron lock using Redis SET NX EX.
 *
 * Prevents multiple instances from running the same cron job simultaneously.
 * Returns true if the lock was acquired, false if another instance holds it.
 *
 * Also records a persistent timestamp key (cron:lastrun:<lockKey>) so
 * /health/crons can report the last execution time of each cron.
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
  // Record last-run timestamp (persists 7 days, refreshed on every acquisition)
  const lastRunKey = `cron:lastrun:${lockKey}`;
  await redis.set(lastRunKey, new Date().toISOString(), 'EX', 604800).catch(() => {
    // Non-critical — don't fail the cron if timestamp recording fails
  });
  return true;
}

/** Prefix used for cron last-run timestamp keys in Redis */
export const CRON_LASTRUN_PREFIX = 'cron:lastrun:';

/**
 * All known cron lock keys in the system.
 * Used by /health/crons to enumerate and report last-run times.
 */
export const KNOWN_CRON_KEYS: string[] = [
  'cron:reconcileUserFollowCounts',
  'cron:reconcilePostCounts',
  'cron:reconcileUserPostCounts',
  'cron:reconcilePostSavesCounts',
  'cron:reconcilePostSharesCounts',
  'cron:reconcileUnreadCounts',
  'cron:reconcileCoinBalances',
  'cron:reconcileUserContentCounts',
  'cron:reconcileReelCounts',
  'cron:reconcileThreadCounts',
  'cron:reconcileVideoCounts',
  'cron:reconcileHashtagCounts',
  'cron:paymentReconcileAll',
  'cron:reconcileSearchIndex',
  'cron:cleanupStaleTokens',
  'cron:sendVerseOfTheDay',
  'cron:checkIslamicEventReminders',
  'cron:reconcileDhikrCounter',
  'cron:publishScheduledMessages:lock',
  'cron:processExpiredMessages',
  'cron:cleanupOldNotifications',
  'cron:hardDeletePurgedUsers',
  'cron:processScheduledDeletions',
  'cron:purgeOldIpAddresses',
  'cron:publishOverdueContent',
  'cron:cleanupExpiredStories',
  'cron:rotateEncryptionKeys',
  'cron:cleanupOrphanedUploads',
  'cron:snapshotFollowerCounts',
  'cron:cleanupExpiredDMNotes',
  'cron:cleanupExpiredCircleInvites',
  'cron:cleanupExpiredDownloads',
];

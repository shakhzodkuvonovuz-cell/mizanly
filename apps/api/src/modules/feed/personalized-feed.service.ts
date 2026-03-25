import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { EmbeddingContentType, PostVisibility, ReelStatus } from '@prisma/client';
import Redis from 'ioredis';
import { calculatePrayerTimes } from '../islamic/prayer-calculator';

export interface FeedItem {
  id: string;
  type: 'post' | 'reel' | 'thread' | 'video';
  score: number;
  reasons: string[];
  content?: Record<string, unknown>;
}

interface SessionData {
  likedCategories: Record<string, number>;
  viewedIds: string[];
  sessionStart: number;
  scrollDepth: number;
}

// Islamic content hashtags for boosting
const ISLAMIC_HASHTAGS = new Set([
  'quran', 'hadith', 'sunnah', 'islam', 'muslim', 'dua', 'salah', 'ramadan',
  'jummah', 'eid', 'hajj', 'umrah', 'zakat', 'sadaqah', 'dawah', 'seerah',
  'tafsir', 'fiqh', 'aqeedah', 'dhikr', 'tawbah', 'hijab', 'halal', 'masjid',
  'islamic', 'alhamdulillah', 'subhanallah', 'mashallah', 'bismillah',
]);

@Injectable()
export class PersonalizedFeedService {
  private readonly logger = new Logger(PersonalizedFeedService.name);

  private static readonly MAX_VIEWED_IDS = 1000;
  private static readonly SESSION_TTL = 1800; // 30 min in seconds

  constructor(
    private prisma: PrismaService,
    private embeddingsService: EmbeddingsService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  // ── Redis-backed session storage ──────────────────────────

  private sessionKey(userId: string): string {
    return `session:${userId}`;
  }

  private async getSession(userId: string): Promise<SessionData | null> {
    const key = this.sessionKey(userId);
    const data = await this.redis.hgetall(key);
    if (!data || !Object.keys(data).length) return null;
    try {
      return JSON.parse(data.json) as SessionData;
    } catch {
      return null;
    }
  }

  private async saveSession(userId: string, session: SessionData): Promise<void> {
    const key = this.sessionKey(userId);
    await this.redis.hset(key, 'json', JSON.stringify(session));
    await this.redis.expire(key, PersonalizedFeedService.SESSION_TTL);
  }

  /** Get user IDs to exclude from feeds (blocked in both directions + muted + restricted) */
  private async getExcludedUserIds(userId: string): Promise<string[]> {
    const [blocks, mutes, restricts] = await Promise.all([
      this.prisma.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
        take: 50,
      }),
      this.prisma.mute.findMany({
        where: { userId },
        select: { mutedId: true },
        take: 50,
      }),
      this.prisma.restrict.findMany({
        where: { restricterId: userId },
        select: { restrictedId: true },
        take: 50,
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
    return [...excluded];
  }

  // ── Session-aware adaptation (72.7) ───────────────────────

  /**
   * Track in-session signals and adapt recommendations mid-scroll.
   * Session data is stored in Redis with a 30-minute TTL (auto-expires on inactivity).
   */
  async trackSessionSignal(userId: string, signal: {
    contentId: string;
    action: 'view' | 'like' | 'save' | 'share' | 'skip';
    hashtags?: string[];
    scrollPosition?: number;
  }): Promise<void> {
    let session = await this.getSession(userId);
    if (!session || Date.now() - session.sessionStart > 30 * 60 * 1000) {
      // New session after 30 min inactivity (Redis TTL also handles expiry)
      session = {
        likedCategories: {},
        viewedIds: [],
        sessionStart: Date.now(),
        scrollDepth: 0,
      };
    }

    // Cap viewedIds to prevent unbounded growth within a session
    if (session.viewedIds.length < PersonalizedFeedService.MAX_VIEWED_IDS) {
      if (!session.viewedIds.includes(signal.contentId)) {
        session.viewedIds.push(signal.contentId);
      }
    }
    if (signal.scrollPosition) session.scrollDepth = signal.scrollPosition;

    // Boost categories from liked/saved content
    if (signal.action === 'like' || signal.action === 'save') {
      for (const tag of signal.hashtags || []) {
        session.likedCategories[tag] = (session.likedCategories[tag] || 0) + 1;
      }
    }

    await this.saveSession(userId, session);
  }

  private getSessionBoostFromData(session: SessionData | null, hashtags: string[]): number {
    if (!session) return 0;

    let boost = 0;
    for (const tag of hashtags) {
      const count = session.likedCategories[tag] || 0;
      boost += count * 0.05; // 5% boost per in-session like of same category
    }
    return Math.min(boost, 0.3); // Cap at 30% boost
  }

  // ── Islamic-aware algorithm boost (72.8) ──────────────────

  /**
   * Calculate Islamic content boost based on time context.
   * When userLat/userLng are provided, uses the prayer-calculator for
   * location-aware prayer windows instead of hardcoded hour ranges.
   */
  getIslamicBoost(hashtags: string[], userLat?: number, userLng?: number): number {
    const hasIslamicContent = hashtags.some(tag =>
      ISLAMIC_HASHTAGS.has(tag.toLowerCase().replace('#', '')),
    );
    if (!hasIslamicContent) return 0;

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sunday
    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentTimeInHours = hour + minute / 60;

    let boost = 0.1; // Base 10% boost for Islamic content

    // Friday boost (Jummah) — higher boost around midday
    if (dayOfWeek === 5) {
      boost += 0.15;
      if (hour >= 11 && hour <= 14) boost += 0.1; // Extra during Jummah prayer window
    }

    // Prayer time window boost — location-aware when coordinates available
    if (userLat !== undefined && userLng !== undefined) {
      // Use prayer-calculator for accurate, location-based prayer windows
      const times = calculatePrayerTimes(now, userLat, userLng);
      const prayerTimeStrings = [times.fajr, times.dhuhr, times.asr, times.maghrib, times.isha];
      const inPrayerWindow = prayerTimeStrings.some(timeStr => {
        const prayerHour = this.parseTimeToHours(timeStr);
        // +-30 minute window around each prayer time
        return Math.abs(currentTimeInHours - prayerHour) <= 0.5;
      });
      if (inPrayerWindow) boost += 0.1;
    } else {
      // Fallback: hardcoded approximate windows (server timezone)
      const prayerWindows = [
        { start: 4, end: 6 },   // Fajr
        { start: 12, end: 13 }, // Dhuhr
        { start: 15, end: 16 }, // Asr
        { start: 18, end: 19 }, // Maghrib
        { start: 20, end: 21 }, // Isha
      ];
      const inPrayerWindow = prayerWindows.some(w => hour >= w.start && hour <= w.end);
      if (inPrayerWindow) boost += 0.1;
    }

    // Ramadan detection using Hijri calendar (via prayer-calculator utility)
    const isRamadan = this.isRamadanPeriod(now);
    if (isRamadan) boost += 0.2;

    return Math.min(boost, 0.5); // Cap at 50% boost
  }

  /** Parse "HH:MM" time string to fractional hours (e.g., "05:30" → 5.5) */
  private parseTimeToHours(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h + (m || 0) / 60;
  }

  private isRamadanPeriod(date: Date): boolean {
    // Known Ramadan start dates (1st of Ramadan in Gregorian)
    // Islamic year shifts ~10-11 days earlier each Gregorian year
    const knownDates: Record<number, [number, number]> = {
      2026: [1, 18],  // Feb 18
      2027: [1, 8],   // Feb 8
      2028: [0, 28],  // Jan 28
      2029: [0, 16],  // Jan 16
      2030: [0, 6],   // Jan 6
      2031: [11, 26], // Dec 26
    };

    const year = date.getFullYear();
    const known = knownDates[year];
    if (known) {
      const start = new Date(year, known[0], known[1]);
      const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
      return date >= start && date <= end;
    }

    // For years beyond known dates, approximate using lunar cycle shift
    // Ramadan 2026 starts ~Feb 18; each year shifts back ~10.87 days
    const baseYear = 2026;
    const baseStart = new Date(2026, 1, 18);
    const yearDiff = year - baseYear;
    const approxStart = new Date(baseStart.getTime() - yearDiff * 10.87 * 24 * 60 * 60 * 1000);
    const approxEnd = new Date(approxStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    return date >= approxStart && date <= approxEnd;
  }

  // ── Personalized feed endpoint (72.9) ─────────────────────

  /**
   * Serve fully personalized feed using pgvector + behavioral signals + Islamic boost
   */
  async getPersonalizedFeed(
    userId: string | undefined,
    space: 'saf' | 'bakra' | 'majlis' | 'minbar',
    cursor?: string,
    limit = 20,
    userLat?: number,
    userLng?: number,
  ): Promise<{ data: FeedItem[]; meta: { cursor?: string; hasMore: boolean } }> {
    // For unauthenticated or cold-start users, serve trending
    if (!userId) {
      return this.getTrendingFeed(space, cursor, limit);
    }

    // Parallelize excluded user IDs, interaction count, and interest centroids computation
    const contentType = this.spaceToContentType(space);
    const [excludedUserIds, interactionCount, interestCentroids] = await Promise.all([
      this.getExcludedUserIds(userId),
      this.prisma.feedInteraction.count({ where: { userId } }),
      this.embeddingsService.getUserInterestVector(userId),
    ]);

    if (interactionCount < 10) {
      // Cold start: trending + editorial picks (72.11)
      return this.getColdStartFeed(userId, space, cursor, limit, excludedUserIds);
    }

    if (!interestCentroids) {
      return this.getTrendingFeed(space, cursor, limit, excludedUserIds);
    }

    // Get session-viewed IDs to exclude (from Redis)
    const [session, followedHashtags] = await Promise.all([
      this.getSession(userId),
      this.prisma.hashtagFollow.findMany({
        where: { userId },
        select: { hashtag: { select: { name: true } } },
        take: 50,
      }),
    ]);
    const sessionViewedIds = session ? session.viewedIds : [];
    const followedTagSet = new Set(followedHashtags.map(h => h.hashtag.name.toLowerCase()));

    // Stage 1: pgvector KNN — top 500 candidates across all interest centroids
    const candidates = await this.embeddingsService.findSimilarByMultipleVectors(
      interestCentroids,
      500,
      [contentType],
      sessionViewedIds,
    );

    // Stage 2: Score with behavioral signals + Islamic boost + session signals
    const feedItems: FeedItem[] = [];
    const contentIds = candidates.map(c => c.contentId);

    // Fetch engagement data (includes userId) — single query instead of two separate ones
    const engagementData = await this.getContentMetadata(contentIds, contentType);

    const excludedSet = new Set(excludedUserIds);

    for (const candidate of candidates) {
      const meta = engagementData.get(candidate.contentId);
      if (!meta) continue;

      // Filter out content from blocked/muted users (userId included in metadata)
      if (meta.userId && excludedSet.has(meta.userId)) continue;

      const reasons: string[] = [];
      let score = candidate.similarity * 0.35;
      reasons.push('Similar to your interests');

      // Engagement score
      const engScore = this.calculateEngagementScore(meta);
      score += engScore * 0.25;
      if (engScore > 0.5) reasons.push('Popular in community');

      // Recency score
      const ageHours = (Date.now() - meta.createdAt.getTime()) / (1000 * 60 * 60);
      const recencyScore = Math.max(0, 1 - ageHours / 168);
      score += recencyScore * 0.15;

      // Islamic boost
      const islamicBoost = this.getIslamicBoost(meta.hashtags || [], userLat, userLng);
      score += islamicBoost * 0.15;
      if (islamicBoost > 0.1) reasons.push('Islamic content boost');

      // Session adaptation boost
      const sessionBoost = this.getSessionBoostFromData(session, meta.hashtags || []);
      score += sessionBoost * 0.1;
      if (sessionBoost > 0) reasons.push('Trending in your session');

      // Followed hashtag boost — content matching hashtags you follow gets a boost
      const postTags = (meta.hashtags || []).map((t: string) => t.toLowerCase());
      const hasFollowedTag = postTags.some((t: string) => followedTagSet.has(t));
      if (hasFollowedTag) {
        score += 0.15;
        reasons.push('Matches a hashtag you follow');
      }

      // Finding #258: Verified scholar content boost
      if (meta.isVerified && (meta as Record<string, unknown>).isScholarVerified) {
        score += 0.1;
        reasons.push('From a verified scholar');
      }

      // Finding #302: New creator cold start boost — first 10 posts get discovery help
      if (meta.postsCount !== undefined && (meta.postsCount as number) <= 10) {
        score += 0.05;
        reasons.push('Supporting new creator');
      }

      feedItems.push({
        id: candidate.contentId,
        type: this.contentTypeToFeedType(contentType),
        score,
        reasons,
      });
    }

    // Sort by score
    feedItems.sort((a, b) => b.score - a.score);

    // Diversity injection: no same-author back-to-back, with backfill from skipped items
    // Use userId from the already-fetched engagement data instead of a separate query
    const diversifyAuthorMap = new Map<string, string>();
    for (const item of feedItems.slice(0, limit * 3)) {
      const meta = engagementData.get(item.id);
      if (meta?.userId) diversifyAuthorMap.set(item.id, meta.userId);
    }
    const diversified: FeedItem[] = [];
    const skipped: FeedItem[] = [];
    let lastAuthor = '';

    for (const item of feedItems) {
      if (diversified.length >= limit) break;
      const itemAuthor = diversifyAuthorMap.get(item.id) || '';
      if (itemAuthor === lastAuthor) {
        skipped.push(item);
        continue;
      }
      diversified.push(item);
      lastAuthor = itemAuthor;
    }

    // Backfill from skipped items if diversified list is short
    if (diversified.length < limit && skipped.length > 0) {
      for (const item of skipped) {
        if (diversified.length >= limit) break;
        diversified.push(item);
      }
    }

    // Mark served items as viewed in session to prevent re-serving on next page
    if (session) {
      for (const item of diversified) {
        if (session.viewedIds.length < PersonalizedFeedService.MAX_VIEWED_IDS) {
          if (!session.viewedIds.includes(item.id)) {
            session.viewedIds.push(item.id);
          }
        }
      }
      await this.saveSession(userId, session);
    }

    // Hydrate feed items with actual content data
    const hydrated = await this.hydrateItems(diversified, contentType);

    const hasMore = feedItems.length > diversified.length;
    const nextCursor = hydrated.length > 0
      ? hydrated[hydrated.length - 1].id
      : undefined;

    return {
      data: hydrated,
      meta: { cursor: nextCursor, hasMore },
    };
  }

  // ── Cold start feed (72.11) ───────────────────────────────

  private async getColdStartFeed(
    userId: string,
    space: 'saf' | 'bakra' | 'majlis' | 'minbar',
    cursor?: string,
    limit = 20,
    excludedUserIds: string[] = [],
  ): Promise<{ data: FeedItem[]; meta: { cursor?: string; hasMore: boolean } }> {
    // Mix of trending content + editorial Islamic picks
    const trending = await this.getTrendingFeed(space, cursor, Math.ceil(limit * 0.7), excludedUserIds);

    // Add Islamic editorial picks
    const islamicPicks = await this.getIslamicEditorialPicks(space, Math.floor(limit * 0.3), excludedUserIds);

    // Merge and deduplicate
    const seenIds = new Set(trending.data.map(t => t.id));
    const merged = [...trending.data];
    for (const pick of islamicPicks) {
      if (!seenIds.has(pick.id)) {
        merged.push(pick);
        seenIds.add(pick.id);
      }
    }

    // Partial Fisher-Yates: swap ~30% of items to mix trending with Islamic picks
    const swapCount = Math.floor(merged.length * 0.3);
    for (let k = 0; k < swapCount; k++) {
      const i = Math.floor(Math.random() * merged.length);
      const j = Math.floor(Math.random() * merged.length);
      [merged[i], merged[j]] = [merged[j], merged[i]];
    }

    return {
      data: merged.slice(0, limit),
      meta: { hasMore: trending.meta.hasMore, cursor: trending.meta.cursor },
    };
  }

  private async getIslamicEditorialPicks(
    space: 'saf' | 'bakra' | 'majlis' | 'minbar',
    limit: number,
    excludedUserIds: string[] = [],
  ): Promise<FeedItem[]> {
    const islamicTagArray = [...ISLAMIC_HASHTAGS];
    const userFilter = excludedUserIds.length > 0 ? { id: { notIn: excludedUserIds } } : {};

    if (space === 'saf') {
      const posts = await this.prisma.post.findMany({
        where: {
          isRemoved: false,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
          visibility: PostVisibility.PUBLIC,
          hashtags: { hasSome: islamicTagArray },
          user: { isVerified: true, isDeactivated: false, ...userFilter },
        },
        select: { id: true },
        orderBy: { likesCount: 'desc' },
        take: limit,
      });
      return posts.map(p => ({ id: p.id, type: 'post' as const, score: 0.8, reasons: ['Islamic editorial pick'] }));
    }

    if (space === 'bakra') {
      const reels = await this.prisma.reel.findMany({
        where: {
          isRemoved: false,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
          isTrial: false,
          status: ReelStatus.READY,
          hashtags: { hasSome: islamicTagArray },
          user: { isDeactivated: false, ...userFilter },
        },
        select: { id: true },
        orderBy: { viewsCount: 'desc' },
        take: limit,
      });
      return reels.map(r => ({ id: r.id, type: 'reel' as const, score: 0.8, reasons: ['Islamic editorial pick'] }));
    }

    // majlis
    const threads = await this.prisma.thread.findMany({
      where: {
        isRemoved: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        visibility: 'PUBLIC',
        isChainHead: true,
        hashtags: { hasSome: islamicTagArray },
        user: { isDeactivated: false, ...userFilter },
      },
      select: { id: true },
      orderBy: { likesCount: 'desc' },
      take: limit,
    });
    return threads.map(t => ({ id: t.id, type: 'thread' as const, score: 0.8, reasons: ['Islamic editorial pick'] }));
  }

  private async getTrendingFeed(
    space: 'saf' | 'bakra' | 'majlis' | 'minbar',
    cursor?: string,
    limit = 20,
    excludedUserIds: string[] = [],
  ): Promise<{ data: FeedItem[]; meta: { cursor?: string; hasMore: boolean } }> {
    // 24-hour window prevents "popular-get-more-popular" loop (was 48h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const userFilter = excludedUserIds.length > 0 ? { id: { notIn: excludedUserIds } } : {};

    if (space === 'saf') {
      const posts = await this.prisma.post.findMany({
        where: {
          isRemoved: false,
          visibility: PostVisibility.PUBLIC,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
          createdAt: { gte: since },
          user: { isDeactivated: false, isPrivate: false, ...userFilter },
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        select: { id: true, hashtags: true, createdAt: true, likesCount: true },
        orderBy: [{ likesCount: 'desc' }, { createdAt: 'desc' }],
        take: (limit + 1) * 2, // Fetch extra to account for re-ranking after decay
      });
      const scored = posts.map(p => ({
        id: p.id,
        type: 'post' as const,
        score: this.applyTrendingDecay(p.likesCount, p.createdAt),
        reasons: ['Trending'] as string[],
      }));
      scored.sort((a, b) => b.score - a.score);
      const trimmed = scored.slice(0, limit + 1);
      const hasMore = trimmed.length > limit;
      const data = trimmed.slice(0, limit);
      return { data, meta: { hasMore, cursor: data.length ? data[data.length - 1].id : undefined } };
    }

    if (space === 'bakra') {
      const reels = await this.prisma.reel.findMany({
        where: {
          isRemoved: false,
          status: ReelStatus.READY,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
          createdAt: { gte: since },
          user: { isDeactivated: false, isPrivate: false, ...userFilter },
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        select: { id: true, hashtags: true, createdAt: true, viewsCount: true },
        orderBy: [{ viewsCount: 'desc' }, { createdAt: 'desc' }],
        take: (limit + 1) * 2,
      });
      const scored = reels.map(r => ({
        id: r.id,
        type: 'reel' as const,
        score: this.applyTrendingDecay(r.viewsCount, r.createdAt),
        reasons: ['Trending'] as string[],
      }));
      scored.sort((a, b) => b.score - a.score);
      const trimmed = scored.slice(0, limit + 1);
      const hasMore = trimmed.length > limit;
      const data = trimmed.slice(0, limit);
      return { data, meta: { hasMore, cursor: data.length ? data[data.length - 1].id : undefined } };
    }

    if (space === 'minbar') {
      const videos = await this.prisma.video.findMany({
        where: {
          status: 'PUBLISHED',
          createdAt: { gte: since },
          user: { isDeactivated: false, ...userFilter },
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        select: { id: true, tags: true, createdAt: true, viewsCount: true },
        orderBy: [{ viewsCount: 'desc' }, { createdAt: 'desc' }],
        take: (limit + 1) * 2,
      });
      const scored = videos.map(v => ({
        id: v.id,
        type: 'video' as const,
        score: this.applyTrendingDecay(v.viewsCount, v.createdAt),
        reasons: ['Trending'] as string[],
      }));
      scored.sort((a, b) => b.score - a.score);
      const trimmed = scored.slice(0, limit + 1);
      const hasMore = trimmed.length > limit;
      const data = trimmed.slice(0, limit);
      return { data, meta: { hasMore, cursor: data.length ? data[data.length - 1].id : undefined } };
    }

    // majlis
    const threads = await this.prisma.thread.findMany({
      where: {
        isRemoved: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        visibility: 'PUBLIC',
        isChainHead: true,
        createdAt: { gte: since },
        user: { isDeactivated: false, ...userFilter },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      select: { id: true, hashtags: true, createdAt: true, likesCount: true },
      orderBy: [{ likesCount: 'desc' }, { createdAt: 'desc' }],
      take: (limit + 1) * 2,
    });
    const scored = threads.map(t => ({
      id: t.id,
      type: 'thread' as const,
      score: this.applyTrendingDecay(t.likesCount, t.createdAt),
      reasons: ['Trending'] as string[],
    }));
    scored.sort((a, b) => b.score - a.score);
    const trimmed = scored.slice(0, limit + 1);
    const hasMore = trimmed.length > limit;
    const data = trimmed.slice(0, limit);
    return { data, meta: { hasMore, cursor: data.length ? data[data.length - 1].id : undefined } };
  }

  /**
   * Apply time-based decay to trending scores.
   * Posts older than 12 hours get progressively lower scores,
   * ensuring fresher content surfaces above stale viral posts.
   */
  private applyTrendingDecay(engagementCount: number, createdAt: Date): number {
    const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
    // Normalize engagement to 0-1 range (log scale to dampen outliers)
    const engagementScore = Math.log10(Math.max(engagementCount, 1) + 1) / 5;
    // After 12 hours, decay linearly: at 24h the decay factor is 0.5
    const decayFactor = ageHours <= 12 ? 1.0 : Math.max(0.5, 1.0 - (ageHours - 12) / 24);
    return engagementScore * decayFactor;
  }

  // ── Helpers ───────────────────────────────────────────────

  private spaceToContentType(space: 'saf' | 'bakra' | 'majlis' | 'minbar'): EmbeddingContentType {
    switch (space) {
      case 'saf': return EmbeddingContentType.POST;
      case 'bakra': return EmbeddingContentType.REEL;
      case 'majlis': return EmbeddingContentType.THREAD;
      case 'minbar': return EmbeddingContentType.VIDEO;
    }
  }

  private contentTypeToFeedType(ct: EmbeddingContentType): 'post' | 'reel' | 'thread' | 'video' {
    switch (ct) {
      case EmbeddingContentType.POST: return 'post';
      case EmbeddingContentType.REEL: return 'reel';
      case EmbeddingContentType.THREAD: return 'thread';
      case EmbeddingContentType.VIDEO: return 'video';
      default: return 'post';
    }
  }

  private calculateEngagementScore(meta: { likesCount: number; commentsCount?: number; sharesCount?: number; savesCount?: number; viewsCount: number }): number {
    // Finding #299: Bookmarks/saves weighted 4x (strong quality signal)
    const total = meta.likesCount + (meta.commentsCount || 0) * 2 + (meta.sharesCount || 0) * 3 + (meta.savesCount || 0) * 4;
    const rate = meta.viewsCount > 0 ? total / meta.viewsCount : 0;
    return Math.min(rate * 10, 1);
  }

  private async getContentMetadata(
    ids: string[],
    contentType: EmbeddingContentType,
  ): Promise<Map<string, { likesCount: number; commentsCount?: number; sharesCount?: number; viewsCount: number; hashtags: string[]; createdAt: Date; userId?: string }>> {
    const map = new Map<string, { likesCount: number; commentsCount?: number; sharesCount?: number; viewsCount: number; hashtags: string[]; createdAt: Date; userId?: string }>();
    if (ids.length === 0) return map;

    // Fetch engagement data AND userId in a single query (merged from former getAuthorMap)
    if (contentType === EmbeddingContentType.POST) {
      const items = await this.prisma.post.findMany({
        where: { id: { in: ids } },
        select: { id: true, userId: true, likesCount: true, commentsCount: true, sharesCount: true, viewsCount: true, hashtags: true, createdAt: true },
        take: 500,
      });
      items.forEach(i => map.set(i.id, { ...i, userId: i.userId ?? undefined }));
    } else if (contentType === EmbeddingContentType.REEL) {
      const items = await this.prisma.reel.findMany({
        where: { id: { in: ids } },
        select: { id: true, userId: true, likesCount: true, commentsCount: true, sharesCount: true, viewsCount: true, hashtags: true, createdAt: true },
        take: 500,
      });
      items.forEach(i => map.set(i.id, { ...i, userId: i.userId ?? undefined }));
    } else if (contentType === EmbeddingContentType.THREAD) {
      const items = await this.prisma.thread.findMany({
        where: { id: { in: ids } },
        select: { id: true, userId: true, likesCount: true, repliesCount: true, repostsCount: true, viewsCount: true, hashtags: true, createdAt: true },
        take: 500,
      });
      items.forEach(i => map.set(i.id, {
        likesCount: i.likesCount,
        commentsCount: i.repliesCount,
        sharesCount: i.repostsCount,
        viewsCount: i.viewsCount,
        hashtags: i.hashtags,
        createdAt: i.createdAt,
        userId: i.userId ?? undefined,
      }));
    }

    return map;
  }

  private async hydrateItems(items: FeedItem[], contentType: EmbeddingContentType): Promise<FeedItem[]> {
    if (items.length === 0) return items;
    const ids = items.map(i => i.id);
    const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true };

    if (contentType === EmbeddingContentType.POST) {
      const posts = await this.prisma.post.findMany({
        where: { id: { in: ids } },
        select: { id: true, content: true, mediaUrls: true, mediaTypes: true, postType: true, likesCount: true, commentsCount: true, createdAt: true, user: { select: USER_SELECT } },
        take: 50,
      });
      const postMap = new Map(posts.map(p => [p.id, p]));
      return items.map(item => ({ ...item, content: postMap.get(item.id) as Record<string, unknown> | undefined })).filter(i => i.content);
    }
    if (contentType === EmbeddingContentType.REEL) {
      const reels = await this.prisma.reel.findMany({
        where: { id: { in: ids } },
        select: { id: true, caption: true, videoUrl: true, thumbnailUrl: true, duration: true, likesCount: true, viewsCount: true, createdAt: true, user: { select: USER_SELECT } },
        take: 50,
      });
      const reelMap = new Map(reels.map(r => [r.id, r]));
      return items.map(item => ({ ...item, content: reelMap.get(item.id) as Record<string, unknown> | undefined })).filter(i => i.content);
    }
    if (contentType === EmbeddingContentType.VIDEO) {
      const videos = await this.prisma.video.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true, description: true, thumbnailUrl: true, duration: true, viewsCount: true, likesCount: true, createdAt: true, user: { select: USER_SELECT } },
        take: 50,
      });
      const videoMap = new Map(videos.map(v => [v.id, v]));
      return items.map(item => ({ ...item, content: videoMap.get(item.id) as Record<string, unknown> | undefined })).filter(i => i.content);
    }
    // THREAD (default)
    const threads = await this.prisma.thread.findMany({
      where: { id: { in: ids } },
      select: { id: true, content: true, mediaUrls: true, likesCount: true, repliesCount: true, createdAt: true, user: { select: USER_SELECT } },
      take: 50,
    });
    const threadMap = new Map(threads.map(t => [t.id, t]));
    return items.map(item => ({ ...item, content: threadMap.get(item.id) as Record<string, unknown> | undefined })).filter(i => i.content);
  }

  // getAuthorMap — REMOVED: userId is now included in getContentMetadata() response,
  // eliminating the need for a separate query (see line 583).
}

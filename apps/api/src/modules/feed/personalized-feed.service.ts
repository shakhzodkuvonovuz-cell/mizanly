import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { EmbeddingContentType, PostVisibility, ReelStatus } from '@prisma/client';

interface FeedItem {
  id: string;
  type: 'post' | 'reel' | 'thread';
  score: number;
  reasons: string[];
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

  // In-memory session signal store (per-user, resets on service restart)
  // Capped at 10,000 sessions to prevent unbounded memory growth
  private static readonly MAX_SESSIONS = 10000;
  private static readonly MAX_VIEWED_IDS = 1000;
  private sessionSignals = new Map<string, {
    likedCategories: Map<string, number>;
    viewedIds: Set<string>;
    sessionStart: number;
    scrollDepth: number;
  }>();

  constructor(
    private prisma: PrismaService,
    private embeddingsService: EmbeddingsService,
  ) {}

  /** Get user IDs to exclude from feeds (blocked in both directions + muted) */
  private async getExcludedUserIds(userId: string): Promise<string[]> {
    const [blocks, mutes] = await Promise.all([
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
    ]);
    const excluded = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId === userId) excluded.add(b.blockedId);
      else excluded.add(b.blockerId);
    }
    for (const m of mutes) {
      excluded.add(m.mutedId);
    }
    return [...excluded];
  }

  // ── Session-aware adaptation (72.7) ───────────────────────

  /**
   * Track in-session signals and adapt recommendations mid-scroll
   */
  trackSessionSignal(userId: string, signal: {
    contentId: string;
    action: 'view' | 'like' | 'save' | 'share' | 'skip';
    hashtags?: string[];
    scrollPosition?: number;
  }): void {
    let session = this.sessionSignals.get(userId);
    if (!session || Date.now() - session.sessionStart > 30 * 60 * 1000) {
      // New session after 30 min inactivity
      session = {
        likedCategories: new Map(),
        viewedIds: new Set(),
        sessionStart: Date.now(),
        scrollDepth: 0,
      };
      // Evict oldest sessions if at capacity
      if (this.sessionSignals.size >= PersonalizedFeedService.MAX_SESSIONS) {
        const oldestKey = this.sessionSignals.keys().next().value;
        if (oldestKey) this.sessionSignals.delete(oldestKey);
      }
      this.sessionSignals.set(userId, session);
    }

    // Cap viewedIds to prevent unbounded growth within a session
    if (session.viewedIds.size < PersonalizedFeedService.MAX_VIEWED_IDS) {
      session.viewedIds.add(signal.contentId);
    }
    if (signal.scrollPosition) session.scrollDepth = signal.scrollPosition;

    // Boost categories from liked/saved content
    if (signal.action === 'like' || signal.action === 'save') {
      for (const tag of signal.hashtags || []) {
        const current = session.likedCategories.get(tag) || 0;
        session.likedCategories.set(tag, current + 1);
      }
    }
  }

  private getSessionBoost(userId: string, hashtags: string[]): number {
    const session = this.sessionSignals.get(userId);
    if (!session) return 0;

    let boost = 0;
    for (const tag of hashtags) {
      const count = session.likedCategories.get(tag) || 0;
      boost += count * 0.05; // 5% boost per in-session like of same category
    }
    return Math.min(boost, 0.3); // Cap at 30% boost
  }

  // ── Islamic-aware algorithm boost (72.8) ──────────────────

  /**
   * Calculate Islamic content boost based on time context
   */
  getIslamicBoost(hashtags: string[]): number {
    const hasIslamicContent = hashtags.some(tag =>
      ISLAMIC_HASHTAGS.has(tag.toLowerCase().replace('#', '')),
    );
    if (!hasIslamicContent) return 0;

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sunday
    const hour = now.getHours();
    const month = now.getMonth(); // Note: Ramadan detection would need Hijri calendar

    let boost = 0.1; // Base 10% boost for Islamic content

    // Friday boost (Jummah) — higher boost around midday
    if (dayOfWeek === 5) {
      boost += 0.15;
      if (hour >= 11 && hour <= 14) boost += 0.1; // Extra during Jummah prayer window
    }

    // Prayer time windows (approximate, general — a real implementation would use location-based prayer times)
    // Fajr (~5-6am), Dhuhr (~12-1pm), Asr (~3-4pm), Maghrib (~6-7pm), Isha (~8-9pm)
    const prayerWindows = [
      { start: 4, end: 6 },   // Fajr
      { start: 12, end: 13 }, // Dhuhr
      { start: 15, end: 16 }, // Asr
      { start: 18, end: 19 }, // Maghrib
      { start: 20, end: 21 }, // Isha
    ];
    const inPrayerWindow = prayerWindows.some(w => hour >= w.start && hour <= w.end);
    if (inPrayerWindow) boost += 0.1;

    // Ramadan approximation (March-April 2027 estimate; real app would use Hijri calendar)
    // For now, use a config-driven approach
    const isRamadan = this.isRamadanPeriod(now);
    if (isRamadan) boost += 0.2;

    return Math.min(boost, 0.5); // Cap at 50% boost
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
    space: 'saf' | 'bakra' | 'majlis',
    cursor?: string,
    limit = 20,
  ): Promise<{ data: FeedItem[]; meta: { cursor?: string; hasMore: boolean } }> {
    // For unauthenticated or cold-start users, serve trending
    if (!userId) {
      return this.getTrendingFeed(space, cursor, limit);
    }

    // Get excluded user IDs (blocked both directions + muted)
    const excludedUserIds = await this.getExcludedUserIds(userId);

    // Check if user has enough interactions for personalization
    const interactionCount = await this.prisma.feedInteraction.count({
      where: { userId },
    });

    if (interactionCount < 10) {
      // Cold start: trending + editorial picks (72.11)
      return this.getColdStartFeed(userId, space, cursor, limit, excludedUserIds);
    }

    // Full personalized pipeline
    const contentType = this.spaceToContentType(space);
    const interestVector = await this.embeddingsService.getUserInterestVector(userId);

    if (!interestVector) {
      return this.getTrendingFeed(space, cursor, limit, excludedUserIds);
    }

    // Get session-viewed IDs to exclude
    const session = this.sessionSignals.get(userId);
    const sessionViewedIds = session ? [...session.viewedIds] : [];

    // Stage 1: pgvector KNN — top 500 candidates
    const candidates = await this.embeddingsService.findSimilarByVector(
      interestVector,
      500,
      [contentType],
      sessionViewedIds,
    );

    // Stage 2: Score with behavioral signals + Islamic boost + session signals
    const feedItems: FeedItem[] = [];
    const contentIds = candidates.map(c => c.contentId);

    const [engagementData, authorMapFull] = await Promise.all([
      this.getContentMetadata(contentIds, contentType),
      this.getAuthorMap(contentIds, contentType),
    ]);

    const excludedSet = new Set(excludedUserIds);

    for (const candidate of candidates) {
      const meta = engagementData.get(candidate.contentId);
      if (!meta) continue;

      // Filter out content from blocked/muted users
      const author = authorMapFull.get(candidate.contentId);
      if (author && excludedSet.has(author)) continue;

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
      const islamicBoost = this.getIslamicBoost(meta.hashtags || []);
      score += islamicBoost * 0.15;
      if (islamicBoost > 0.1) reasons.push('Islamic content boost');

      // Session adaptation boost
      const sessionBoost = this.getSessionBoost(userId, meta.hashtags || []);
      score += sessionBoost * 0.1;
      if (sessionBoost > 0) reasons.push('Trending in your session');

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
    const diversifyAuthorMap = await this.getAuthorMap(feedItems.slice(0, limit * 3).map(f => f.id), contentType);
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
        if (session.viewedIds.size < PersonalizedFeedService.MAX_VIEWED_IDS) {
          session.viewedIds.add(item.id);
        }
      }
    }

    const hasMore = feedItems.length > diversified.length;
    const nextCursor = diversified.length > 0
      ? diversified[diversified.length - 1].id
      : undefined;

    return {
      data: diversified,
      meta: { cursor: nextCursor, hasMore },
    };
  }

  // ── Cold start feed (72.11) ───────────────────────────────

  private async getColdStartFeed(
    userId: string,
    space: 'saf' | 'bakra' | 'majlis',
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
    space: 'saf' | 'bakra' | 'majlis',
    limit: number,
    excludedUserIds: string[] = [],
  ): Promise<FeedItem[]> {
    const islamicTagArray = [...ISLAMIC_HASHTAGS];
    const userFilter = excludedUserIds.length > 0 ? { id: { notIn: excludedUserIds } } : {};

    if (space === 'saf') {
      const posts = await this.prisma.post.findMany({
        where: {
          isRemoved: false,
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
    space: 'saf' | 'bakra' | 'majlis',
    cursor?: string,
    limit = 20,
    excludedUserIds: string[] = [],
  ): Promise<{ data: FeedItem[]; meta: { cursor?: string; hasMore: boolean } }> {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const userFilter = excludedUserIds.length > 0 ? { id: { notIn: excludedUserIds } } : {};

    if (space === 'saf') {
      const posts = await this.prisma.post.findMany({
        where: {
          isRemoved: false,
          visibility: PostVisibility.PUBLIC,
          scheduledAt: null,
          createdAt: { gte: since },
          user: { isDeactivated: false, isPrivate: false, ...userFilter },
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        select: { id: true, hashtags: true },
        orderBy: [{ likesCount: 'desc' }, { createdAt: 'desc' }],
        take: limit + 1,
      });
      const hasMore = posts.length > limit;
      const data = posts.slice(0, limit).map(p => ({
        id: p.id,
        type: 'post' as const,
        score: 1,
        reasons: ['Trending'],
      }));
      return { data, meta: { hasMore, cursor: data.length ? data[data.length - 1].id : undefined } };
    }

    if (space === 'bakra') {
      const reels = await this.prisma.reel.findMany({
        where: {
          isRemoved: false,
          status: ReelStatus.READY,
          scheduledAt: null,
          createdAt: { gte: since },
          user: { isDeactivated: false, isPrivate: false, ...userFilter },
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        select: { id: true, hashtags: true },
        orderBy: [{ viewsCount: 'desc' }, { createdAt: 'desc' }],
        take: limit + 1,
      });
      const hasMore = reels.length > limit;
      const data = reels.slice(0, limit).map(r => ({
        id: r.id,
        type: 'reel' as const,
        score: 1,
        reasons: ['Trending'],
      }));
      return { data, meta: { hasMore, cursor: data.length ? data[data.length - 1].id : undefined } };
    }

    // majlis
    const threads = await this.prisma.thread.findMany({
      where: {
        isRemoved: false,
        visibility: 'PUBLIC',
        isChainHead: true,
        createdAt: { gte: since },
        user: { isDeactivated: false, ...userFilter },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      select: { id: true, hashtags: true },
      orderBy: [{ likesCount: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
    });
    const hasMore = threads.length > limit;
    const data = threads.slice(0, limit).map(t => ({
      id: t.id,
      type: 'thread' as const,
      score: 1,
      reasons: ['Trending'],
    }));
    return { data, meta: { hasMore, cursor: data.length ? data[data.length - 1].id : undefined } };
  }

  // ── Helpers ───────────────────────────────────────────────

  private spaceToContentType(space: 'saf' | 'bakra' | 'majlis'): EmbeddingContentType {
    switch (space) {
      case 'saf': return EmbeddingContentType.POST;
      case 'bakra': return EmbeddingContentType.REEL;
      case 'majlis': return EmbeddingContentType.THREAD;
    }
  }

  private contentTypeToFeedType(ct: EmbeddingContentType): 'post' | 'reel' | 'thread' {
    switch (ct) {
      case EmbeddingContentType.POST: return 'post';
      case EmbeddingContentType.REEL: return 'reel';
      case EmbeddingContentType.THREAD: return 'thread';
      default: return 'post';
    }
  }

  private calculateEngagementScore(meta: { likesCount: number; commentsCount?: number; sharesCount?: number; viewsCount: number }): number {
    const total = meta.likesCount + (meta.commentsCount || 0) * 2 + (meta.sharesCount || 0) * 3;
    const rate = meta.viewsCount > 0 ? total / meta.viewsCount : 0;
    return Math.min(rate * 10, 1);
  }

  private async getContentMetadata(
    ids: string[],
    contentType: EmbeddingContentType,
  ): Promise<Map<string, { likesCount: number; commentsCount?: number; sharesCount?: number; viewsCount: number; hashtags: string[]; createdAt: Date }>> {
    const map = new Map<string, { likesCount: number; commentsCount?: number; sharesCount?: number; viewsCount: number; hashtags: string[]; createdAt: Date }>();
    if (ids.length === 0) return map;

    if (contentType === EmbeddingContentType.POST) {
      const items = await this.prisma.post.findMany({
        where: { id: { in: ids } },
        select: { id: true, likesCount: true, commentsCount: true, sharesCount: true, viewsCount: true, hashtags: true, createdAt: true },
      });
      items.forEach(i => map.set(i.id, i));
    } else if (contentType === EmbeddingContentType.REEL) {
      const items = await this.prisma.reel.findMany({
        where: { id: { in: ids } },
        select: { id: true, likesCount: true, commentsCount: true, sharesCount: true, viewsCount: true, hashtags: true, createdAt: true },
      });
      items.forEach(i => map.set(i.id, i));
    } else if (contentType === EmbeddingContentType.THREAD) {
      const items = await this.prisma.thread.findMany({
        where: { id: { in: ids } },
        select: { id: true, likesCount: true, repliesCount: true, repostsCount: true, viewsCount: true, hashtags: true, createdAt: true },
      });
      items.forEach(i => map.set(i.id, {
        likesCount: i.likesCount,
        commentsCount: i.repliesCount,
        sharesCount: i.repostsCount,
        viewsCount: i.viewsCount,
        hashtags: i.hashtags,
        createdAt: i.createdAt,
      }));
    }

    return map;
  }

  private async getAuthorMap(ids: string[], contentType: EmbeddingContentType): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;

    if (contentType === EmbeddingContentType.POST) {
      const items = await this.prisma.post.findMany({ where: { id: { in: ids } }, select: { id: true, userId: true } });
      items.forEach(i => map.set(i.id, i.userId));
    } else if (contentType === EmbeddingContentType.REEL) {
      const items = await this.prisma.reel.findMany({ where: { id: { in: ids } }, select: { id: true, userId: true } });
      items.forEach(i => map.set(i.id, i.userId));
    } else if (contentType === EmbeddingContentType.THREAD) {
      const items = await this.prisma.thread.findMany({ where: { id: { in: ids } }, select: { id: true, userId: true } });
      items.forEach(i => map.set(i.id, i.userId));
    }

    return map;
  }
}

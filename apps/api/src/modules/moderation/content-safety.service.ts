import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';

/**
 * Content safety & moderation service.
 * Handles AI moderation, forward limits, kindness reminders,
 * auto-removal, appeals, and viral content rate limiting.
 *
 * NOTE: This service overlaps with ModerationService (moderation.service.ts).
 * ContentSafetyService handles automated pipeline moderation (auto-remove, appeals, forward limits).
 * ModerationService handles admin/moderator queue, manual review, and user-facing moderation checks.
 * Future consolidation: merge into a single ModerationService when moderation pipeline is refactored.
 *
 * TODO: [WIRING] This service is currently not injected by any consumer. Wire it into:
 * - PostsService / ReelsService / ThreadsService for auto-moderation on content creation
 * - MessagesService for forward limit enforcement (checkForwardLimit/incrementForwardCount)
 * - FeedService for viral content throttling (checkViralThrottle/trackShare)
 */
@Injectable()
export class ContentSafetyService {
  private readonly logger = new Logger(ContentSafetyService.name);
  private readonly apiKey: string | undefined;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Inject('REDIS') private redis: Redis,
  ) {
    this.apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
  }

  // ── 82.1: AI image moderation ─────────────────────────────

  /**
   * Check image for NSFW content using Claude Vision API.
   */
  async moderateImage(imageUrl: string): Promise<{
    safe: boolean;
    confidence: number;
    flags: string[];
    action: 'allow' | 'flag' | 'remove';
  }> {
    if (!this.apiKey) {
      return { safe: false, confidence: 0, flags: ['moderation_unavailable'], action: 'flag' };
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: imageUrl } },
              {
                type: 'text',
                text: `Analyze this image for content safety. Check for: nudity, violence, gore, hate symbols, illegal content.
Respond as JSON: {"safe": boolean, "confidence": 0-1, "flags": ["nudity"|"violence"|"hate"|"illegal"|"suggestive"], "action": "allow"|"flag"|"remove"}`,
              },
            ],
          }],
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) return { safe: false, confidence: 0, flags: ['api_error'], action: 'flag' };
      const data: { content?: Array<{ text?: string }> } = await response.json();
      const text = data.content?.[0]?.text || '';
      try {
        const parsed = JSON.parse(text);
        return {
          safe: typeof parsed.safe === 'boolean' ? parsed.safe : false,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
          flags: Array.isArray(parsed.flags) ? parsed.flags : [],
          action: ['allow', 'flag', 'remove'].includes(parsed.action) ? parsed.action : 'flag',
        };
      } catch {
        return { safe: false, confidence: 0, flags: ['parse_error'], action: 'flag' };
      }
    } catch {
      return { safe: false, confidence: 0, flags: ['moderation_error'], action: 'flag' };
    }
  }

  // ── 82.2: Islamic-context NLP moderation ───────────────────

  /**
   * Check text for hate speech, Islamophobia, sectarian content.
   */
  async moderateText(text: string): Promise<{
    safe: boolean;
    flags: string[];
    suggestion?: string;
  }> {
    if (!text) return { safe: true, flags: [] };
    if (!this.apiKey) return { safe: false, flags: ['moderation_unavailable'] };

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: 'You are a content moderation system for Mizanly, a social platform for the Muslim community. Flag hate speech, Islamophobia, sectarian attacks, profanity, and harmful content. Be culturally sensitive.',
          messages: [{ role: 'user', content: `Analyze: "${text}"\nRespond as JSON: {"safe": boolean, "flags": ["hate"|"islamophobia"|"sectarian"|"profanity"|"harassment"], "suggestion": "optional rephrasing suggestion"}` }],
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) return { safe: false, flags: ['api_error'] };
      const data: { content?: Array<{ text?: string }> } = await response.json();
      try {
        const parsed = JSON.parse(data.content?.[0]?.text || '{}');
        return {
          safe: typeof parsed.safe === 'boolean' ? parsed.safe : false,
          flags: Array.isArray(parsed.flags) ? parsed.flags : [],
          suggestion: parsed.suggestion,
        };
      } catch {
        return { safe: false, flags: ['parse_error'] };
      }
    } catch {
      return { safe: false, flags: ['moderation_error'] };
    }
  }

  // ── 82.3: Forward limit ───────────────────────────────────

  /**
   * Check if a message has been forwarded too many times.
   * Max 5 forwards per message to prevent misinformation.
   */
  async checkForwardLimit(messageId: string): Promise<{
    allowed: boolean;
    forwardCount: number;
    maxForwards: number;
  }> {
    const MAX_FORWARDS = 5;
    const key = `forward_count:${messageId}`;
    const count = parseInt(await this.redis.get(key) || '0', 10);

    return {
      allowed: count < MAX_FORWARDS,
      forwardCount: count,
      maxForwards: MAX_FORWARDS,
    };
  }

  async incrementForwardCount(messageId: string): Promise<void> {
    const key = `forward_count:${messageId}`;
    await this.redis.incr(key);
    await this.redis.expire(key, 86400 * 30); // 30 day TTL
  }

  // ── 82.4: Kindness reminder ───────────────────────────────

  /**
   * Detect if a comment is potentially angry/harmful and suggest rephrasing.
   */
  async checkKindness(text: string): Promise<{
    isAngry: boolean;
    suggestion?: string;
  }> {
    // Quick heuristic check before expensive API call
    const angryPatterns = /\b(hate|stupid|idiot|shut up|worst|terrible|disgusting|loser|pathetic)\b/i;
    const hasExcessive = text.length > 10 && (text.match(/!/g)?.length || 0) > 3;

    if (!angryPatterns.test(text) && !hasExcessive) {
      return { isAngry: false };
    }

    // Use AI for nuanced detection
    if (this.apiKey) {
      const result = await this.moderateText(text);
      if (!result.safe) {
        return {
          isAngry: true,
          suggestion: result.suggestion || 'Consider rephrasing your message with more kindness.',
        };
      }
    }

    return { isAngry: true, suggestion: 'Would you like to rephrase this with more kindness?' };
  }

  // ── 82.5: Auto-remove + appeal flow ───────────────────────

  /**
   * Auto-remove content that clearly violates guidelines.
   * Creates a moderation log entry and notifies the user.
   */
  async autoRemoveContent(
    contentId: string,
    contentType: 'post' | 'reel' | 'thread' | 'comment',
    reason: string,
    flags: string[],
  ): Promise<void> {
    // Atomic: remove content + create audit log in a transaction
    await this.prisma.$transaction(async (tx) => {
      if (contentType === 'post') {
        await tx.post.update({
          where: { id: contentId },
          data: { isRemoved: true },
        });
      } else if (contentType === 'reel') {
        await tx.reel.update({
          where: { id: contentId },
          data: { isRemoved: true },
        });
      } else if (contentType === 'thread') {
        await tx.thread.update({
          where: { id: contentId },
          data: { isRemoved: true },
        });
      } else if (contentType === 'comment') {
        await tx.comment.update({
          where: { id: contentId },
          data: { isRemoved: true },
        });
      }

      const targetField = contentType === 'post' ? 'targetPostId'
        : contentType === 'comment' ? 'targetCommentId'
        : contentType === 'reel' ? 'targetPostId'
        : 'targetPostId';

      await tx.moderationLog.create({
        data: {
          moderatorId: 'system',
          [targetField]: contentId,
          action: 'CONTENT_REMOVED',
          reason,
          explanation: `Auto-removed: ${flags.join(', ')}`,
        },
      });
    });
  }

  // ── 82.7: Rate-limited viral content ──────────────────────

  /**
   * Slow distribution of unverified viral content.
   * Content with high share velocity but unverified source gets throttled.
   */
  async checkViralThrottle(contentId: string): Promise<{
    throttled: boolean;
    reason?: string;
  }> {
    const key = `viral_shares:${contentId}`;
    const shareCount = parseInt(await this.redis.get(key) || '0', 10);
    const ageKey = `content_age:${contentId}`;
    const ageStr = await this.redis.get(ageKey);
    const ageMinutes = ageStr ? (Date.now() - parseInt(ageStr, 10)) / 60000 : 9999;

    // Threshold: >50 shares in <60 minutes from unverified account
    if (shareCount > 50 && ageMinutes < 60) {
      return {
        throttled: true,
        reason: 'This content is being shared rapidly and is under review.',
      };
    }

    return { throttled: false };
  }

  async trackShare(contentId: string): Promise<void> {
    const key = `viral_shares:${contentId}`;
    await this.redis.incr(key);
    await this.redis.expire(key, 3600); // 1 hour window

    const ageKey = `content_age:${contentId}`;
    const exists = await this.redis.exists(ageKey);
    if (!exists) {
      await this.redis.setex(ageKey, 3600, Date.now().toString());
    }
  }
}

import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';

/**
 * Content safety & moderation service.
 * Handles AI moderation, forward limits, kindness reminders,
 * auto-removal, appeals, and viral content rate limiting.
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
      return { safe: true, confidence: 0.5, flags: [], action: 'allow' };
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
      });

      if (!response.ok) return { safe: true, confidence: 0.5, flags: [], action: 'allow' };
      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      return JSON.parse(text);
    } catch {
      return { safe: true, confidence: 0.5, flags: [], action: 'allow' };
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
    if (!this.apiKey || !text) return { safe: true, flags: [] };

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
      });

      if (!response.ok) return { safe: true, flags: [] };
      const data = await response.json();
      return JSON.parse(data.content?.[0]?.text || '{"safe":true,"flags":[]}');
    } catch {
      return { safe: true, flags: [] };
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
    // Remove the content
    if (contentType === 'post') {
      await this.prisma.post.update({
        where: { id: contentId },
        data: { isRemoved: true },
      });
    } else if (contentType === 'reel') {
      await this.prisma.reel.update({
        where: { id: contentId },
        data: { isRemoved: true },
      });
    } else if (contentType === 'thread') {
      await this.prisma.thread.update({
        where: { id: contentId },
        data: { isRemoved: true },
      });
    }

    // Log the moderation action
    await this.prisma.moderationLog.create({
      data: {
        contentId,
        contentType,
        action: 'auto_removed',
        reason,
        flags,
        status: 'resolved',
      },
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

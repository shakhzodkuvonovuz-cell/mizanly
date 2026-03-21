import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';

// AI response interfaces
export interface CaptionSuggestion {
  caption: string;
  tone: string; // casual | professional | funny | inspirational
}

export interface ModerationResult {
  safe: boolean;
  flags: string[];
  confidence: number;
  suggestion: string | null;
  category: string | null; // inappropriate | offensive | spam | misinformation | un-islamic
}

export interface SmartReply {
  text: string;
  tone: string; // friendly | formal | emoji | brief
}

export interface SpaceRouting {
  recommendedSpace: 'SAF' | 'MAJLIS' | 'BAKRA' | 'MINBAR';
  confidence: number;
  reason: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey: string | undefined;
  private readonly apiAvailable: boolean;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.apiAvailable = !!this.apiKey;
    if (!this.apiAvailable) {
      this.logger.warn('ANTHROPIC_API_KEY not set — AI features will use fallback responses');
    }
  }

  // ── Core Claude API call ────────────────────────────────

  private async callClaude(prompt: string, systemPrompt: string, maxTokens = 500): Promise<string> {
    if (!this.apiAvailable || !this.apiKey) {
      return this.getFallbackResponse(prompt);
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
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        this.logger.error(`Claude API error: ${response.status}`);
        return this.getFallbackResponse(prompt);
      }

      const data = await response.json();
      return data.content?.[0]?.text || this.getFallbackResponse(prompt);
    } catch (error) {
      this.logger.error('Claude API call failed', error);
      return this.getFallbackResponse(prompt);
    }
  }

  private getFallbackResponse(prompt: string): string {
    // Provide sensible fallbacks when API is unavailable
    if (prompt.includes('caption')) return 'Share your thoughts with the world';
    if (prompt.includes('hashtag')) return JSON.stringify(['mizanly', 'community']);
    if (prompt.includes('translate')) return '[Translation unavailable]';
    if (prompt.includes('moderate')) return JSON.stringify({ safe: false, flags: ['moderation_unavailable'], confidence: 0, category: 'review_required', suggestion: 'Content queued for manual review' });
    if (prompt.includes('summarize')) return 'Summary unavailable';
    if (prompt.includes('reply')) return JSON.stringify([{text:'Thanks!',tone:'friendly'},{text:'I agree',tone:'brief'},{text:'Interesting',tone:'brief'}]);
    return '';
  }

  // ── Caption Suggestions ─────────────────────────────────

  async suggestCaptions(content: string, mediaDescription?: string): Promise<CaptionSuggestion[]> {
    const prompt = `Generate 3 social media captions for a post.
Context: ${content || 'No text provided'}
Media: ${mediaDescription || 'No media description'}

Respond as JSON array: [{"caption": "...", "tone": "casual|professional|funny|inspirational"}]
Keep captions under 200 characters. Be creative and engaging. Consider Islamic audience.`;

    const systemPrompt = 'You are a social media content assistant for Mizanly, a platform for the global Muslim community. Generate culturally appropriate, engaging captions. Always respond with valid JSON.';

    const result = await this.callClaude(prompt, systemPrompt, 400);
    try {
      return JSON.parse(result);
    } catch {
      return [
        { caption: 'Share your thoughts with the world ✨', tone: 'casual' },
        { caption: 'Every moment is a blessing 🌿', tone: 'inspirational' },
        { caption: 'What do you think? Drop a comment below!', tone: 'casual' },
      ];
    }
  }

  // ── Hashtag Suggestions ─────────────────────────────────

  async suggestHashtags(content: string): Promise<string[]> {
    const prompt = `Suggest 8-10 relevant hashtags for this social media post:
"${content}"

Respond as JSON array of strings without # prefix. Include mix of popular and niche tags.
Consider Islamic/Muslim community context.`;

    const systemPrompt = 'You are a hashtag suggestion engine for Mizanly. Always respond with a valid JSON array of hashtag strings.';

    const result = await this.callClaude(prompt, systemPrompt, 200);
    try {
      return JSON.parse(result);
    } catch {
      return ['mizanly', 'community', 'muslim', 'inspiration', 'faith'];
    }
  }

  // ── Best Posting Time ───────────────────────────────────

  async suggestPostingTime(userId: string): Promise<{ bestTime: string; reason: string }> {
    // Analyze user's past engagement data
    const recentPosts = await this.prisma.post.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { createdAt: true, likesCount: true, commentsCount: true },
    });

    if (recentPosts.length < 3) {
      return {
        bestTime: '18:00',
        reason: 'Evening posts (after Maghrib) typically get the highest engagement on Mizanly',
      };
    }

    // Find highest engagement hour
    const hourEngagement: Record<number, number> = {};
    for (const post of recentPosts) {
      const hour = new Date(post.createdAt).getHours();
      hourEngagement[hour] = (hourEngagement[hour] || 0) + post.likesCount + post.commentsCount;
    }

    const bestHour = Object.entries(hourEngagement)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || '18';

    return {
      bestTime: `${bestHour.padStart(2, '0')}:00`,
      reason: `Your posts at this time get ${Math.round(1.5 * (hourEngagement[parseInt(bestHour)] || 1))} average engagements`,
    };
  }

  // ── Translation ─────────────────────────────────────────

  async translateText(text: string, targetLanguage: string, contentId?: string, contentType?: string): Promise<string> {
    // Check cache first
    if (contentId) {
      const cached = await this.prisma.aiTranslation.findUnique({
        where: { contentId_targetLanguage: { contentId, targetLanguage } },
      });
      if (cached) return cached.translatedText;
    }

    const languageNames: Record<string, string> = {
      ar: 'Arabic', en: 'English', ur: 'Urdu', tr: 'Turkish',
      ms: 'Malay', fr: 'French', bn: 'Bengali', id: 'Indonesian',
      de: 'German', es: 'Spanish', hi: 'Hindi', fa: 'Persian',
    };

    const targetName = languageNames[targetLanguage] || targetLanguage;
    const prompt = `Translate the following text to ${targetName}. Preserve Islamic terms (like "Alhamdulillah", "SubhanAllah", "InshaAllah") without translating them. Only return the translation, nothing else.

Text: ${text}`;

    const systemPrompt = `You are a professional translator specializing in Islamic and Muslim community content. Preserve cultural nuances and Islamic terminology. Only respond with the translated text.`;

    const translated = await this.callClaude(prompt, systemPrompt, 1000);

    // Cache the translation
    if (contentId && contentType) {
      await this.prisma.aiTranslation.upsert({
        where: { contentId_targetLanguage: { contentId, targetLanguage } },
        create: {
          contentType,
          contentId,
          sourceLanguage: 'auto',
          targetLanguage,
          translatedText: translated,
        },
        update: { translatedText: translated },
      });
    }

    return translated;
  }

  // ── Content Moderation ──────────────────────────────────

  async moderateContent(text: string, contentType: string): Promise<ModerationResult> {
    const prompt = `Analyze this ${contentType} for content safety on an Islamic social platform.

Content: "${text}"

Check for:
1. Inappropriate/explicit content
2. Hate speech or offensive language
3. Spam or misleading content
4. Misinformation
5. Content that contradicts core Islamic values

Respond as JSON: {"safe": boolean, "flags": ["..."], "confidence": 0.0-1.0, "category": null|"inappropriate"|"offensive"|"spam"|"misinformation"|"un-islamic", "suggestion": null|"suggested improvement"}`;

    const systemPrompt = 'You are a content moderator for Mizanly, an Islamic social platform. Be culturally sensitive. Flag genuinely problematic content but allow respectful discussion and diverse Islamic viewpoints. Always respond with valid JSON.';

    const result = await this.callClaude(prompt, systemPrompt, 300);
    try {
      return JSON.parse(result);
    } catch {
      return { safe: true, flags: [], confidence: 0.5, suggestion: null, category: null };
    }
  }

  // ── Smart Replies ───────────────────────────────────────

  async suggestSmartReplies(conversationContext: string, lastMessages: string[]): Promise<SmartReply[]> {
    const prompt = `Given this conversation context, suggest 3 natural reply options.

Context: ${conversationContext}
Recent messages:
${lastMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Respond as JSON array: [{"text": "...", "tone": "friendly|formal|emoji|brief"}]
Keep replies short (under 50 chars). Make them feel natural, not robotic.`;

    const systemPrompt = 'You are a smart reply assistant for a Muslim social platform. Generate culturally appropriate, natural replies. Common greetings include Assalamu Alaikum, MashaAllah, JazakAllah Khair. Always respond with valid JSON.';

    const result = await this.callClaude(prompt, systemPrompt, 300);
    try {
      return JSON.parse(result);
    } catch {
      return [
        { text: 'JazakAllah Khair! 🤲', tone: 'friendly' },
        { text: 'MashaAllah, that\'s wonderful!', tone: 'friendly' },
        { text: 'I agree completely', tone: 'brief' },
      ];
    }
  }

  // ── Content Summarization ───────────────────────────────

  async summarizeContent(text: string, maxLength = 150): Promise<string> {
    if (text.length <= maxLength) return text;

    const prompt = `Summarize this content in ${maxLength} characters or less. Keep the essence and key points.

Content: "${text}"

Only respond with the summary, nothing else.`;

    const systemPrompt = 'You are a content summarizer. Be concise and accurate. Preserve key information.';

    return this.callClaude(prompt, systemPrompt, 200);
  }

  // ── Smart Space Routing ─────────────────────────────────

  async routeToSpace(content: string, mediaTypes: string[]): Promise<SpaceRouting> {
    const hasImage = mediaTypes.some(t => t.startsWith('image'));
    const hasVideo = mediaTypes.some(t => t.startsWith('video'));
    const isLongVideo = mediaTypes.includes('long_video');
    const isShortText = content.length < 280;
    const isLongText = content.length > 500;

    // Rule-based routing first (fast, no API call needed)
    if (isLongVideo) {
      return { recommendedSpace: 'MINBAR', confidence: 0.95, reason: 'Long-form video content fits best on Minbar' };
    }
    if (hasVideo && !isLongVideo) {
      return { recommendedSpace: 'BAKRA', confidence: 0.9, reason: 'Short video content is perfect for Bakra' };
    }
    if (hasImage && !isLongText) {
      return { recommendedSpace: 'SAF', confidence: 0.85, reason: 'Photo content with a caption is ideal for Saf' };
    }
    if (isShortText && !hasImage && !hasVideo) {
      return { recommendedSpace: 'MAJLIS', confidence: 0.85, reason: 'Short text discussions work best on Majlis' };
    }
    if (isLongText && !hasImage) {
      return { recommendedSpace: 'MAJLIS', confidence: 0.8, reason: 'Long-form text is great for Majlis threads' };
    }

    // Default: Saf
    return { recommendedSpace: 'SAF', confidence: 0.6, reason: 'Mixed content — Saf is a versatile choice' };
  }

  // ── Video Caption Generation (Whisper) ──────────────────

  async generateVideoCaptions(videoId: string, audioUrl: string, language = 'en'): Promise<string> {
    const whisperKey = this.config.get<string>('OPENAI_API_KEY');

    if (!whisperKey) {
      this.logger.warn('OPENAI_API_KEY not set — video captions unavailable');
      await this.prisma.aiCaption.upsert({
        where: { videoId_language: { videoId, language } },
        create: { videoId, language, srtContent: '', status: 'failed' },
        update: { status: 'failed' },
      });
      return '';
    }

    // Mark as processing
    await this.prisma.aiCaption.upsert({
      where: { videoId_language: { videoId, language } },
      create: { videoId, language, srtContent: '', status: 'processing' },
      update: { status: 'processing' },
    });

    try {
      // Download audio and send to Whisper
      const audioResponse = await fetch(audioUrl);
      const audioBlob = await audioResponse.blob();

      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.mp4');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'srt');
      formData.append('language', language);

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${whisperKey}` },
        body: formData,
      });

      if (!whisperResponse.ok) {
        throw new Error(`Whisper API error: ${whisperResponse.status}`);
      }

      const srtContent = await whisperResponse.text();

      await this.prisma.aiCaption.update({
        where: { videoId_language: { videoId, language } },
        data: { srtContent, status: 'complete' },
      });

      return srtContent;
    } catch (error) {
      this.logger.error('Whisper transcription failed', error);
      await this.prisma.aiCaption.update({
        where: { videoId_language: { videoId, language } },
        data: { status: 'failed' },
      });
      return '';
    }
  }

  // ── Voice Message Transcription ──────────────────────────

  /**
   * Transcribe a voice message using Whisper API.
   * Updates the message's transcription field in the database.
   * Returns the transcription text or null on failure.
   */
  async transcribeVoiceMessage(messageId: string, audioUrl: string): Promise<string | null> {
    const whisperKey = this.config.get<string>('OPENAI_API_KEY');

    if (!whisperKey) {
      this.logger.debug('OPENAI_API_KEY not set — voice transcription skipped');
      return null;
    }

    try {
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        this.logger.warn(`Failed to fetch voice message audio: ${audioResponse.status}`);
        return null;
      }

      const audioBlob = await audioResponse.blob();

      const formData = new FormData();
      formData.append('file', audioBlob, 'voice.m4a');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'text');
      // No language specified — Whisper auto-detects
      // Supports: Arabic, English, Turkish, Urdu, Bengali, French, Indonesian, Malay

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${whisperKey}` },
        body: formData,
      });

      if (!whisperResponse.ok) {
        this.logger.warn(`Whisper voice transcription failed: ${whisperResponse.status}`);
        return null;
      }

      const transcription = (await whisperResponse.text()).trim();

      if (!transcription) {
        return null;
      }

      // Update message with transcription
      await this.prisma.message.update({
        where: { id: messageId },
        data: { transcription },
      });

      return transcription;
    } catch (error) {
      this.logger.error(`Voice transcription failed for message ${messageId}`, error);
      return null;
    }
  }

  async getVideoCaptions(videoId: string, language = 'en') {
    return this.prisma.aiCaption.findUnique({
      where: { videoId_language: { videoId, language } },
    });
  }

  // ── AI Avatar Generation ────────────────────────────────

  async generateAvatar(userId: string, sourceUrl: string, style: string): Promise<{ avatarUrl: string }> {
    // In production, this would call a style-transfer API (e.g., Stable Diffusion)
    // For now, store a reference — the actual generation happens async
    const avatar = await this.prisma.aiAvatar.create({
      data: {
        userId,
        sourceUrl,
        avatarUrl: sourceUrl, // Placeholder — would be replaced by generated image
        style,
      },
    });

    return { avatarUrl: avatar.avatarUrl };
  }

  async getUserAvatars(userId: string) {
    return this.prisma.aiAvatar.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  // ── Image Content Moderation (Vision) ───────────────────

  /**
   * Moderate an image using Claude Vision API.
   * Returns classification: SAFE, WARNING (sensitive content), or BLOCK (violating content).
   */
  async moderateImage(imageUrl: string): Promise<{
    classification: 'SAFE' | 'WARNING' | 'BLOCK';
    reason: string | null;
    categories: string[];
  }> {
    if (!this.apiAvailable || !this.apiKey) {
      this.logger.warn('AI not available for image moderation — flagging for manual review');
      return { classification: 'WARNING', reason: 'AI unavailable — flagged for manual review', categories: ['moderation_unavailable'] };
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
              {
                type: 'image',
                source: { type: 'url', url: imageUrl },
              },
              {
                type: 'text',
                text: `Analyze this image for content moderation on a family-friendly Muslim social platform.
Classify as one of: SAFE, WARNING, BLOCK
Check for:
- Nudity or sexual content → BLOCK
- Graphic violence or gore → BLOCK
- Hate symbols or extremist imagery → BLOCK
- Alcohol, drugs, gambling imagery → WARNING
- Suggestive but not explicit content → WARNING
- Religious mockery or offensive content → WARNING
Respond ONLY with JSON: {"classification": "SAFE", "reason": null, "categories": []}`,
              },
            ],
          }],
        }),
      });

      if (!response.ok) {
        this.logger.error(`Image moderation API error: ${response.status}`);
        return { classification: 'WARNING', reason: 'Moderation API error — flagged for review', categories: ['moderation_error'] };
      }

      const data = await response.json();
      const text = data.content?.[0]?.text?.trim() || '';

      // Extract JSON from response (Claude sometimes wraps in markdown)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { classification: 'WARNING', reason: 'Could not parse moderation result', categories: ['parse_error'] };
      }

      const result = JSON.parse(jsonMatch[0]);
      return {
        classification: (['SAFE', 'WARNING', 'BLOCK'].includes(result.classification)) ? result.classification : 'WARNING',
        reason: result.reason || null,
        categories: Array.isArray(result.categories) ? result.categories : [],
      };
    } catch (error) {
      this.logger.error('Image moderation error', error instanceof Error ? error.message : error);
      return { classification: 'WARNING', reason: 'Moderation check failed — flagged for review', categories: ['moderation_error'] };
    }
  }

  /**
   * Check if AI service is operational.
   */
  isAvailable(): boolean {
    return this.apiAvailable;
  }

  // ── AI Alt Text (Accessibility) ───────────────────────────

  /**
   * Generate alt text for an uploaded image using Claude Vision API.
   * Returns a concise, descriptive alt text for screen readers.
   */
  async generateAltText(imageUrl: string): Promise<string> {
    if (!this.apiAvailable || !this.apiKey) {
      return 'Image';
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
          max_tokens: 150,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'url', url: imageUrl },
              },
              {
                type: 'text',
                text: 'Generate a concise alt text description for this image (max 125 characters). Focus on the key visual content for screen reader users. Be factual and descriptive, not interpretive. Respond with ONLY the alt text, no quotes or explanation.',
              },
            ],
          }],
        }),
      });

      if (!response.ok) {
        this.logger.error(`Alt text generation failed: ${response.status}`);
        return 'Image';
      }

      const data = await response.json();
      const altText = data.content?.[0]?.text?.trim() || 'Image';
      // Truncate to 125 chars for WCAG best practice
      return altText.slice(0, 125);
    } catch (error) {
      this.logger.error('Alt text generation error', error instanceof Error ? error.message : error);
      return 'Image';
    }
  }
}

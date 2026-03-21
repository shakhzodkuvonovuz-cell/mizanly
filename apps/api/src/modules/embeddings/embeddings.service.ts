import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { EmbeddingContentType } from '@prisma/client';

interface EmbeddingResponse {
  embedding: {
    values: number[];
  };
}

interface GeminiBatchEmbeddingResponse {
  embeddings: Array<{
    values: number[];
  }>;
}

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly apiKey: string | undefined;
  private readonly apiAvailable: boolean;
  private readonly MODEL = 'text-embedding-004';
  private readonly DIMENSION = 768;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY');
    this.apiAvailable = !!this.apiKey;
    if (!this.apiAvailable) {
      this.logger.warn('GEMINI_API_KEY not set — embedding features disabled');
    }
  }

  /**
   * Generate embedding vector for a single text using Gemini text-embedding-004
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.apiAvailable || !this.apiKey) return null;
    if (!text || text.trim().length === 0) return null;

    // Truncate to ~8K tokens (~32K chars) — Gemini embedding limit
    const truncated = text.slice(0, 32000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL}:embedContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${this.MODEL}`,
            content: { parts: [{ text: truncated }] },
            outputDimensionality: this.DIMENSION,
          }),
        },
      );

      if (!response.ok) {
        this.logger.error(`Gemini embedding API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = (await response.json()) as EmbeddingResponse;
      return data.embedding.values;
    } catch (error) {
      this.logger.error('Failed to generate embedding', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Generate embeddings for multiple texts in a single batch call
   */
  async generateBatchEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    if (!this.apiAvailable || !this.apiKey) return texts.map(() => null);
    if (texts.length === 0) return [];

    try {
      const requests = texts.map(text => ({
        model: `models/${this.MODEL}`,
        content: { parts: [{ text: text.slice(0, 32000) }] },
        outputDimensionality: this.DIMENSION,
      }));

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL}:batchEmbedContents?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests }),
        },
      );

      if (!response.ok) {
        this.logger.error(`Gemini batch embedding error: ${response.status}`);
        return texts.map(() => null);
      }

      const data = (await response.json()) as GeminiBatchEmbeddingResponse;
      return data.embeddings.map(e => e.values);
    } catch (error) {
      this.logger.error('Batch embedding failed', error instanceof Error ? error.message : error);
      return texts.map(() => null);
    }
  }

  /**
   * Build text representation for embedding from content metadata
   */
  buildContentText(content: {
    text?: string | null;
    hashtags?: string[];
    mentions?: string[];
    locationName?: string | null;
    category?: string | null;
  }): string {
    const parts: string[] = [];
    if (content.text) parts.push(content.text);
    if (content.hashtags?.length) parts.push(content.hashtags.join(' '));
    if (content.locationName) parts.push(content.locationName);
    if (content.category) parts.push(content.category);
    return parts.join(' ').trim();
  }

  /**
   * Store an embedding vector in the database using raw SQL (pgvector)
   */
  async storeEmbedding(
    contentId: string,
    contentType: EmbeddingContentType,
    vector: number[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const vectorStr = `[${vector.join(',')}]`;
    const metaJson = metadata ? JSON.stringify(metadata) : null;

    await this.prisma.$executeRaw`
      INSERT INTO embeddings (id, "contentId", "contentType", vector, metadata, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${contentId}, ${contentType}::"EmbeddingContentType", ${vectorStr}::vector, ${metaJson}::jsonb, NOW(), NOW())
      ON CONFLICT ("contentId", "contentType")
      DO UPDATE SET vector = ${vectorStr}::vector, metadata = ${metaJson}::jsonb, "updatedAt" = NOW()
    `;
  }

  /**
   * Embed a post and store it
   */
  async embedPost(postId: string): Promise<boolean> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, content: true, hashtags: true, mentions: true, locationName: true },
    });
    if (!post) return false;

    const text = this.buildContentText({
      text: post.content,
      hashtags: post.hashtags,
      mentions: post.mentions,
      locationName: post.locationName,
    });
    if (!text) return false;

    const vector = await this.generateEmbedding(text);
    if (!vector) return false;

    await this.storeEmbedding(postId, EmbeddingContentType.POST, vector, { hashtags: post.hashtags });
    return true;
  }

  /**
   * Embed a reel and store it
   */
  async embedReel(reelId: string): Promise<boolean> {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      select: { id: true, caption: true, hashtags: true, mentions: true, audioTitle: true },
    });
    if (!reel) return false;

    const text = this.buildContentText({
      text: reel.caption,
      hashtags: reel.hashtags,
      mentions: reel.mentions,
      category: reel.audioTitle,
    });
    if (!text) return false;

    const vector = await this.generateEmbedding(text);
    if (!vector) return false;

    await this.storeEmbedding(reelId, EmbeddingContentType.REEL, vector, { hashtags: reel.hashtags });
    return true;
  }

  /**
   * Embed a thread and store it
   */
  async embedThread(threadId: string): Promise<boolean> {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true, content: true, hashtags: true, mentions: true },
    });
    if (!thread) return false;

    const text = this.buildContentText({
      text: thread.content,
      hashtags: thread.hashtags,
      mentions: thread.mentions,
    });
    if (!text) return false;

    const vector = await this.generateEmbedding(text);
    if (!vector) return false;

    await this.storeEmbedding(threadId, EmbeddingContentType.THREAD, vector, { hashtags: thread.hashtags });
    return true;
  }

  /**
   * Embed a video and store it
   */
  async embedVideo(videoId: string): Promise<boolean> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, title: true, description: true, tags: true, category: true },
    });
    if (!video) return false;

    const text = this.buildContentText({
      text: `${video.title} ${video.description || ''}`,
      hashtags: video.tags,
      category: video.category,
    });
    if (!text) return false;

    const vector = await this.generateEmbedding(text);
    if (!vector) return false;

    await this.storeEmbedding(videoId, EmbeddingContentType.VIDEO, vector, { tags: video.tags, category: video.category });
    return true;
  }

  /** Validate filterTypes against the EmbeddingContentType enum to prevent SQL injection */
  private validateFilterTypes(filterTypes?: EmbeddingContentType[]): EmbeddingContentType[] {
    if (!filterTypes?.length) return [];
    const valid = Object.values(EmbeddingContentType);
    return filterTypes.filter(t => valid.includes(t));
  }

  /** Validate IDs are safe alphanumeric/dash/underscore strings (cuid or uuid format) */
  private validateIds(ids?: string[]): string[] {
    if (!ids?.length) return [];
    const safePattern = /^[a-zA-Z0-9_-]+$/;
    return ids.filter(id => safePattern.test(id));
  }

  /**
   * Find similar content using pgvector KNN cosine similarity
   */
  async findSimilar(
    contentId: string,
    contentType: EmbeddingContentType,
    limit = 20,
    filterTypes?: EmbeddingContentType[],
  ): Promise<Array<{ contentId: string; contentType: EmbeddingContentType; similarity: number }>> {
    const safeTypes = this.validateFilterTypes(filterTypes);
    const typeFilter = safeTypes.length
      ? `AND e2."contentType" IN (${safeTypes.map(t => `'${t}'`).join(',')})`
      : '';

    const results = await this.prisma.$queryRawUnsafe<
      Array<{ contentId: string; contentType: EmbeddingContentType; similarity: number }>
    >(
      `SELECT e2."contentId", e2."contentType", 1 - (e1.vector <=> e2.vector) AS similarity
       FROM embeddings e1
       JOIN embeddings e2 ON e1.id != e2.id
       WHERE e1."contentId" = $1 AND e1."contentType" = $2::"EmbeddingContentType"
       ${typeFilter}
       ORDER BY e1.vector <=> e2.vector
       LIMIT $3`,
      contentId,
      contentType,
      limit,
    );

    return results;
  }

  /**
   * Find similar content given a raw vector (for user interest matching)
   */
  async findSimilarByVector(
    vector: number[],
    limit = 50,
    filterTypes?: EmbeddingContentType[],
    excludeIds?: string[],
  ): Promise<Array<{ contentId: string; contentType: EmbeddingContentType; similarity: number }>> {
    const vectorStr = `[${vector.join(',')}]`;
    const conditions: string[] = [];

    const safeTypes = this.validateFilterTypes(filterTypes);
    if (safeTypes.length) {
      conditions.push(`"contentType" IN (${safeTypes.map(t => `'${t}'`).join(',')})`);
    }
    const safeExcludeIds = this.validateIds(excludeIds);
    if (safeExcludeIds.length) {
      conditions.push(`"contentId" NOT IN (${safeExcludeIds.map(id => `'${id}'`).join(',')})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const results = await this.prisma.$queryRawUnsafe<
      Array<{ contentId: string; contentType: EmbeddingContentType; similarity: number }>
    >(
      `SELECT "contentId", "contentType", 1 - (vector <=> $1::vector) AS similarity
       FROM embeddings
       ${whereClause}
       ORDER BY vector <=> $1::vector
       LIMIT $2`,
      vectorStr,
      limit,
    );

    return results;
  }

  /**
   * Compute average vector from a user's recent interactions (user interest profile)
   */
  async getUserInterestVector(userId: string): Promise<number[] | null> {
    // Get recent liked/saved/long-viewed content IDs
    const interactions = await this.prisma.feedInteraction.findMany({
      where: {
        userId,
        OR: [
          { liked: true },
          { saved: true },
          { viewDurationMs: { gte: 5000 } },
        ],
      },
      select: { postId: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    if (interactions.length === 0) return null;

    const postIds = interactions.map(i => i.postId);

    // Get average vector from embeddings
    const result = await this.prisma.$queryRawUnsafe<Array<{ avg_vector: string }>>(
      `SELECT AVG(vector)::text AS avg_vector
       FROM embeddings
       WHERE "contentId" = ANY($1)`,
      postIds,
    );

    if (!result.length || !result[0].avg_vector) return null;

    // Parse vector string "[0.1,0.2,...]" to number array
    const parsed = result[0].avg_vector
      .replace('[', '')
      .replace(']', '')
      .split(',')
      .map(Number);

    return parsed;
  }
}

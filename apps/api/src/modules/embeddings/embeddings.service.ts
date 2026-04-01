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
    } else {
      // Note: Gemini API requires the key as a URL query parameter (not a header).
      // This is Google's required authentication method for this API.
      // Ensure error responses are not logged with full URLs to prevent key leakage.
      this.logger.warn(
        'GEMINI_API_KEY is passed as a URL query parameter per Google API requirements. ' +
        'Ensure HTTP error logs do not expose full request URLs.',
      );
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
        `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL}:embedContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify({
            model: `models/${this.MODEL}`,
            content: { parts: [{ text: truncated }] },
            outputDimensionality: this.DIMENSION,
          }),
          signal: AbortSignal.timeout(30000),
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
          signal: AbortSignal.timeout(60000),
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
   * Find similar content using pgvector KNN cosine similarity.
   *
   * PERFORMANCE NOTE: For production with >100K embeddings, create an HNSW index:
   *   CREATE INDEX embeddings_vector_idx ON embeddings USING hnsw (vector vector_cosine_ops);
   * This changes the scan from O(n) sequential to O(log n) approximate nearest neighbor.
   * Run REINDEX after bulk data loads. Requires pgvector extension v0.5+.
   */
  async findSimilar(
    contentId: string,
    contentType: EmbeddingContentType,
    limit = 20,
    filterTypes?: EmbeddingContentType[],
  ): Promise<Array<{ contentId: string; contentType: EmbeddingContentType; similarity: number }>> {
    // SAFE: validateFilterTypes restricts to Prisma enum whitelist values only
    const safeTypes = this.validateFilterTypes(filterTypes);
    const typeFilter = safeTypes.length
      ? `AND e2."contentType" IN (${safeTypes.map(t => `'${t}'`).join(',')})`
      : '';

    // $queryRawUnsafe used because pgvector <=> operator + dynamic IN clause
    // are not expressible in Prisma tagged templates. All interpolated values
    // are pre-validated: safeTypes via enum whitelist, positional $1/$2/$3 for user input.
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

    // SAFE: validateFilterTypes restricts to Prisma enum whitelist, validateIds to /^[a-zA-Z0-9_-]+$/
    const safeTypes = this.validateFilterTypes(filterTypes);
    if (safeTypes.length) {
      conditions.push(`"contentType" IN (${safeTypes.map(t => `'${t}'`).join(',')})`);
    }
    const safeExcludeIds = this.validateIds(excludeIds);
    if (safeExcludeIds.length) {
      conditions.push(`"contentId" NOT IN (${safeExcludeIds.map(id => `'${id}'`).join(',')})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // $queryRawUnsafe: pgvector <=> + dynamic WHERE not expressible in tagged templates.
    // All values pre-validated. Positional $1/$2 used for vector and limit.
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
   * Compute multi-cluster interest vectors from a user's recent interactions.
   *
   * Instead of averaging ALL interactions into one "muddy centroid" (which fails
   * for users with diverse interests — e.g. Islamic calligraphy AND tech tutorials),
   * we cluster the interaction embeddings into 2-3 centroids using k-means.
   * Each centroid represents a distinct interest cluster, enabling the recommendation
   * engine to find content matching ANY of the user's interest areas.
   *
   * Returns array of centroid vectors (2-3 centroids), or null if no data.
   */
  async getUserInterestVector(userId: string): Promise<number[][] | null> {
    // Skip DB queries entirely when embeddings API is not configured
    if (!this.apiAvailable) return null;

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

    // Fetch individual vectors (not averaged) for clustering
    // SAFE: postIds passed as positional parameter $1, not interpolated
    const rows = await this.prisma.$queryRawUnsafe<Array<{ vector_text: string }>>(
      `SELECT vector::text AS vector_text
       FROM embeddings
       WHERE "contentId" = ANY($1)`,
      postIds,
    );

    if (!rows.length) return null;

    // Parse each vector string "[0.1,0.2,...]" into number[]
    const vectors: number[][] = [];
    for (const row of rows) {
      if (!row.vector_text) continue;
      const parsed = row.vector_text
        .replace('[', '')
        .replace(']', '')
        .split(',')
        .map(Number)
        .map(v => (Number.isFinite(v) ? v : 0));
      if (parsed.length > 0) vectors.push(parsed);
    }

    if (vectors.length === 0) return null;

    // For very few vectors (< 5), just return a single centroid — no benefit to clustering
    if (vectors.length < 5) {
      return [this.averageVectors(vectors)];
    }

    // Cluster into k centroids: k = min(3, ceil(count / 5))
    const k = Math.min(3, Math.ceil(vectors.length / 5));
    const clusters = this.kMeansClustering(vectors, k);

    // Return centroids for non-empty clusters
    const centroids = clusters
      .filter(cluster => cluster.length > 0)
      .map(cluster => this.averageVectors(cluster));

    return centroids.length > 0 ? centroids : null;
  }

  /**
   * Find similar content for multiple interest vectors (centroids), merging and
   * deduplicating results. Each centroid gets proportional candidate slots.
   */
  async findSimilarByMultipleVectors(
    vectors: number[][],
    limit: number,
    filterTypes?: EmbeddingContentType[],
    excludeIds?: string[],
  ): Promise<Array<{ contentId: string; contentType: EmbeddingContentType; similarity: number }>> {
    if (vectors.length === 0) return [];

    // Single centroid — delegate directly
    if (vectors.length === 1) {
      return this.findSimilarByVector(vectors[0], limit, filterTypes, excludeIds);
    }

    // Query each centroid with proportional limit, then merge
    const perCentroidLimit = Math.ceil(limit / vectors.length) + Math.ceil(limit * 0.2);
    const allResults = await Promise.all(
      vectors.map(vec => this.findSimilarByVector(vec, perCentroidLimit, filterTypes, excludeIds)),
    );

    // Merge and deduplicate: keep highest similarity per contentId
    const bestByContentId = new Map<string, { contentId: string; contentType: EmbeddingContentType; similarity: number }>();
    for (const results of allResults) {
      for (const item of results) {
        const existing = bestByContentId.get(item.contentId);
        if (!existing || item.similarity > existing.similarity) {
          bestByContentId.set(item.contentId, item);
        }
      }
    }

    // Sort by similarity descending, return up to limit
    return Array.from(bestByContentId.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  // ── Clustering helpers ─────────────────────────────────────────

  /**
   * Simple k-means clustering for embedding vectors.
   * Initializes centroids by picking k evenly-spaced vectors from the input.
   * Converges when centroids move less than 0.001 cosine distance, or after maxIterations.
   */
  kMeansClustering(vectors: number[][], k: number, maxIterations = 10): number[][][] {
    if (k <= 0 || vectors.length === 0) return [];
    if (k >= vectors.length) return vectors.map(v => [v]);

    // Initialize centroids by picking k evenly-spaced vectors
    const step = Math.floor(vectors.length / k);
    let centroids = Array.from({ length: k }, (_, i) => [...vectors[i * step]]);

    let clusters: number[][][] = Array.from({ length: k }, () => []);

    for (let iter = 0; iter < maxIterations; iter++) {
      // Reset clusters
      clusters = Array.from({ length: k }, () => []);

      // Assign each vector to nearest centroid
      for (const vec of vectors) {
        let minDist = Infinity;
        let nearest = 0;
        for (let c = 0; c < centroids.length; c++) {
          const dist = this.cosineDistance(vec, centroids[c]);
          if (dist < minDist) {
            minDist = dist;
            nearest = c;
          }
        }
        clusters[nearest].push(vec);
      }

      // Recompute centroids (empty clusters keep old centroid)
      const newCentroids = clusters.map((cluster, i) =>
        cluster.length > 0 ? this.averageVectors(cluster) : centroids[i],
      );

      // Check convergence: all centroids moved less than 0.001
      const converged = centroids.every((c, i) =>
        this.cosineDistance(c, newCentroids[i]) < 0.001,
      );
      centroids = newCentroids;
      if (converged) break;
    }

    return clusters;
  }

  /**
   * Cosine distance between two vectors: 1 - cosine_similarity.
   * Returns 1.0 (max distance) for zero-magnitude vectors.
   */
  cosineDistance(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 1.0;

    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    const denominator = Math.sqrt(magA) * Math.sqrt(magB);
    if (denominator === 0) return 1.0;

    return 1 - dot / denominator;
  }

  /**
   * Element-wise average of a set of vectors.
   * All vectors must have the same dimensionality.
   */
  averageVectors(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    if (vectors.length === 1) return [...vectors[0]];

    const dim = vectors[0].length;
    const sum = new Array(dim).fill(0);
    for (const vec of vectors) {
      for (let i = 0; i < dim; i++) {
        sum[i] += vec[i];
      }
    }
    return sum.map(s => s / vectors.length);
  }
}

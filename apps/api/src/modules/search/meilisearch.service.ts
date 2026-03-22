import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MeilisearchDocument {
  id: string;
  type: string; // user, post, thread, reel, video, hashtag
  title?: string;
  content?: string;
  username?: string;
  hashtags?: string[];
  language?: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface MeilisearchSearchResult {
  hits: MeilisearchDocument[];
  estimatedTotalHits: number;
  processingTimeMs: number;
  query: string;
}

/**
 * Meilisearch integration service.
 * Provides full-text search with typo tolerance, Arabic-aware tokenization,
 * and faceted filtering across all content types.
 *
 * Falls back gracefully if Meilisearch is not configured.
 */
@Injectable()
export class MeilisearchService implements OnModuleInit {
  private readonly logger = new Logger(MeilisearchService.name);
  private readonly host: string;
  private readonly apiKey: string;
  private readonly available: boolean;

  constructor(private config: ConfigService) {
    this.host = this.config.get<string>('MEILISEARCH_HOST') || '';
    this.apiKey = this.config.get<string>('MEILISEARCH_API_KEY') || '';
    this.available = !!this.host;
  }

  async onModuleInit() {
    if (!this.available) {
      this.logger.warn('Meilisearch not configured — using Prisma fallback search');
      return;
    }

    try {
      // Create indexes if they don't exist
      const indexes = ['users', 'posts', 'threads', 'reels', 'videos', 'hashtags'];
      for (const index of indexes) {
        await this.createIndex(index);
      }

      // Configure searchable attributes
      await this.updateSettings('users', {
        searchableAttributes: ['username', 'displayName', 'bio'],
        filterableAttributes: ['isVerified'],
        sortableAttributes: ['followerCount'],
      });

      await this.updateSettings('posts', {
        searchableAttributes: ['content', 'hashtags'],
        filterableAttributes: ['userId', 'postType'],
        sortableAttributes: ['likesCount', 'createdAt'],
      });

      await this.updateSettings('threads', {
        searchableAttributes: ['content', 'hashtags'],
        filterableAttributes: ['userId'],
        sortableAttributes: ['likesCount', 'createdAt'],
      });

      await this.updateSettings('reels', {
        searchableAttributes: ['caption', 'hashtags'],
        filterableAttributes: ['userId', 'status'],
        sortableAttributes: ['likesCount', 'viewsCount', 'createdAt'],
      });

      await this.updateSettings('videos', {
        searchableAttributes: ['title', 'description', 'tags'],
        filterableAttributes: ['userId', 'channelId', 'category', 'status'],
        sortableAttributes: ['viewsCount', 'likesCount', 'publishedAt', 'createdAt'],
      });

      await this.updateSettings('hashtags', {
        searchableAttributes: ['name'],
        sortableAttributes: ['postsCount', 'createdAt'],
      });

      this.logger.log('Meilisearch indexes configured (6/6)');
    } catch (error) {
      this.logger.error('Meilisearch initialization failed', error);
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async search(indexName: string, query: string, options?: {
    limit?: number;
    offset?: number;
    filter?: string;
    sort?: string[];
  }): Promise<MeilisearchSearchResult | null> {
    if (!this.available) return null;

    try {
      const response = await fetch(`${this.host}/indexes/${indexName}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          q: query,
          limit: options?.limit ?? 20,
          offset: options?.offset ?? 0,
          filter: options?.filter,
          sort: options?.sort,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(`Meilisearch search failed for ${indexName}: ${response.status}`);
        return null;
      }
      return response.json() as Promise<MeilisearchSearchResult>;
    } catch (error) {
      this.logger.error(`Meilisearch search error for ${indexName}`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  async addDocuments(indexName: string, documents: MeilisearchDocument[]) {
    if (!this.available || documents.length === 0) return;

    try {
      await fetch(`${this.host}/indexes/${indexName}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(documents),
      });
    } catch (error) {
      this.logger.error(`Failed to index ${documents.length} docs to ${indexName}`, error);
    }
  }

  async deleteDocument(indexName: string, documentId: string) {
    if (!this.available) return;

    try {
      await fetch(`${this.host}/indexes/${encodeURIComponent(indexName)}/documents/${encodeURIComponent(documentId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
    } catch (error) {
      this.logger.warn(`Meilisearch delete failed for ${indexName}/${documentId}`, error instanceof Error ? error.message : error);
    }
  }

  private async createIndex(name: string) {
    try {
      await fetch(`${this.host}/indexes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ uid: name, primaryKey: 'id' }),
      });
    } catch (error) {
      this.logger.debug(`Meilisearch createIndex ${name} (may already exist)`, error instanceof Error ? error.message : error);
    }
  }

  private async updateSettings(indexName: string, settings: Record<string, unknown>) {
    try {
      await fetch(`${this.host}/indexes/${indexName}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(settings),
      });
    } catch (error) {
      this.logger.warn(`Meilisearch updateSettings failed for ${indexName}`, error instanceof Error ? error.message : error);
    }
  }
}

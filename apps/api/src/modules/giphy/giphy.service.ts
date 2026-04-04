import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GIPHY_BASE = 'https://api.giphy.com/v1';

export interface GiphySearchParams {
  q?: string;
  limit?: number;
  offset?: number;
  rating?: string;
}

export interface GiphyProxyResult {
  data: unknown[];
  pagination: { total_count: number; count: number; offset: number };
  meta: { status: number; msg: string; response_id: string };
}

@Injectable()
export class GiphyService {
  private readonly logger = new Logger(GiphyService.name);
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GIPHY_API_KEY', '');
    if (!this.apiKey) {
      this.logger.warn('GIPHY_API_KEY is not set — GIPHY proxy will return empty results');
    }
  }

  async search(params: GiphySearchParams): Promise<GiphyProxyResult> {
    if (!this.apiKey) {
      return this.emptyResult();
    }

    const { q, limit = 25, offset = 0, rating = 'pg-13' } = params;
    const clampedLimit = Math.min(Math.max(1, limit), 50);
    const clampedOffset = Math.max(0, offset);
    const sanitizedRating = this.sanitizeRating(rating);

    const url = `${GIPHY_BASE}/gifs/search?api_key=${this.apiKey}&q=${encodeURIComponent(q || '')}&limit=${clampedLimit}&offset=${clampedOffset}&rating=${sanitizedRating}`;

    return this.fetchGiphy(url);
  }

  async trending(params: GiphySearchParams): Promise<GiphyProxyResult> {
    if (!this.apiKey) {
      return this.emptyResult();
    }

    const { limit = 25, offset = 0, rating = 'pg-13' } = params;
    const clampedLimit = Math.min(Math.max(1, limit), 50);
    const clampedOffset = Math.max(0, offset);
    const sanitizedRating = this.sanitizeRating(rating);

    const url = `${GIPHY_BASE}/gifs/trending?api_key=${this.apiKey}&limit=${clampedLimit}&offset=${clampedOffset}&rating=${sanitizedRating}`;

    return this.fetchGiphy(url);
  }

  private async fetchGiphy(url: string): Promise<GiphyProxyResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        this.logger.error(`GIPHY API returned ${res.status}: ${res.statusText}`);
        return this.emptyResult();
      }
      const json = await res.json() as GiphyProxyResult;
      return json;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.logger.error('GIPHY API request timed out');
      } else {
        this.logger.error('GIPHY API request failed', err instanceof Error ? err.message : String(err));
      }
      return this.emptyResult();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sanitizeRating(rating: string): string {
    const allowed = ['g', 'pg', 'pg-13', 'r'];
    return allowed.includes(rating) ? rating : 'pg-13';
  }

  private emptyResult(): GiphyProxyResult {
    return {
      data: [],
      pagination: { total_count: 0, count: 0, offset: 0 },
      meta: { status: 200, msg: 'OK', response_id: '' },
    };
  }
}

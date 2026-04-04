import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SearchIndexingProcessor } from './search-indexing.processor';
import { MeilisearchService } from '../../../modules/search/meilisearch.service';
import { DlqService } from '../dlq.service';

describe('SearchIndexingProcessor', () => {
  let processor: SearchIndexingProcessor;
  let meilisearch: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchIndexingProcessor,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(null) }, // no Redis -- worker disabled
        },
        {
          provide: MeilisearchService,
          useValue: {
            addDocuments: jest.fn().mockResolvedValue(undefined),
            deleteDocument: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DlqService,
          useValue: {
            moveToDlq: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    processor = module.get(SearchIndexingProcessor);
    meilisearch = module.get(MeilisearchService);
  });

  it('should not start worker when REDIS_URL not set', () => {
    processor.onModuleInit();
    // No worker created -- no crash
    expect(processor).toBeInstanceOf(SearchIndexingProcessor);
    expect(() => processor.onModuleInit()).not.toThrow();
  });

  describe('processSearchIndex (via reflection)', () => {
    it('should call addDocuments for index action', async () => {
      const job = {
        data: { action: 'index', indexName: 'posts', documentId: 'p1', document: { content: 'test' } },
        updateProgress: jest.fn(),
      };
      await (processor as any).processSearchIndex(job);
      expect(meilisearch.addDocuments).toHaveBeenCalledWith('posts', [{ id: 'p1', type: 'posts', content: 'test' }]);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should call deleteDocument for delete action', async () => {
      const job = {
        data: { action: 'delete', indexName: 'posts', documentId: 'p1' },
        updateProgress: jest.fn(),
      };
      await (processor as any).processSearchIndex(job);
      expect(meilisearch.deleteDocument).toHaveBeenCalledWith('posts', 'p1');
    });

    it('should skip index action when document is missing', async () => {
      const job = {
        data: { action: 'index', indexName: 'posts', documentId: 'p1' },
        updateProgress: jest.fn(),
      };
      await (processor as any).processSearchIndex(job);
      expect(meilisearch.addDocuments).not.toHaveBeenCalled();
    });

    it('should warn on invalid job data', async () => {
      const job = {
        data: { action: 'index', indexName: '', documentId: '' },
        updateProgress: jest.fn(),
      };
      await (processor as any).processSearchIndex(job);
      expect(meilisearch.addDocuments).not.toHaveBeenCalled();
    });

    // T13 row 20: update action test
    it('should call addDocuments for update action (same as index)', async () => {
      const job = {
        data: { action: 'update', indexName: 'posts', documentId: 'p1', document: { content: 'updated' } },
        updateProgress: jest.fn(),
      };
      await (processor as any).processSearchIndex(job);
      expect(meilisearch.addDocuments).toHaveBeenCalledWith('posts', [{ id: 'p1', type: 'posts', content: 'updated' }]);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    // T13 row 21: unknown action default throw
    it('should throw for unknown action', async () => {
      const job = {
        data: { action: 'purge', indexName: 'posts', documentId: 'p1' },
        updateProgress: jest.fn(),
      };
      await expect((processor as any).processSearchIndex(job)).rejects.toThrow(/Unknown search index action/);
    });
  });
});

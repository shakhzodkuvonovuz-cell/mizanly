import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SearchIndexingProcessor } from './search-indexing.processor';
import { MeilisearchService } from '../../../modules/search/meilisearch.service';

describe('SearchIndexingProcessor', () => {
  let processor: SearchIndexingProcessor;
  let meilisearch: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchIndexingProcessor,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(null) }, // no Redis — worker disabled
        },
        {
          provide: MeilisearchService,
          useValue: {
            addDocuments: jest.fn().mockResolvedValue(undefined),
            deleteDocument: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    processor = module.get(SearchIndexingProcessor);
    meilisearch = module.get(MeilisearchService);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should not start worker when REDIS_URL not set', () => {
    processor.onModuleInit();
    // No worker created — no crash
    expect(processor).toBeDefined();
  });

  describe('processSearchIndex (via reflection)', () => {
    it('should call addDocuments for index action', async () => {
      const job = {
        data: { action: 'index', indexName: 'posts', documentId: 'p1', document: { content: 'test' } },
        updateProgress: jest.fn(),
      };
      await (processor as any).processSearchIndex(job);
      expect(meilisearch.addDocuments).toHaveBeenCalledWith('posts', [{ id: 'p1', content: 'test' }]);
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
  });
});

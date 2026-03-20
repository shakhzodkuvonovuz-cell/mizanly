import { Test, TestingModule } from '@nestjs/testing';
import { DownloadsController } from './downloads.controller';
import { DownloadsService } from './downloads.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('DownloadsController', () => {
  let controller: DownloadsController;
  let service: jest.Mocked<DownloadsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DownloadsController],
      providers: [
        ...globalMockProviders,
        {
          provide: DownloadsService,
          useValue: {
            requestDownload: jest.fn(),
            getDownloads: jest.fn(),
            getStorageUsed: jest.fn(),
            getDownloadUrl: jest.fn(),
            updateProgress: jest.fn(),
            deleteDownload: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(DownloadsController);
    service = module.get(DownloadsService) as jest.Mocked<DownloadsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('requestDownload', () => {
    it('should call service.requestDownload with userId and dto', async () => {
      const dto = { contentType: 'video', contentId: 'vid-1' };
      service.requestDownload.mockResolvedValue({ id: 'dl-1', status: 'QUEUED' } as any);

      const result = await controller.requestDownload(userId, dto as any);

      expect(service.requestDownload).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ status: 'QUEUED' }));
    });
  });

  describe('getDownloads', () => {
    it('should call service.getDownloads with all params', async () => {
      service.getDownloads.mockResolvedValue({ data: [] } as any);

      await controller.getDownloads(userId, 'COMPLETED', 'cursor-1', 10);

      expect(service.getDownloads).toHaveBeenCalledWith(userId, 'COMPLETED', 'cursor-1', 10);
    });
  });

  describe('getStorage', () => {
    it('should call service.getStorageUsed with userId', async () => {
      service.getStorageUsed.mockResolvedValue({ usedMB: 500, limitMB: 2048 } as any);

      const result = await controller.getStorage(userId);

      expect(service.getStorageUsed).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ usedMB: 500 }));
    });
  });

  describe('getDownloadUrl', () => {
    it('should call service.getDownloadUrl with userId and id', async () => {
      service.getDownloadUrl.mockResolvedValue({ url: 'https://cdn.url/file' } as any);

      const result = await controller.getDownloadUrl(userId, 'dl-1');

      expect(service.getDownloadUrl).toHaveBeenCalledWith(userId, 'dl-1');
      expect(result).toEqual(expect.objectContaining({ url: expect.any(String) }));
    });
  });

  describe('updateProgress', () => {
    it('should call service.updateProgress with userId, id, progress, fileSize', async () => {
      service.updateProgress.mockResolvedValue({ progress: 50 } as any);

      await controller.updateProgress(userId, 'dl-1', { progress: 50, fileSize: 1024 } as any);

      expect(service.updateProgress).toHaveBeenCalledWith(userId, 'dl-1', 50, 1024);
    });
  });

  describe('deleteDownload', () => {
    it('should call service.deleteDownload with userId and id', async () => {
      service.deleteDownload.mockResolvedValue(undefined as any);

      await controller.deleteDownload(userId, 'dl-1');

      expect(service.deleteDownload).toHaveBeenCalledWith(userId, 'dl-1');
    });
  });
});

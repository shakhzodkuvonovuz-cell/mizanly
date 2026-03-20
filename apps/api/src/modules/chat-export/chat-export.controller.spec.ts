import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ChatExportController } from './chat-export.controller';
import { ChatExportService } from './chat-export.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ChatExportController', () => {
  let controller: ChatExportController;
  let service: jest.Mocked<ChatExportService>;

  const userId = 'user-123';
  const convId = 'conv-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatExportController],
      providers: [
        ...globalMockProviders,
        {
          provide: ChatExportService,
          useValue: {
            generateExport: jest.fn(),
            getConversationStats: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ChatExportController);
    service = module.get(ChatExportService) as jest.Mocked<ChatExportService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateExport', () => {
    it('should call chatExportService.generateExport with correct params', async () => {
      const mockExport = { id: 'export-1', url: 'https://export.url/file.json' };
      service.generateExport.mockResolvedValue(mockExport as any);

      const result = await controller.generateExport(convId, userId, { format: 'json', includeMedia: true });

      expect(service.generateExport).toHaveBeenCalledWith(convId, userId, 'json', true);
      expect(result).toEqual(expect.objectContaining({ id: 'export-1' }));
    });

    it('should default includeMedia to false when not provided', async () => {
      service.generateExport.mockResolvedValue({} as any);

      await controller.generateExport(convId, userId, { format: 'text' } as any);

      expect(service.generateExport).toHaveBeenCalledWith(convId, userId, 'text', false);
    });

    it('should throw BadRequestException for invalid format', () => {
      expect(
        () => controller.generateExport(convId, userId, { format: 'csv', includeMedia: false } as any),
      ).toThrow(BadRequestException);
    });
  });

  describe('getConversationStats', () => {
    it('should call chatExportService.getConversationStats with convId and userId', async () => {
      const mockStats = { totalMessages: 150, mediaCount: 20, participants: 2 };
      service.getConversationStats.mockResolvedValue(mockStats as any);

      const result = await controller.getConversationStats(convId, userId);

      expect(service.getConversationStats).toHaveBeenCalledWith(convId, userId);
      expect(result).toEqual(mockStats);
    });
  });
});

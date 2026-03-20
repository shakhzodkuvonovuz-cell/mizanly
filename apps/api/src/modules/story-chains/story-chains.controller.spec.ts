import { Test, TestingModule } from '@nestjs/testing';
import { StoryChainsController } from './story-chains.controller';
import { StoryChainsService } from './story-chains.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StoryChainsController', () => {
  let controller: StoryChainsController;
  let service: jest.Mocked<StoryChainsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StoryChainsController],
      providers: [
        ...globalMockProviders,
        {
          provide: StoryChainsService,
          useValue: {
            createChain: jest.fn(),
            getTrending: jest.fn(),
            getChain: jest.fn(),
            joinChain: jest.fn(),
            getStats: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(StoryChainsController);
    service = module.get(StoryChainsService) as jest.Mocked<StoryChainsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('createChain', () => {
    it('should call storyChainsService.createChain with userId and body', async () => {
      const body = { prompt: 'Your morning routine', coverUrl: 'img.jpg' };
      service.createChain.mockResolvedValue({ id: 'chain-1' } as any);

      const result = await controller.createChain(userId, body);

      expect(service.createChain).toHaveBeenCalledWith(userId, body);
      expect(result).toEqual(expect.objectContaining({ id: 'chain-1' }));
    });
  });

  describe('getTrending', () => {
    it('should call storyChainsService.getTrending with cursor', async () => {
      service.getTrending.mockResolvedValue({ data: [] } as any);

      await controller.getTrending('cursor-1');

      expect(service.getTrending).toHaveBeenCalledWith('cursor-1');
    });
  });

  describe('getChain', () => {
    it('should call storyChainsService.getChain with chainId and cursor', async () => {
      service.getChain.mockResolvedValue({ id: 'chain-1', entries: [] } as any);

      await controller.getChain('chain-1', 'cursor-1');

      expect(service.getChain).toHaveBeenCalledWith('chain-1', 'cursor-1');
    });
  });

  describe('joinChain', () => {
    it('should call storyChainsService.joinChain with chainId, userId, and storyId', async () => {
      service.joinChain.mockResolvedValue({ joined: true } as any);

      await controller.joinChain('chain-1', userId, { storyId: 'story-1' });

      expect(service.joinChain).toHaveBeenCalledWith('chain-1', userId, 'story-1');
    });
  });

  describe('getStats', () => {
    it('should call storyChainsService.getStats with chainId', async () => {
      service.getStats.mockResolvedValue({ participants: 50, entries: 120 } as any);

      await controller.getStats('chain-1');

      expect(service.getStats).toHaveBeenCalledWith('chain-1');
    });
  });
});

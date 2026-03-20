import { Test, TestingModule } from '@nestjs/testing';
import { ReelTemplatesController } from './reel-templates.controller';
import { ReelTemplatesService } from './reel-templates.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ReelTemplatesController', () => {
  let controller: ReelTemplatesController;
  let service: jest.Mocked<ReelTemplatesService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReelTemplatesController],
      providers: [
        ...globalMockProviders,
        {
          provide: ReelTemplatesService,
          useValue: {
            browse: jest.fn(),
            getById: jest.fn(),
            create: jest.fn(),
            markUsed: jest.fn(),
            delete: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ReelTemplatesController);
    service = module.get(ReelTemplatesService) as jest.Mocked<ReelTemplatesService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('browse', () => {
    it('should call reelTemplatesService.browse with cursor, limit 20, and trending flag', async () => {
      service.browse.mockResolvedValue({ data: [] } as any);

      await controller.browse('cursor-1', 'true');

      expect(service.browse).toHaveBeenCalledWith('cursor-1', 20, true);
    });

    it('should default trending to false when not "true"', async () => {
      service.browse.mockResolvedValue({ data: [] } as any);

      await controller.browse(undefined, undefined);

      expect(service.browse).toHaveBeenCalledWith(undefined, 20, false);
    });
  });

  describe('getById', () => {
    it('should call reelTemplatesService.getById with id', async () => {
      service.getById.mockResolvedValue({ id: 'tmpl-1', name: 'Dance' } as any);

      const result = await controller.getById('tmpl-1');

      expect(service.getById).toHaveBeenCalledWith('tmpl-1');
      expect(result).toEqual(expect.objectContaining({ name: 'Dance' }));
    });
  });

  describe('create', () => {
    it('should call reelTemplatesService.create with userId and body', async () => {
      const body = { sourceReelId: 'reel-1', segments: [{ startMs: 0, endMs: 5000 }], name: 'My Template' };
      service.create.mockResolvedValue({ id: 'tmpl-1' } as any);

      await controller.create(userId, body as any);

      expect(service.create).toHaveBeenCalledWith(userId, body);
    });
  });

  describe('markUsed', () => {
    it('should call reelTemplatesService.markUsed with id and userId', async () => {
      service.markUsed.mockResolvedValue({ used: true } as any);

      await controller.markUsed('tmpl-1', userId);

      expect(service.markUsed).toHaveBeenCalledWith('tmpl-1', userId);
    });
  });

  describe('delete', () => {
    it('should call reelTemplatesService.delete with id and userId', async () => {
      service.delete.mockResolvedValue({ deleted: true } as any);

      await controller.delete('tmpl-1', userId);

      expect(service.delete).toHaveBeenCalledWith('tmpl-1', userId);
    });
  });
});

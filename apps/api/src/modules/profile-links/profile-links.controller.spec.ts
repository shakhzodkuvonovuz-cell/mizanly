import { Test, TestingModule } from '@nestjs/testing';
import { ProfileLinksController } from './profile-links.controller';
import { ProfileLinksService } from './profile-links.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ProfileLinksController', () => {
  let controller: ProfileLinksController;
  let service: jest.Mocked<ProfileLinksService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileLinksController],
      providers: [
        ...globalMockProviders,
        {
          provide: ProfileLinksService,
          useValue: {
            getLinks: jest.fn(),
            addLink: jest.fn(),
            updateLink: jest.fn(),
            deleteLink: jest.fn(),
            reorder: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ProfileLinksController);
    service = module.get(ProfileLinksService) as jest.Mocked<ProfileLinksService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getLinks', () => {
    it('should call profileLinksService.getLinks with userId', async () => {
      service.getLinks.mockResolvedValue([{ id: 'link-1', title: 'GitHub' }] as any);

      const result = await controller.getLinks(userId);

      expect(service.getLinks).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('addLink', () => {
    it('should call profileLinksService.addLink with userId and dto', async () => {
      const dto = { title: 'GitHub', url: 'https://github.com/user' };
      service.addLink.mockResolvedValue({ id: 'link-1', ...dto } as any);

      const result = await controller.addLink(userId, dto as any);

      expect(service.addLink).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ title: 'GitHub' }));
    });
  });

  describe('updateLink', () => {
    it('should call profileLinksService.updateLink with userId, id, and dto', async () => {
      const dto = { title: 'Updated Link' };
      service.updateLink.mockResolvedValue({ id: 'link-1', title: 'Updated Link' } as any);

      await controller.updateLink(userId, 'link-1', dto as any);

      expect(service.updateLink).toHaveBeenCalledWith(userId, 'link-1', dto);
    });
  });

  describe('deleteLink', () => {
    it('should call profileLinksService.deleteLink with userId and id', async () => {
      service.deleteLink.mockResolvedValue({ deleted: true } as any);

      await controller.deleteLink(userId, 'link-1');

      expect(service.deleteLink).toHaveBeenCalledWith(userId, 'link-1');
    });
  });

  describe('reorder', () => {
    it('should call profileLinksService.reorder with userId and ordered ids', async () => {
      service.reorder.mockResolvedValue({ reordered: true } as any);

      await controller.reorder(userId, { ids: ['link-2', 'link-1', 'link-3'] } as any);

      expect(service.reorder).toHaveBeenCalledWith(userId, ['link-2', 'link-1', 'link-3']);
    });
  });
});

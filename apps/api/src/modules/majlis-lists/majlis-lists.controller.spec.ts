import { Test, TestingModule } from '@nestjs/testing';
import { MajlisListsController } from './majlis-lists.controller';
import { MajlisListsService } from './majlis-lists.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MajlisListsController', () => {
  let controller: MajlisListsController;
  let service: jest.Mocked<MajlisListsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MajlisListsController],
      providers: [
        ...globalMockProviders,
        {
          provide: MajlisListsService,
          useValue: {
            getLists: jest.fn(),
            createList: jest.fn(),
            getListById: jest.fn(),
            updateList: jest.fn(),
            deleteList: jest.fn(),
            getMembers: jest.fn(),
            addMember: jest.fn(),
            removeMember: jest.fn(),
            getTimeline: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(MajlisListsController);
    service = module.get(MajlisListsService) as jest.Mocked<MajlisListsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getLists', () => {
    it('should call service.getLists with userId and cursor', async () => {
      service.getLists.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);

      await controller.getLists(userId, 'cursor-1');

      expect(service.getLists).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });

  describe('createList', () => {
    it('should call service.createList with userId and dto', async () => {
      const dto = { name: 'My List', description: 'Test list' };
      service.createList.mockResolvedValue({ id: 'list-1', ...dto } as any);

      const result = await controller.createList(userId, dto as any);

      expect(service.createList).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'list-1' }));
    });
  });

  describe('getListById', () => {
    it('should call service.getListById with userId and id', async () => {
      service.getListById.mockResolvedValue({ id: 'list-1', name: 'My List' } as any);

      const result = await controller.getListById(userId, 'list-1');

      expect(service.getListById).toHaveBeenCalledWith(userId, 'list-1');
      expect(result).toEqual(expect.objectContaining({ id: 'list-1' }));
    });
  });

  describe('updateList', () => {
    it('should call service.updateList with userId, id, and dto', async () => {
      const dto = { name: 'Updated List' };
      service.updateList.mockResolvedValue({ id: 'list-1', name: 'Updated List' } as any);

      await controller.updateList(userId, 'list-1', dto as any);

      expect(service.updateList).toHaveBeenCalledWith(userId, 'list-1', dto);
    });
  });

  describe('deleteList', () => {
    it('should call service.deleteList with userId and id', async () => {
      service.deleteList.mockResolvedValue(undefined as any);

      await controller.deleteList(userId, 'list-1');

      expect(service.deleteList).toHaveBeenCalledWith(userId, 'list-1');
    });
  });

  describe('addMember', () => {
    it('should call service.addMember with userId, listId, and dto', async () => {
      const dto = { userId: 'user-456' };
      service.addMember.mockResolvedValue({ added: true } as any);

      await controller.addMember(userId, 'list-1', dto as any);

      expect(service.addMember).toHaveBeenCalledWith(userId, 'list-1', dto);
    });
  });

  describe('removeMember', () => {
    it('should call service.removeMember with userId, listId, and memberUserId', async () => {
      service.removeMember.mockResolvedValue(undefined as any);

      await controller.removeMember(userId, 'list-1', 'user-456');

      expect(service.removeMember).toHaveBeenCalledWith(userId, 'list-1', 'user-456');
    });
  });

  describe('getTimeline', () => {
    it('should call service.getTimeline with userId, listId, and cursor', async () => {
      service.getTimeline.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);

      await controller.getTimeline(userId, 'list-1', 'cursor-1');

      expect(service.getTimeline).toHaveBeenCalledWith(userId, 'list-1', 'cursor-1');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommunitiesController } from './communities.controller';
import { CommunitiesService } from './communities.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CommunitiesController', () => {
  let controller: CommunitiesController;
  let service: jest.Mocked<CommunitiesService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunitiesController],
      providers: [
        ...globalMockProviders,
        {
          provide: CommunitiesService,
          useValue: {
            create: jest.fn(),
            list: jest.fn(),
            getById: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            join: jest.fn(),
            leave: jest.fn(),
            listMembers: jest.fn(),
            createRole: jest.fn(),
            updateRole: jest.fn(),
            deleteRole: jest.fn(),
            listRoles: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(CommunitiesController);
    service = module.get(CommunitiesService) as jest.Mocked<CommunitiesService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should call communitiesService.create with userId and dto', async () => {
      const dto = { name: 'Quran Study Group', description: 'Weekly study' };
      service.create.mockResolvedValue({ id: 'comm-1', ...dto } as any);

      const result = await controller.create(userId, dto as any);

      expect(service.create).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ name: 'Quran Study Group' }));
    });
  });

  describe('list', () => {
    it('should call communitiesService.list with viewerId, cursor, and limit', async () => {
      service.list.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);

      await controller.list(userId, 'cursor-1', 10);

      expect(service.list).toHaveBeenCalledWith(userId, 'cursor-1', 10);
    });
  });

  describe('getById', () => {
    it('should call communitiesService.getById with id and viewerId', async () => {
      service.getById.mockResolvedValue({ id: 'comm-1', name: 'Test' } as any);

      const result = await controller.getById('comm-1', userId);

      expect(service.getById).toHaveBeenCalledWith('comm-1', userId);
      expect(result).toEqual(expect.objectContaining({ id: 'comm-1' }));
    });

    it('should propagate NotFoundException for missing community', async () => {
      service.getById.mockRejectedValue(new NotFoundException('Community not found'));

      await expect(controller.getById('nonexistent', userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should call communitiesService.update with id, userId, and dto', async () => {
      const dto = { name: 'Updated Name' };
      service.update.mockResolvedValue({ id: 'comm-1', name: 'Updated Name' } as any);

      const result = await controller.update('comm-1', userId, dto as any);

      expect(service.update).toHaveBeenCalledWith('comm-1', userId, dto);
      expect(result).toEqual(expect.objectContaining({ name: 'Updated Name' }));
    });
  });

  describe('delete', () => {
    it('should call communitiesService.delete with id and userId', async () => {
      service.delete.mockResolvedValue({ deleted: true } as any);

      const result = await controller.delete('comm-1', userId);

      expect(service.delete).toHaveBeenCalledWith('comm-1', userId);
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('join', () => {
    it('should call communitiesService.join with id and userId', async () => {
      service.join.mockResolvedValue({ joined: true } as any);

      const result = await controller.join('comm-1', userId);

      expect(service.join).toHaveBeenCalledWith('comm-1', userId);
      expect(result).toEqual({ joined: true });
    });
  });

  describe('leave', () => {
    it('should call communitiesService.leave with id and userId', async () => {
      service.leave.mockResolvedValue({ left: true } as any);

      const result = await controller.leave('comm-1', userId);

      expect(service.leave).toHaveBeenCalledWith('comm-1', userId);
      expect(result).toEqual({ left: true });
    });
  });

  describe('listMembers', () => {
    it('should call communitiesService.listMembers with all params', async () => {
      service.listMembers.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);

      await controller.listMembers('comm-1', userId, 'cursor-1', 25);

      expect(service.listMembers).toHaveBeenCalledWith('comm-1', userId, 'cursor-1', 25);
    });
  });

  // ── Role Management ────────────────────────────────

  describe('listRoles', () => {
    it('should call communitiesService.listRoles with communityId', async () => {
      service.listRoles.mockResolvedValue([{ id: 'role-1', name: 'Moderator' }] as any);

      const result = await controller.listRoles('comm-1');

      expect(service.listRoles).toHaveBeenCalledWith('comm-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('createRole', () => {
    it('should call communitiesService.createRole with id, userId, and dto', async () => {
      const dto = { name: 'Moderator', color: '#FF5733', canKick: true };
      service.createRole.mockResolvedValue({ id: 'role-1', ...dto } as any);

      const result = await controller.createRole('comm-1', userId, dto as any);

      expect(service.createRole).toHaveBeenCalledWith('comm-1', userId, dto);
      expect(result).toEqual(expect.objectContaining({ name: 'Moderator' }));
    });
  });

  describe('updateRole', () => {
    it('should call communitiesService.updateRole with roleId, userId, and dto', async () => {
      const dto = { name: 'Senior Mod', canBan: true };
      service.updateRole.mockResolvedValue({ id: 'role-1', ...dto } as any);

      const result = await controller.updateRole('comm-1', 'role-1', userId, dto as any);

      expect(service.updateRole).toHaveBeenCalledWith('role-1', userId, dto);
      expect(result).toEqual(expect.objectContaining({ name: 'Senior Mod' }));
    });
  });

  describe('deleteRole', () => {
    it('should call communitiesService.deleteRole with roleId and userId', async () => {
      service.deleteRole.mockResolvedValue({ id: 'role-1' } as any);

      const result = await controller.deleteRole('comm-1', 'role-1', userId);

      expect(service.deleteRole).toHaveBeenCalledWith('role-1', userId);
      expect(result).toEqual({ id: 'role-1' });
    });
  });
});

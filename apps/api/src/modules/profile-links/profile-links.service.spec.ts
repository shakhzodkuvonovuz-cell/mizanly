import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ProfileLinksService } from './profile-links.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ProfileLinksService', () => {
  let service: ProfileLinksService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ProfileLinksService,
        {
          provide: PrismaService,
          useValue: {
            profileLink: {
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              findFirst: jest.fn(),
              count: jest.fn(),
              findUnique: jest.fn(),
              updateMany: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProfileLinksService>(ProfileLinksService);
    prisma = module.get(PrismaService) as any;
  });

  describe('getLinks', () => {
    it('should return user links ordered by position', async () => {
      const userId = 'user-123';
      const mockLinks = [
        { id: 'link-1', title: 'GitHub', url: 'https://github.com', position: 0 },
        { id: 'link-2', title: 'Twitter', url: 'https://twitter.com', position: 1 },
      ];
      prisma.profileLink.findMany.mockResolvedValue(mockLinks);

      const result = await service.getLinks(userId);

      expect(prisma.profileLink.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId },
        orderBy: { position: 'asc' },
      }));
      expect(result).toEqual(mockLinks);
    });
  });

  describe('addLink', () => {
    it('should create a new link with correct position', async () => {
      const userId = 'user-123';
      const dto = { title: 'GitHub', url: 'https://github.com' };
      prisma.profileLink.count.mockResolvedValue(2);
      prisma.profileLink.findFirst.mockResolvedValue({ position: 1 });
      prisma.profileLink.create.mockResolvedValue({
        id: 'link-3',
        userId,
        ...dto,
        position: 2,
      });

      const result = await service.addLink(userId, dto);

      expect(prisma.profileLink.count).toHaveBeenCalledWith({ where: { userId } });
      expect(prisma.profileLink.findFirst).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { position: 'desc' },
      });
      expect(prisma.profileLink.create).toHaveBeenCalledWith({
        data: { userId, title: dto.title, url: dto.url, position: 2 },
      });
      expect(result.position).toBe(2);
    });

    it('should throw BadRequestException when exceeding MAX_LINKS', async () => {
      const userId = 'user-123';
      const dto = { title: 'GitHub', url: 'https://github.com' };
      prisma.profileLink.count.mockResolvedValue(5);

      await expect(service.addLink(userId, dto)).rejects.toThrow(BadRequestException);
    });

    it('should start at position 0 when no links exist', async () => {
      const userId = 'user-123';
      const dto = { title: 'GitHub', url: 'https://github.com' };
      prisma.profileLink.count.mockResolvedValue(0);
      prisma.profileLink.findFirst.mockResolvedValue(null);
      prisma.profileLink.create.mockResolvedValue({ id: 'link-1', ...dto, position: 0 });

      const result = await service.addLink(userId, dto);

      expect(result.position).toBe(0);
    });
  });

  describe('updateLink', () => {
    it('should update link when user owns it', async () => {
      const userId = 'user-123';
      const linkId = 'link-1';
      const dto = { title: 'Updated Title' };
      const mockLink = { id: linkId, userId, title: 'Old', url: 'https://old.com' };
      prisma.profileLink.findUnique.mockResolvedValue(mockLink);
      prisma.profileLink.update.mockResolvedValue({ ...mockLink, ...dto });

      const result = await service.updateLink(userId, linkId, dto);

      expect(prisma.profileLink.findUnique).toHaveBeenCalledWith({ where: { id: linkId } });
      expect(prisma.profileLink.update).toHaveBeenCalledWith({
        where: { id: linkId },
        data: dto,
      });
      expect(result.title).toBe('Updated Title');
    });

    it('should throw NotFoundException when link not found', async () => {
      const userId = 'user-123';
      const linkId = 'link-1';
      const dto = { title: 'Updated' };
      prisma.profileLink.findUnique.mockResolvedValue(null);

      await expect(service.updateLink(userId, linkId, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when updating another user link', async () => {
      const userId = 'user-123';
      const linkId = 'link-1';
      const dto = { title: 'Updated' };
      const mockLink = { id: linkId, userId: 'other-user', title: 'Old' };
      prisma.profileLink.findUnique.mockResolvedValue(mockLink);

      await expect(service.updateLink(userId, linkId, dto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteLink', () => {
    it('should delete link when user owns it', async () => {
      const userId = 'user-123';
      const linkId = 'link-1';
      const mockLink = { id: linkId, userId };
      prisma.profileLink.findUnique.mockResolvedValue(mockLink);
      prisma.profileLink.delete.mockResolvedValue({});

      const result = await service.deleteLink(userId, linkId);

      expect(prisma.profileLink.findUnique).toHaveBeenCalledWith({ where: { id: linkId } });
      expect(prisma.profileLink.delete).toHaveBeenCalledWith({ where: { id: linkId } });
      expect(result).toEqual({ message: 'Link removed' });
    });

    it('should throw NotFoundException when link not found', async () => {
      const userId = 'user-123';
      const linkId = 'link-1';
      prisma.profileLink.findUnique.mockResolvedValue(null);

      await expect(service.deleteLink(userId, linkId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when deleting another user link', async () => {
      const userId = 'user-123';
      const linkId = 'link-1';
      const mockLink = { id: linkId, userId: 'other-user' };
      prisma.profileLink.findUnique.mockResolvedValue(mockLink);

      await expect(service.deleteLink(userId, linkId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reorder', () => {
    it('should reorder links correctly', async () => {
      const userId = 'user-123';
      const orderedIds = ['link-2', 'link-1', 'link-3'];
      const mockLinks = [
        { id: 'link-1', userId },
        { id: 'link-2', userId },
        { id: 'link-3', userId },
      ];
      prisma.profileLink.findMany.mockResolvedValue(mockLinks);
      prisma.$transaction.mockImplementation(async (ops: any[]) => {
        const results = [];
        for (const op of ops) {
          results.push(await op);
        }
        return results;
      });
      prisma.profileLink.update.mockImplementation(async (args: any) => ({ id: args.where.id, position: args.data.position }));

      await service.reorder(userId, orderedIds);

      expect(prisma.profileLink.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId } }));
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.profileLink.update).toHaveBeenCalledTimes(3);
      // First call should update link-2 to position 0
      expect(prisma.profileLink.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'link-2' },
        data: { position: 0 },
      });
    });

    it('should throw ForbiddenException for non-user link in orderedIds', async () => {
      const userId = 'user-123';
      const orderedIds = ['link-1', 'link-2'];
      const mockLinks = [{ id: 'link-1', userId }]; // link-2 not in user's links
      prisma.profileLink.findMany.mockResolvedValue(mockLinks);

      await expect(service.reorder(userId, orderedIds)).rejects.toThrow(ForbiddenException);
    });
  });
});
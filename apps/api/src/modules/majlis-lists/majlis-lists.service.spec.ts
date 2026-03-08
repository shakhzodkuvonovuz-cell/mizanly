import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { MajlisListsService } from './majlis-lists.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { AddMemberDto } from './dto/add-member.dto';

describe('MajlisListsService', () => {
  let service: MajlisListsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MajlisListsService,
        {
          provide: PrismaService,
          useValue: {
            majlisList: {
              findMany: jest.fn(),
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            majlisListMember: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
            thread: {
              findMany: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MajlisListsService>(MajlisListsService);
    prisma = module.get(PrismaService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getLists', () => {
    it('should return lists where user is owner or member', async () => {
      const userId = 'user-123';
      const mockLists = [
        {
          id: 'list-1',
          name: 'List 1',
          description: 'Desc 1',
          isPrivate: false,
          membersCount: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
          owner: {
            id: 'user-123',
            username: 'owner',
            displayName: 'Owner',
            avatarUrl: null,
            isVerified: false,
          },
        },
      ];
      prisma.majlisList.findMany.mockResolvedValue(mockLists);

      const result = await service.getLists(userId);

      expect(prisma.majlisList.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } },
          ],
        },
        select: expect.any(Object),
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toEqual([
        {
          ...mockLists[0],
          isPublic: true,
        },
      ]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should support cursor pagination', async () => {
      const userId = 'user-123';
      const cursor = 'list-1';
      prisma.majlisList.findMany.mockResolvedValue([]);

      await service.getLists(userId, cursor, 10);

      expect(prisma.majlisList.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        select: expect.any(Object),
        take: 11,
        cursor: { id: cursor },
        skip: 1,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('createList', () => {
    it('should create a list with isPublic true by default', async () => {
      const userId = 'user-123';
      const dto: CreateListDto = { name: 'My List', description: 'Desc' };
      const mockList = {
        id: 'list-1',
        name: 'My List',
        description: 'Desc',
        isPrivate: false,
        membersCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: {
          id: userId,
          username: 'user',
          displayName: 'User',
          avatarUrl: null,
          isVerified: false,
        },
      };
      prisma.majlisList.create.mockResolvedValue(mockList);

      const result = await service.createList(userId, dto);

      expect(prisma.majlisList.create).toHaveBeenCalledWith({
        data: {
          name: 'My List',
          description: 'Desc',
          isPrivate: false,
          ownerId: userId,
        },
        select: expect.any(Object),
      });
      expect(result).toEqual({
        ...mockList,
        isPublic: true,
      });
    });

    it('should create a private list when isPublic false', async () => {
      const userId = 'user-123';
      const dto: CreateListDto = { name: 'Private List', isPublic: false };
      const mockList = {
        id: 'list-1',
        name: 'Private List',
        description: null,
        isPrivate: true,
        membersCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: expect.any(Object),
      };
      prisma.majlisList.create.mockResolvedValue(mockList);

      const result = await service.createList(userId, dto);

      expect(prisma.majlisList.create).toHaveBeenCalledWith({
        data: {
          name: 'Private List',
          description: undefined,
          isPrivate: true,
          ownerId: userId,
        },
        select: expect.any(Object),
      });
      expect(result.isPublic).toBe(false);
    });
  });

  describe('getListById', () => {
    it('should return list with members when user is owner', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const mockList = {
        id: listId,
        name: 'List 1',
        description: 'Desc',
        isPrivate: false,
        membersCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: { id: userId, username: 'owner' },
        members: [
          {
            user: {
              id: 'user-456',
              username: 'member1',
              displayName: 'Member One',
              avatarUrl: null,
              isVerified: false,
            },
            addedAt: new Date(),
          },
        ],
      };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);
      prisma.majlisListMember.findFirst.mockResolvedValue(null);

      const result = await service.getListById(userId, listId);

      expect(prisma.majlisList.findUnique).toHaveBeenCalledWith({
        where: { id: listId },
        select: expect.any(Object),
      });
      expect(result.id).toBe(listId);
      expect(result.isPublic).toBe(true);
      expect(result.members).toHaveLength(1);
    });

    it('should throw NotFoundException if list does not exist', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      prisma.majlisList.findUnique.mockResolvedValue(null);

      await expect(service.getListById(userId, listId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for private list when user is not owner nor member', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const mockList = {
        id: listId,
        name: 'Private List',
        isPrivate: true,
        membersCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: { id: 'other-user' },
        members: [],
      };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);
      prisma.majlisListMember.findFirst.mockResolvedValue(null);

      await expect(service.getListById(userId, listId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow access to private list when user is member', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const mockList = {
        id: listId,
        name: 'Private List',
        isPrivate: true,
        membersCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: { id: 'other-user' },
        members: [],
      };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);
      prisma.majlisListMember.findFirst.mockResolvedValue({ listId, userId });

      const result = await service.getListById(userId, listId);

      expect(result.id).toBe(listId);
    });
  });

  describe('updateList', () => {
    it('should update list when user is owner', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const dto: UpdateListDto = { name: 'Updated Name', isPublic: false };
      const mockList = { ownerId: userId };
      const updatedList = {
        id: listId,
        name: 'Updated Name',
        description: null,
        isPrivate: true,
        membersCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: expect.any(Object),
      };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);
      prisma.majlisList.update.mockResolvedValue(updatedList);

      const result = await service.updateList(userId, listId, dto);

      expect(prisma.majlisList.findUnique).toHaveBeenCalledWith({
        where: { id: listId },
        select: { ownerId: true },
      });
      expect(prisma.majlisList.update).toHaveBeenCalledWith({
        where: { id: listId },
        data: { name: 'Updated Name', isPrivate: true },
        select: expect.any(Object),
      });
      expect(result.isPublic).toBe(false);
    });

    it('should throw NotFoundException if list does not exist', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const dto: UpdateListDto = { name: 'Updated' };
      prisma.majlisList.findUnique.mockResolvedValue(null);

      await expect(service.updateList(userId, listId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const dto: UpdateListDto = { name: 'Updated' };
      const mockList = { ownerId: 'other-user' };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);

      await expect(service.updateList(userId, listId, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('deleteList', () => {
    it('should delete list when user is owner', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const mockList = { ownerId: userId };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);
      prisma.majlisList.delete.mockResolvedValue({});

      const result = await service.deleteList(userId, listId);

      expect(prisma.majlisList.findUnique).toHaveBeenCalledWith({
        where: { id: listId },
        select: { ownerId: true },
      });
      expect(prisma.majlisList.delete).toHaveBeenCalledWith({
        where: { id: listId },
      });
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if list does not exist', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      prisma.majlisList.findUnique.mockResolvedValue(null);

      await expect(service.deleteList(userId, listId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const mockList = { ownerId: 'other-user' };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);

      await expect(service.deleteList(userId, listId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getMembers', () => {
    it('should return paginated members of a list', async () => {
      const listId = 'list-1';
      const userId = undefined;
      const mockMembers = [
        {
          user: {
            id: 'user-456',
            username: 'member1',
            displayName: 'Member One',
            avatarUrl: null,
            isVerified: false,
          },
          addedAt: new Date(),
        },
      ];
      prisma.majlisList.findUnique.mockResolvedValue({ id: listId, isPrivate: false, ownerId: 'owner-1' });
      prisma.majlisListMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getMembers(userId, listId);

      expect(prisma.majlisList.findUnique).toHaveBeenCalledWith({
        where: { id: listId },
        select: { isPrivate: true, ownerId: true },
      });
      expect(prisma.majlisListMember.findMany).toHaveBeenCalledWith({
        where: { listId },
        select: expect.any(Object),
        take: 21,
        orderBy: { addedAt: 'desc' },
      });
      expect(result.data).toEqual([
        {
          id: 'user-456',
          username: 'member1',
          displayName: 'Member One',
          avatarUrl: null,
          isVerified: false,
          addedAt: expect.any(Date),
        },
      ]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should throw NotFoundException if list does not exist', async () => {
      const listId = 'list-1';
      const userId = undefined;
      prisma.majlisList.findUnique.mockResolvedValue(null);

      await expect(service.getMembers(userId, listId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for private list when user is not owner nor member', async () => {
      const listId = 'list-1';
      const userId = 'user-123';
      prisma.majlisList.findUnique.mockResolvedValue({ isPrivate: true, ownerId: 'other-owner' });
      prisma.majlisListMember.findFirst.mockResolvedValue(null);

      await expect(service.getMembers(userId, listId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('addMember', () => {
    it('should add member when user is list owner', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const dto: AddMemberDto = { userId: 'user-456' };
      const mockList = { ownerId: userId, isPrivate: false };
      const mockTargetUser = { id: 'user-456' };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);
      prisma.user.findUnique.mockResolvedValue(mockTargetUser);
      prisma.majlisListMember.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.addMember(userId, listId, dto);

      expect(prisma.majlisList.findUnique).toHaveBeenCalledWith({
        where: { id: listId },
        select: { ownerId: true, isPrivate: true },
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-456' },
        select: { id: true },
      });
      expect(prisma.majlisListMember.findUnique).toHaveBeenCalledWith({
        where: { listId_userId: { listId, userId: 'user-456' } },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if list does not exist', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const dto: AddMemberDto = { userId: 'user-456' };
      prisma.majlisList.findUnique.mockResolvedValue(null);

      await expect(service.addMember(userId, listId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const dto: AddMemberDto = { userId: 'user-456' };
      const mockList = { ownerId: 'other-user', isPrivate: false };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);

      await expect(service.addMember(userId, listId, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if target user does not exist', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const dto: AddMemberDto = { userId: 'user-456' };
      const mockList = { ownerId: userId, isPrivate: false };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.addMember(userId, listId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if user already a member', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const dto: AddMemberDto = { userId: 'user-456' };
      const mockList = { ownerId: userId, isPrivate: false };
      const mockTargetUser = { id: 'user-456' };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);
      prisma.user.findUnique.mockResolvedValue(mockTargetUser);
      prisma.majlisListMember.findUnique.mockResolvedValue({ listId, userId: 'user-456' });

      await expect(service.addMember(userId, listId, dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('removeMember', () => {
    it('should remove member when user is list owner', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const memberUserId = 'user-456';
      const mockList = { ownerId: userId };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);
      prisma.majlisListMember.findUnique.mockResolvedValue({ listId, userId: memberUserId });
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.removeMember(userId, listId, memberUserId);

      expect(prisma.majlisList.findUnique).toHaveBeenCalledWith({
        where: { id: listId },
        select: { ownerId: true },
      });
      expect(prisma.majlisListMember.findUnique).toHaveBeenCalledWith({
        where: { listId_userId: { listId, userId: memberUserId } },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if list does not exist', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const memberUserId = 'user-456';
      prisma.majlisList.findUnique.mockResolvedValue(null);

      await expect(service.removeMember(userId, listId, memberUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const memberUserId = 'user-456';
      const mockList = { ownerId: 'other-user' };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);

      await expect(service.removeMember(userId, listId, memberUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if member not in list', async () => {
      const userId = 'user-123';
      const listId = 'list-1';
      const memberUserId = 'user-456';
      const mockList = { ownerId: userId };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);
      prisma.majlisListMember.findUnique.mockResolvedValue(null);

      await expect(service.removeMember(userId, listId, memberUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getTimeline', () => {
    it('should return threads from list members', async () => {
      const listId = 'list-1';
      const userId = undefined;
      const mockList = {
        isPrivate: false,
        ownerId: 'owner-1',
        members: [{ userId: 'user-456' }, { userId: 'user-789' }],
      };
      const mockThreads = [
        {
          id: 'thread-1',
          content: 'Thread content',
          hashtags: [],
          mentions: [],
          likesCount: 10,
          repliesCount: 2,
          repostsCount: 1,
          quotesCount: 0,
          bookmarksCount: 5,
          viewsCount: 100,
          isSensitive: false,
          createdAt: new Date(),
          user: {
            id: 'user-456',
            username: 'user1',
            displayName: 'User One',
            avatarUrl: null,
            isVerified: false,
          },
        },
      ];
      prisma.majlisList.findUnique.mockResolvedValue(mockList);
      prisma.thread.findMany.mockResolvedValue(mockThreads);

      const result = await service.getTimeline(userId, listId);

      expect(prisma.majlisList.findUnique).toHaveBeenCalledWith({
        where: { id: listId },
        select: { isPrivate: true, ownerId: true, members: { select: { userId: true } } },
      });
      expect(prisma.thread.findMany).toHaveBeenCalledWith({
        where: {
          userId: { in: ['user-456', 'user-789'] },
          isChainHead: true,
          isRemoved: false,
        },
        select: expect.any(Object),
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toEqual(mockThreads);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should throw NotFoundException if list does not exist', async () => {
      const listId = 'list-1';
      const userId = undefined;
      prisma.majlisList.findUnique.mockResolvedValue(null);

      await expect(service.getTimeline(userId, listId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty array if list has no members', async () => {
      const listId = 'list-1';
      const userId = undefined;
      const mockList = {
        isPrivate: false,
        ownerId: 'owner-1',
        members: [],
      };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);

      const result = await service.getTimeline(userId, listId);

      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should throw ForbiddenException for private list when user is not owner nor member', async () => {
      const listId = 'list-1';
      const userId = 'user-123';
      const mockList = {
        isPrivate: true,
        ownerId: 'other-owner',
        members: [{ userId: 'user-456' }],
      };
      prisma.majlisList.findUnique.mockResolvedValue(mockList);

      await expect(service.getTimeline(userId, listId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
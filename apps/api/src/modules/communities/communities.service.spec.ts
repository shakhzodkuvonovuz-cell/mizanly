import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CommunitiesService } from './communities.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CommunitiesService', () => {
  let service: CommunitiesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        CommunitiesService,
        {
          provide: PrismaService,
          useValue: {
            circle: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 0 }), delete: jest.fn() },
            circleMember: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
            communityRole: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([]),
            $executeRaw: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();
    service = module.get(CommunitiesService);
    prisma = module.get(PrismaService) as any;
  });

  describe('create', () => {
    it('should create a community', async () => {
      prisma.circle.findUnique.mockResolvedValue(null); // no slug conflict
      prisma.circle.create.mockResolvedValue({ id: 'c1', name: 'Test Community', slug: 'test-community' });
      const result = await service.create('u1', { name: 'Test Community' } as any);
      expect(result.name).toBe('Test Community');
    });

    it('should throw for duplicate slug', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create('u1', { name: 'Test' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('list', () => {
    it('should return public communities for guests', async () => {
      prisma.circle.findMany.mockResolvedValue([{ id: 'c1', createdAt: new Date() }]);
      const result = await service.list();
      expect(result.data).toHaveLength(1);
    });

    it('should include private communities for members', async () => {
      prisma.circleMember.findMany.mockResolvedValue([{ circleId: 'c2' }]);
      prisma.circle.findMany.mockResolvedValue([{ id: 'c1', createdAt: new Date() }]);
      const result = await service.list('u1');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('should return public community', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c1', privacy: 'PUBLIC', isBanned: false });
      const result = await service.getById('c1');
      expect(result.id).toBe('c1');
    });

    it('should throw NotFoundException for missing/banned', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for private non-member', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c1', privacy: 'PRIVATE', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue(null);
      await expect(service.getById('c1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update community as owner', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'u1', isBanned: false });
      prisma.circle.update.mockResolvedValue({ id: 'c1', name: 'Updated' });
      const result = await service.update('c1', 'u1', { name: 'Updated' } as any);
      expect(result.name).toBe('Updated');
    });

    it('should throw ForbiddenException for non-owner/non-admin', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'other', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue(null);
      await expect(service.update('c1', 'u1', {} as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should delete community as owner', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'u1', isBanned: false });
      prisma.circle.delete.mockResolvedValue({});
      const result = await service.delete('c1', 'u1');
      expect(result).toBeNull();
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'other' });
      await expect(service.delete('c1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('join', () => {
    it('should join public community', async () => {
      prisma.circle.findUnique.mockResolvedValue({ privacy: 'PUBLIC', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue(null);
      const result = await service.join('c1', 'u1');
      expect(result).toBeNull();
    });

    it('should throw ConflictException if already member', async () => {
      prisma.circle.findUnique.mockResolvedValue({ privacy: 'PUBLIC', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue({ userId: 'u1' });
      await expect(service.join('c1', 'u1')).rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException for invite-only', async () => {
      prisma.circle.findUnique.mockResolvedValue({ privacy: 'INVITE_ONLY', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue(null);
      await expect(service.join('c1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('leave', () => {
    it('should leave community', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'other', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue({ userId: 'u1' });
      const result = await service.leave('c1', 'u1');
      expect(result).toBeNull();
    });

    it('should throw BadRequestException for owner leaving', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'u1', isBanned: false });
      await expect(service.leave('c1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when non-member tries to leave', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'other', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue(null);
      await expect(service.leave('c1', 'u1')).rejects.toThrow(ConflictException);
    });
  });

  // ── W7-T1: join() PRIVATE privacy (T04 #21, M severity) ──
  describe('join — PRIVATE privacy', () => {
    it('should throw ForbiddenException for PRIVATE community', async () => {
      prisma.circle.findUnique.mockResolvedValue({ privacy: 'PRIVATE', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue(null);
      await expect(service.join('c1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── W7-T1: create() P2002 race condition (T04 #20, M severity) ──
  describe('create — P2002 race condition', () => {
    it('should throw ConflictException when P2002 duplicate slug on create', async () => {
      prisma.circle.findUnique.mockResolvedValue(null); // no slug conflict in initial check
      const p2002Error = { code: 'P2002', message: 'Unique constraint' };
      Object.setPrototypeOf(p2002Error, new Error());
      prisma.circle.create.mockRejectedValue(p2002Error);
      await expect(service.create('u1', { name: 'Test' } as any)).rejects.toThrow(ConflictException);
    });
  });

  // ── W7-T1: update() admin/moderator path (T04 #24, M severity) ──
  describe('update — admin/moderator permission', () => {
    it('should allow ADMIN to update community', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'other', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.circle.update.mockResolvedValue({ id: 'c1', name: 'Updated' });
      const result = await service.update('c1', 'admin-user', { name: 'Updated' } as any);
      expect(result.name).toBe('Updated');
    });

    it('should allow MODERATOR to update community', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'other', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'MODERATOR' });
      prisma.circle.update.mockResolvedValue({ id: 'c1', description: 'New desc' });
      const result = await service.update('c1', 'mod-user', { description: 'New desc' } as any);
      expect(result).toBeDefined();
    });
  });

  // ── W7-T1: listMembers() privacy check (T04 #23, M severity) ──
  describe('listMembers', () => {
    it('should throw ForbiddenException for private community non-member', async () => {
      prisma.circle.findUnique.mockResolvedValue({ privacy: 'PRIVATE', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue(null);
      await expect(service.listMembers('c1', 'outsider')).rejects.toThrow(ForbiddenException);
    });

    it('should return members for public community', async () => {
      prisma.circle.findUnique.mockResolvedValue({ privacy: 'PUBLIC', isBanned: false });
      const members = [{ circleId: 'c1', userId: 'u1', role: 'OWNER', joinedAt: new Date() }];
      prisma.circleMember.findMany.mockResolvedValue(members);
      const result = await service.listMembers('c1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should throw NotFoundException for nonexistent community', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);
      await expect(service.listMembers('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── W7-T1: list() cursor pagination (T04 #40, L severity) ──
  describe('list — cursor pagination', () => {
    it('should filter by createdAt < cursor when cursor provided', async () => {
      prisma.circle.findMany.mockResolvedValue([]);
      const cursorDate = '2026-03-01T00:00:00.000Z';
      await service.list(undefined, cursorDate);
      expect(prisma.circle.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { lt: new Date(cursorDate) },
        }),
      }));
    });
  });

  // ── W7-T1: Role Management (T04 #4-8, C severity) ──
  describe('createRole', () => {
    it('should create a role when user is owner', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c1', ownerId: 'u1' });
      prisma.communityRole.count.mockResolvedValue(2);
      prisma.communityRole.create.mockResolvedValue({ id: 'role-1', name: 'Moderator', position: 2 });

      const result = await service.createRole('c1', 'u1', { name: 'Moderator' });
      expect(prisma.communityRole.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ communityId: 'c1', position: 2, name: 'Moderator' }),
      });
      expect(result.name).toBe('Moderator');
    });

    it('should create a role when user is ADMIN', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c1', ownerId: 'other' });
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.communityRole.count.mockResolvedValue(0);
      prisma.communityRole.create.mockResolvedValue({ id: 'role-1', name: 'Helper', position: 0 });

      const result = await service.createRole('c1', 'admin-1', { name: 'Helper' });
      expect(result.name).toBe('Helper');
    });

    it('should throw ForbiddenException for non-admin', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c1', ownerId: 'other' });
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
      await expect(service.createRole('c1', 'member-1', { name: 'Test' })).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for non-member', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c1', ownerId: 'other' });
      prisma.circleMember.findUnique.mockResolvedValue(null);
      await expect(service.createRole('c1', 'outsider', { name: 'Test' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateRole', () => {
    it('should update role with whitelisted fields only', async () => {
      prisma.communityRole.findUnique.mockResolvedValue({ id: 'role-1', communityId: 'c1' });
      prisma.circle.findUnique.mockResolvedValue({ id: 'c1', ownerId: 'u1' });
      prisma.communityRole.update.mockResolvedValue({ id: 'role-1', name: 'Updated', color: '#FF0000' });

      const result = await service.updateRole('role-1', 'u1', { name: 'Updated', color: '#FF0000' });
      expect(prisma.communityRole.update).toHaveBeenCalledWith({
        where: { id: 'role-1' },
        data: expect.objectContaining({ name: 'Updated', color: '#FF0000' }),
      });
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException for nonexistent role', async () => {
      prisma.communityRole.findUnique.mockResolvedValue(null);
      await expect(service.updateRole('missing', 'u1', { name: 'Test' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-admin', async () => {
      prisma.communityRole.findUnique.mockResolvedValue({ id: 'role-1', communityId: 'c1' });
      prisma.circle.findUnique.mockResolvedValue({ id: 'c1', ownerId: 'other' });
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
      await expect(service.updateRole('role-1', 'member-1', { name: 'Test' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteRole', () => {
    it('should delete role when user is admin', async () => {
      prisma.communityRole.findUnique.mockResolvedValue({ id: 'role-1', communityId: 'c1' });
      prisma.circle.findUnique.mockResolvedValue({ id: 'c1', ownerId: 'u1' });
      prisma.communityRole.delete.mockResolvedValue({ id: 'role-1' });

      const result = await service.deleteRole('role-1', 'u1');
      expect(prisma.communityRole.delete).toHaveBeenCalledWith({ where: { id: 'role-1' } });
      expect(result.id).toBe('role-1');
    });

    it('should throw NotFoundException for nonexistent role', async () => {
      prisma.communityRole.findUnique.mockResolvedValue(null);
      await expect(service.deleteRole('missing', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listRoles', () => {
    it('should list roles ordered by position', async () => {
      const roles = [{ id: 'r1', position: 0 }, { id: 'r2', position: 1 }];
      prisma.communityRole.findMany.mockResolvedValue(roles);
      const result = await service.listRoles('c1');
      expect(prisma.communityRole.findMany).toHaveBeenCalledWith({
        where: { communityId: 'c1' },
        orderBy: { position: 'asc' },
        take: 50,
      });
      expect(result).toEqual(roles);
    });
  });
});

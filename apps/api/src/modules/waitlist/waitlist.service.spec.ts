import { Test, TestingModule } from '@nestjs/testing';
import { WaitlistService } from './waitlist.service';
import { PrismaService } from '../../config/prisma.service';
import { EmailService } from '../../common/services/email.service';
import { NotFoundException } from '@nestjs/common';

describe('WaitlistService', () => {
  let service: WaitlistService;

  const mockPrisma = {
    waitlistEntry: {
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };

  const mockEmail = {
    sendRawHtml: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: 'REDIS', useValue: mockRedis },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();

    service = module.get<WaitlistService>(WaitlistService);
  });

  describe('join', () => {
    it('should normalize email to lowercase and trim', async () => {
      const now = new Date();
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ createdAt: now });
      mockPrisma.waitlistEntry.create.mockResolvedValueOnce({
        id: 'e1', email: 'test@example.com', name: null,
        referralCode: 'ref1', referredBy: null, source: null, createdAt: now,
      });
      mockPrisma.waitlistEntry.count.mockResolvedValue(1);

      await service.join({ email: '  TEST@Example.COM  ' });

      expect(mockPrisma.waitlistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'test@example.com' }),
      });
    });

    it('should return same shape for existing user (anti-enumeration)', async () => {
      const existingDate = new Date('2026-01-01');
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce({ id: 'e2', email: 'existing@test.com', referralCode: 'existref', createdAt: existingDate })
        .mockResolvedValueOnce({ createdAt: existingDate });
      mockPrisma.waitlistEntry.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(50);

      const result = await service.join({ email: 'existing@test.com' });

      expect(result.position).toBe(5);
      expect(result.referralCode).toBe('existref');
      expect(result.totalCount).toBe(50);
      expect(mockPrisma.waitlistEntry.create).not.toHaveBeenCalled();
    });

    it('should ignore invalid referral codes silently', async () => {
      const now = new Date();
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(null) // not existing
        .mockResolvedValueOnce(null) // referrer NOT found
        .mockResolvedValueOnce({ createdAt: now });
      mockPrisma.waitlistEntry.create.mockResolvedValueOnce({
        id: 'e3', email: 'new@test.com', name: null,
        referralCode: 'ref3', referredBy: null, source: null, createdAt: now,
      });
      mockPrisma.waitlistEntry.count.mockResolvedValue(10);

      await service.join({ email: 'new@test.com', referralCode: 'invalid' });

      expect(mockPrisma.waitlistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ referredBy: null }),
      });
    });

    it('should invalidate Redis cache after join', async () => {
      const now = new Date();
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ createdAt: now });
      mockPrisma.waitlistEntry.create.mockResolvedValueOnce({
        id: 'e4', email: 'cache@test.com', name: null,
        referralCode: 'ref4', referredBy: null, source: null, createdAt: now,
      });
      mockPrisma.waitlistEntry.count.mockResolvedValue(20);

      await service.join({ email: 'cache@test.com' });

      expect(mockRedis.del).toHaveBeenCalledWith('waitlist:count');
    });

    it('should not crash if Redis del fails', async () => {
      const now = new Date();
      mockRedis.del.mockRejectedValueOnce(new Error('Redis down'));
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ createdAt: now });
      mockPrisma.waitlistEntry.create.mockResolvedValueOnce({
        id: 'e5', email: 'redis@test.com', name: null,
        referralCode: 'ref5', referredBy: null, source: null, createdAt: now,
      });
      mockPrisma.waitlistEntry.count.mockResolvedValue(30);

      const result = await service.join({ email: 'redis@test.com' });

      expect(result.position).toBeDefined();
    });

    it('should trim name when provided', async () => {
      const now = new Date();
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ createdAt: now });
      mockPrisma.waitlistEntry.create.mockResolvedValueOnce({
        id: 'e6', email: 'named@test.com', name: 'Ahmad',
        referralCode: 'ref6', referredBy: null, source: null, createdAt: now,
      });
      mockPrisma.waitlistEntry.count.mockResolvedValue(40);

      await service.join({ email: 'named@test.com', name: '  Ahmad  ' });

      expect(mockPrisma.waitlistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Ahmad' }),
      });
    });

    it('should send confirmation email after successful join', async () => {
      const now = new Date();
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ createdAt: now });
      mockPrisma.waitlistEntry.create.mockResolvedValueOnce({
        id: 'e7', email: 'emailtest@test.com', name: 'Fatima',
        referralCode: 'emailref', referredBy: null, source: null, createdAt: now,
      });
      mockPrisma.waitlistEntry.count.mockResolvedValue(25);

      await service.join({ email: 'emailtest@test.com', name: 'Fatima' });

      // Wait for fire-and-forget email
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockEmail.sendRawHtml).toHaveBeenCalledWith(
        'emailtest@test.com',
        expect.stringContaining('#25'),
        expect.stringContaining('Fatima'),
      );
    });
  });

  describe('getStats', () => {
    it('should use Redis cached count when available', async () => {
      mockRedis.get.mockResolvedValueOnce('500');

      const result = await service.getStats();

      expect(result.totalCount).toBe(500);
      expect(mockPrisma.waitlistEntry.count).not.toHaveBeenCalled();
    });

    it('should query DB and set cache on miss', async () => {
      mockPrisma.waitlistEntry.count.mockResolvedValueOnce(250);

      const result = await service.getStats();

      expect(result.totalCount).toBe(250);
      expect(mockRedis.set).toHaveBeenCalledWith('waitlist:count', '250', 'EX', 60);
    });

    it('should fallback to DB when Redis throws', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis down'));
      mockPrisma.waitlistEntry.count.mockResolvedValueOnce(100);

      const result = await service.getStats();

      expect(result.totalCount).toBe(100);
    });
  });

  describe('getPosition', () => {
    it('should return position and referral count', async () => {
      const entry = { id: 'e8', email: 'pos@test.com', referralCode: 'posref', createdAt: new Date('2026-03-01') };
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce({ createdAt: entry.createdAt });
      mockPrisma.waitlistEntry.count
        .mockResolvedValueOnce(15) // position
        .mockResolvedValueOnce(3) // referral count
        .mockResolvedValueOnce(200); // total

      const result = await service.getPosition('posref');

      expect(result.position).toBe(15);
      expect(result.referralCount).toBe(3);
      expect(result.totalCount).toBe(200);
    });

    it('should throw NotFoundException for invalid referral code', async () => {
      mockPrisma.waitlistEntry.findUnique.mockResolvedValueOnce(null);

      await expect(service.getPosition('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should return 0 position when entry deleted between lookup and count', async () => {
      const entry = { id: 'e9', email: 'deleted@test.com', referralCode: 'delref', createdAt: new Date() };
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(entry) // getPosition finds it
        .mockResolvedValueOnce(null); // getPositionByEmail finds null (deleted between calls)
      mockPrisma.waitlistEntry.count.mockResolvedValue(0);

      const result = await service.getPosition('delref');

      // Position 0 signals the entry was deleted
      expect(result.position).toBe(0);
    });
  });
});

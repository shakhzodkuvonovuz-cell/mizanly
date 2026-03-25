import { Test, TestingModule } from '@nestjs/testing';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';
import { PrismaService } from '../../config/prisma.service';
import { EmailService } from '../../common/services/email.service';
import { NotFoundException } from '@nestjs/common';

describe('WaitlistController', () => {
  let controller: WaitlistController;
  let service: WaitlistService;

  const mockPrisma = {
    waitlistEntry: {
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };

  const mockEmail = {
    sendRawHtml: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: cache miss
    mockRedis.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WaitlistController],
      providers: [
        WaitlistService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: 'REDIS', useValue: mockRedis },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();

    controller = module.get<WaitlistController>(WaitlistController);
    service = module.get<WaitlistService>(WaitlistService);
  });

  describe('POST /waitlist/join', () => {
    it('should join the waitlist with valid email', async () => {
      const now = new Date();
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(null) // check existing → not found
        .mockResolvedValueOnce({ createdAt: now }); // getPositionByEmail → findUnique for createdAt
      mockPrisma.waitlistEntry.create.mockResolvedValueOnce({
        id: 'cl1', email: 'test@example.com', name: null,
        referralCode: 'ref123', referredBy: null, source: null, createdAt: now,
      });
      // count calls: position count, then total count
      mockPrisma.waitlistEntry.count
        .mockResolvedValueOnce(42) // position
        .mockResolvedValueOnce(100); // getCachedCount → DB count

      const result = await controller.join({ email: 'test@example.com' });

      expect(result.alreadyJoined).toBe(false);
      expect(result.position).toBe(42);
      expect(result.referralCode).toBe('ref123');
      expect(result.totalCount).toBe(100);
    });

    it('should normalize email to lowercase and trim', async () => {
      const now = new Date();
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ createdAt: now });
      mockPrisma.waitlistEntry.create.mockResolvedValueOnce({
        id: 'cl2', email: 'test@example.com', name: null,
        referralCode: 'ref456', referredBy: null, source: null, createdAt: now,
      });
      mockPrisma.waitlistEntry.count.mockResolvedValue(1);

      await controller.join({ email: '  TEST@Example.COM  ' });

      expect(mockPrisma.waitlistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'test@example.com' }),
      });
    });

    it('should return existing position if already on waitlist', async () => {
      const existingDate = new Date('2026-01-01');
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce({ id: 'cl3', email: 'existing@example.com', referralCode: 'existref', createdAt: existingDate }) // exists
        .mockResolvedValueOnce({ createdAt: existingDate }); // getPositionByEmail
      mockPrisma.waitlistEntry.count
        .mockResolvedValueOnce(5) // position
        .mockResolvedValueOnce(100); // total

      const result = await controller.join({ email: 'existing@example.com' });

      expect(result.alreadyJoined).toBe(true);
      expect(result.position).toBe(5);
      expect(result.referralCode).toBe('existref');
      expect(mockPrisma.waitlistEntry.create).not.toHaveBeenCalled();
    });

    it('should accept valid referral code', async () => {
      const now = new Date();
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(null) // not existing
        .mockResolvedValueOnce({ id: 'referrer', referralCode: 'validref' }) // referrer exists
        .mockResolvedValueOnce({ createdAt: now }); // getPositionByEmail
      mockPrisma.waitlistEntry.create.mockResolvedValueOnce({
        id: 'cl4', email: 'new@example.com', name: null,
        referralCode: 'newref', referredBy: 'validref', source: null, createdAt: now,
      });
      mockPrisma.waitlistEntry.count.mockResolvedValue(10);

      const result = await controller.join({ email: 'new@example.com', referralCode: 'validref' });

      expect(result.alreadyJoined).toBe(false);
      expect(mockPrisma.waitlistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ referredBy: 'validref' }),
      });
    });

    it('should ignore invalid referral code silently', async () => {
      const now = new Date();
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(null) // not existing
        .mockResolvedValueOnce(null) // referrer NOT found
        .mockResolvedValueOnce({ createdAt: now }); // getPositionByEmail
      mockPrisma.waitlistEntry.create.mockResolvedValueOnce({
        id: 'cl5', email: 'new2@example.com', name: null,
        referralCode: 'ref789', referredBy: null, source: null, createdAt: now,
      });
      mockPrisma.waitlistEntry.count.mockResolvedValue(15);

      const result = await controller.join({ email: 'new2@example.com', referralCode: 'invalidref' });

      expect(result.alreadyJoined).toBe(false);
      expect(mockPrisma.waitlistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ referredBy: null }),
      });
    });

    it('should include name and source when provided', async () => {
      const now = new Date();
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ createdAt: now });
      mockPrisma.waitlistEntry.create.mockResolvedValueOnce({
        id: 'cl6', email: 'named@example.com', name: 'Ahmad',
        referralCode: 'refnamed', referredBy: null, source: 'twitter', createdAt: now,
      });
      mockPrisma.waitlistEntry.count.mockResolvedValue(20);

      await controller.join({ email: 'named@example.com', name: '  Ahmad  ', source: 'twitter' });

      expect(mockPrisma.waitlistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Ahmad', source: 'twitter' }),
      });
    });

    it('should send confirmation email after joining', async () => {
      const now = new Date();
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ createdAt: now });
      mockPrisma.waitlistEntry.create.mockResolvedValueOnce({
        id: 'cl7', email: 'emailtest@example.com', name: 'Fatima',
        referralCode: 'emailref', referredBy: null, source: null, createdAt: now,
      });
      mockPrisma.waitlistEntry.count.mockResolvedValue(25);

      await controller.join({ email: 'emailtest@example.com', name: 'Fatima' });

      // Wait for fire-and-forget email
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockEmail.sendRawHtml).toHaveBeenCalledWith(
        'emailtest@example.com',
        expect.stringContaining('#25'),
        expect.stringContaining('Fatima'),
      );
    });

    it('should not crash if email sending fails', async () => {
      const now = new Date();
      mockEmail.sendRawHtml.mockRejectedValueOnce(new Error('SMTP down'));
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ createdAt: now });
      mockPrisma.waitlistEntry.create.mockResolvedValueOnce({
        id: 'cl8', email: 'fail@example.com', name: null,
        referralCode: 'failref', referredBy: null, source: null, createdAt: now,
      });
      mockPrisma.waitlistEntry.count.mockResolvedValue(30);

      const result = await controller.join({ email: 'fail@example.com' });

      expect(result.alreadyJoined).toBe(false);
      expect(result.position).toBe(30);
    });
  });

  describe('GET /waitlist/stats', () => {
    it('should return total count from Redis cache', async () => {
      mockRedis.get.mockResolvedValueOnce('500');

      const result = await controller.stats();

      expect(result.totalCount).toBe(500);
      expect(mockPrisma.waitlistEntry.count).not.toHaveBeenCalled();
    });

    it('should query DB and cache when Redis is empty', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockPrisma.waitlistEntry.count.mockResolvedValueOnce(250);

      const result = await controller.stats();

      expect(result.totalCount).toBe(250);
      expect(mockRedis.set).toHaveBeenCalledWith('waitlist:count', '250', 'EX', 60);
    });

    it('should fallback to DB if Redis errors', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis down'));
      mockPrisma.waitlistEntry.count.mockResolvedValueOnce(75);

      const result = await controller.stats();

      expect(result.totalCount).toBe(75);
    });
  });

  describe('GET /waitlist/position/:referralCode', () => {
    it('should return position and referral count for valid code', async () => {
      const entry = {
        id: 'cl9', email: 'pos@example.com',
        referralCode: 'posref', createdAt: new Date('2026-03-01'),
      };
      mockPrisma.waitlistEntry.findUnique
        .mockResolvedValueOnce(entry) // find by referralCode
        .mockResolvedValueOnce({ createdAt: entry.createdAt }); // getPositionByEmail
      mockPrisma.waitlistEntry.count
        .mockResolvedValueOnce(15) // position
        .mockResolvedValueOnce(3) // referral count
        .mockResolvedValueOnce(100); // total

      const result = await controller.position('posref');

      expect(result.position).toBe(15);
      expect(result.referralCount).toBe(3);
      expect(result.totalCount).toBe(100);
    });

    it('should throw NotFoundException for invalid referral code', async () => {
      mockPrisma.waitlistEntry.findUnique.mockResolvedValueOnce(null);

      await expect(controller.position('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});

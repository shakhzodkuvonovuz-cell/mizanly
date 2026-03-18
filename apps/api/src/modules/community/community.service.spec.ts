import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CommunityService } from './community.service';

describe('CommunityService', () => {
  let service: CommunityService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityService,
        {
          provide: PrismaService,
          useValue: {
            localBoard: { create: jest.fn(), findMany: jest.fn() },
            mentorship: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
            studyCircle: { create: jest.fn(), findMany: jest.fn() },
            fatwaQuestion: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            volunteerOpportunity: { create: jest.fn(), findMany: jest.fn() },
            islamicEvent: { create: jest.fn(), findMany: jest.fn() },
            userReputation: { findUnique: jest.fn(), create: jest.fn(), upsert: jest.fn(), update: jest.fn() },
            voicePost: { create: jest.fn(), findMany: jest.fn() },
            watchParty: { create: jest.fn(), findMany: jest.fn() },
            video: { findUnique: jest.fn() },
            sharedCollection: { create: jest.fn(), findMany: jest.fn() },
            waqfFund: { create: jest.fn(), findMany: jest.fn() },
            user: { findUnique: jest.fn() },
            post: { findMany: jest.fn() },
            thread: { findMany: jest.fn() },
            message: { findMany: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<CommunityService>(CommunityService);
    prisma = module.get(PrismaService) as any;
  });

  describe('requestMentorship', () => {
    it('should create a mentorship request', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'mentor-1' });
      prisma.mentorship.create.mockResolvedValue({
        mentorId: 'mentor-1', menteeId: 'mentee-1', status: 'pending', topic: 'quran',
      });
      const result = await service.requestMentorship('mentee-1', { mentorId: 'mentor-1', topic: 'quran' });
      expect(result.status).toBe('pending');
    });

    it('should throw BadRequestException when mentoring self', async () => {
      await expect(service.requestMentorship('user-1', { mentorId: 'user-1', topic: 'quran' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('respondMentorship', () => {
    it('should accept mentorship', async () => {
      prisma.mentorship.findUnique.mockResolvedValue({ mentorId: 'mentor-1', menteeId: 'mentee-1', status: 'pending' });
      prisma.mentorship.update.mockResolvedValue({ status: 'active', startedAt: new Date() });

      const result = await service.respondMentorship('mentor-1', 'mentee-1', true);
      expect(result.status).toBe('active');
    });

    it('should decline mentorship', async () => {
      prisma.mentorship.findUnique.mockResolvedValue({ mentorId: 'mentor-1', menteeId: 'mentee-1', status: 'pending' });
      prisma.mentorship.update.mockResolvedValue({ status: 'cancelled' });

      const result = await service.respondMentorship('mentor-1', 'mentee-1', false);
      expect(result.status).toBe('cancelled');
    });
  });

  describe('reputation', () => {
    it('should create default reputation', async () => {
      prisma.userReputation.findUnique.mockResolvedValue(null);
      prisma.userReputation.create.mockResolvedValue({ userId: 'user-1', score: 0, tier: 'newcomer' });

      const result = await service.getReputation('user-1');
      expect(result.tier).toBe('newcomer');
    });

    it('should update tier based on score', async () => {
      prisma.userReputation.upsert.mockResolvedValue({ score: 250 });
      prisma.userReputation.update.mockResolvedValue({ score: 250, tier: 'trusted' });

      const result = await service.updateReputation('user-1', 50, 'helpful_comment');
      expect(result.tier).toBe('trusted');
    });
  });

  describe('checkKindness', () => {
    it('should flag negative language', async () => {
      const result = await service.checkKindness('You are so stupid and I hate this');
      expect(result.needsRephrase).toBe(true);
      expect(result.suggestion).toBeTruthy();
    });

    it('should pass positive language', async () => {
      const result = await service.checkKindness('MashaAllah, this is wonderful!');
      expect(result.needsRephrase).toBe(false);
    });
  });

  describe('getDataExport', () => {
    it('should return complete user data export', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'test' });
      prisma.post.findMany.mockResolvedValue([{ id: 'p1' }]);
      prisma.thread.findMany.mockResolvedValue([]);
      prisma.message.findMany.mockResolvedValue([{ id: 'm1' }]);

      const result = await service.getDataExport('user-1');
      expect(result.user).toBeTruthy();
      expect(result.posts).toHaveLength(1);
      expect(result.messages).toHaveLength(1);
      expect(result.exportedAt).toBeTruthy();
    });
  });

  describe('createVoicePost', () => {
    it('should create a voice post', async () => {
      prisma.voicePost.create.mockResolvedValue({
        id: 'vp-1', audioUrl: 'https://r2.test/audio.mp3', duration: 30,
      });

      const result = await service.createVoicePost('user-1', {
        audioUrl: 'https://r2.test/audio.mp3', duration: 30,
      });
      expect(result.duration).toBe(30);
    });
  });

  describe('createEvent', () => {
    it('should create an Islamic event', async () => {
      prisma.islamicEvent.create.mockResolvedValue({
        id: 'ev-1', title: 'Eid Prayer', eventType: 'eid_prayer',
      });

      const result = await service.createEvent('user-1', {
        title: 'Eid Prayer', eventType: 'eid_prayer',
        startDate: '2026-03-30T06:00:00Z',
      });
      expect(result.eventType).toBe('eid_prayer');
    });
  });
});

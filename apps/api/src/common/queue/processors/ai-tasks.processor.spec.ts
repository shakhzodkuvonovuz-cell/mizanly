import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiTasksProcessor } from './ai-tasks.processor';
import { AiService } from '../../../modules/ai/ai.service';
import { PrismaService } from '../../../config/prisma.service';
import { DlqService } from '../dlq.service';

describe('AiTasksProcessor', () => {
  let processor: AiTasksProcessor;
  let ai: any;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiTasksProcessor,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(null) } },
        {
          provide: AiService,
          useValue: {
            moderateContent: jest.fn().mockResolvedValue({ safe: true, flags: [], confidence: 0.9 }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            report: { create: jest.fn().mockResolvedValue({ id: 'r1' }) },
            post: { findUnique: jest.fn().mockResolvedValue({ userId: 'author-1' }) },
            thread: { findUnique: jest.fn().mockResolvedValue({ userId: 'author-1' }) },
            reel: { findUnique: jest.fn().mockResolvedValue({ userId: 'author-1' }) },
            comment: { findUnique: jest.fn().mockResolvedValue({ userId: 'author-1' }) },
          },
        },
        {
          provide: DlqService,
          useValue: {
            moveToDlq: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    processor = module.get(AiTasksProcessor);
    ai = module.get(AiService);
    prisma = module.get(PrismaService);
  });

  describe('processModeration (via reflection)', () => {
    it('should not create report when content is safe', async () => {
      ai.moderateContent.mockResolvedValue({ safe: true, flags: [], confidence: 0.9 });
      const job = { data: { content: 'Hello', contentType: 'post', contentId: 'p1' }, updateProgress: jest.fn() };
      await (processor as any).processModeration(job);
      expect(prisma.report.create).not.toHaveBeenCalled();
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should create report with correct schema fields when content is flagged', async () => {
      ai.moderateContent.mockResolvedValue({ safe: false, flags: ['hate_speech'], confidence: 0.95 });
      const job = { data: { content: 'Bad content', contentType: 'post', contentId: 'p1' }, updateProgress: jest.fn() };
      await (processor as any).processModeration(job);
      // X08-#16: reporterId changed from 'system' to null (valid FK)
      // X08-#15: reason now mapped from AI flags instead of hardcoded HATE_SPEECH
      expect(prisma.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reporterId: null,
          reason: 'HATE_SPEECH',
          reportedPostId: 'p1',
          reportedUserId: 'author-1',
        }),
      });
    });

    it('should use reportedCommentId for comment content type', async () => {
      ai.moderateContent.mockResolvedValue({ safe: false, flags: ['profanity'], confidence: 0.9 });
      const job = { data: { content: 'Bad', contentType: 'comment', contentId: 'c1' }, updateProgress: jest.fn() };
      await (processor as any).processModeration(job);
      expect(prisma.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ reportedCommentId: 'c1' }),
      });
    });

    it('should skip when confidence is below threshold', async () => {
      ai.moderateContent.mockResolvedValue({ safe: false, flags: ['spam'], confidence: 0.5 });
      const job = { data: { content: 'Maybe spam', contentType: 'post', contentId: 'p1' }, updateProgress: jest.fn() };
      await (processor as any).processModeration(job);
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('should skip invalid job data', async () => {
      const job = { data: { content: '', contentType: '', contentId: '' }, updateProgress: jest.fn() };
      await (processor as any).processModeration(job);
      expect(ai.moderateContent).not.toHaveBeenCalled();
    });

    it('should not throw when report creation fails', async () => {
      ai.moderateContent.mockResolvedValue({ safe: false, flags: ['violence'], confidence: 0.95 });
      prisma.report.create.mockRejectedValueOnce(new Error('DB error'));
      const job = { data: { content: 'Bad', contentType: 'post', contentId: 'p1' }, updateProgress: jest.fn() };
      // Should not throw -- logs and continues
      await expect((processor as any).processModeration(job)).resolves.not.toThrow();
    });

    // T13 row 19: thread, reel, video content types
    it('should look up reportedUserId for thread content type', async () => {
      ai.moderateContent.mockResolvedValue({ safe: false, flags: ['harassment'], confidence: 0.9 });
      const job = { data: { content: 'Bad thread', contentType: 'thread', contentId: 't1' }, updateProgress: jest.fn() };
      await (processor as any).processModeration(job);
      expect(prisma.thread.findUnique).toHaveBeenCalledWith({ where: { id: 't1' }, select: { userId: true } });
      expect(prisma.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ reportedUserId: 'author-1' }),
      });
    });

    it('should look up reportedUserId for reel content type', async () => {
      ai.moderateContent.mockResolvedValue({ safe: false, flags: ['nudity'], confidence: 0.95 });
      const job = { data: { content: 'Bad reel', contentType: 'reel', contentId: 'r1' }, updateProgress: jest.fn() };
      await (processor as any).processModeration(job);
      expect(prisma.reel.findUnique).toHaveBeenCalledWith({ where: { id: 'r1' }, select: { userId: true } });
      expect(prisma.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ reportedUserId: 'author-1' }),
      });
    });
  });

  // T13 row 24: unknown job type
  describe('mapFlagsToReason (via reflection)', () => {
    it('should map known flags to correct ReportReason', async () => {
      const result = (processor as any).mapFlagsToReason(['hate_speech']);
      expect(result).toBe('HATE_SPEECH');
    });

    it('should return OTHER for unknown flags', async () => {
      const result = (processor as any).mapFlagsToReason(['some_unknown_flag']);
      expect(result).toBe('OTHER');
    });

    it('should return first matching flag from array', async () => {
      const result = (processor as any).mapFlagsToReason(['unknown', 'spam', 'nudity']);
      expect(result).toBe('SPAM');
    });
  });

  // T13 row 12: lifecycle tests
  describe('lifecycle', () => {
    it('should not create worker when REDIS_URL not set', () => {
      processor.onModuleInit();
      expect((processor as any).worker).toBeNull();
    });

    it('should not throw on destroy when worker is null', async () => {
      processor.onModuleInit();
      await expect(processor.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  // T13 row 19 extended: message and video content types
  describe('processModeration -- video content type', () => {
    it('should look up reportedUserId from video model', async () => {
      prisma.video = { findUnique: jest.fn().mockResolvedValue({ userId: 'author-1' }) };
      ai.moderateContent.mockResolvedValue({ safe: false, flags: ['violence'], confidence: 0.9 });
      const job = { data: { content: 'Bad video', contentType: 'video', contentId: 'v1' }, updateProgress: jest.fn() };
      await (processor as any).processModeration(job);
      expect(prisma.video.findUnique).toHaveBeenCalledWith({ where: { id: 'v1' }, select: { userId: true } });
      expect(prisma.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ reportedVideoId: 'v1', reportedUserId: 'author-1' }),
      });
    });
  });
});

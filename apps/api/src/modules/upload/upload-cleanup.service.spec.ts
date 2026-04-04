import { Test, TestingModule } from '@nestjs/testing';
import { UploadCleanupService } from './upload-cleanup.service';
import { PrismaService } from '../../config/prisma.service';
import { ConfigService } from '@nestjs/config';

// Mock @aws-sdk/client-s3 before imports
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  ListObjectsV2Command: jest.fn().mockImplementation((params) => params),
  DeleteObjectCommand: jest.fn().mockImplementation((params) => params),
}));

// Mock acquireCronLock
jest.mock('../../common/utils/cron-lock', () => ({
  acquireCronLock: jest.fn().mockResolvedValue(true),
}));

describe('UploadCleanupService', () => {
  let service: UploadCleanupService;
  let mockPrisma: any;
  let mockRedis: any;
  let mockConfigService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      post: { findFirst: jest.fn().mockResolvedValue(null) },
      story: { findFirst: jest.fn().mockResolvedValue(null) },
      thread: { findFirst: jest.fn().mockResolvedValue(null) },
      reel: { findFirst: jest.fn().mockResolvedValue(null) },
      video: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      message: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        const vals: Record<string, string> = {
          R2_ACCOUNT_ID: 'test-account-id',
          R2_ACCESS_KEY_ID: 'test-access-key',
          R2_SECRET_ACCESS_KEY: 'test-secret-key',
          R2_BUCKET_NAME: 'test-bucket',
          R2_PUBLIC_URL: 'https://media.test.com',
        };
        return vals[key] ?? null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadCleanupService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'REDIS', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<UploadCleanupService>(UploadCleanupService);
  });

  describe('cleanupOrphanedUploads', () => {
    it('should skip when cron lock is not acquired', async () => {
      const { acquireCronLock } = require('../../common/utils/cron-lock');
      (acquireCronLock as jest.Mock).mockResolvedValueOnce(false);

      const result = await service.cleanupOrphanedUploads();

      expect(result).toEqual({ checked: 0, deleted: 0 });
    });

    it('should skip when R2 credentials are not configured', async () => {
      // Reset with no R2 credentials
      mockConfigService.get.mockReturnValue(null);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadCleanupService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: 'REDIS', useValue: mockRedis },
        ],
      }).compile();

      const svc = module.get<UploadCleanupService>(UploadCleanupService);

      const result = await svc.cleanupOrphanedUploads();

      expect(result).toEqual({ checked: 0, deleted: 0 });
    });

    it('should process all 9 folders', async () => {
      // Mock S3 client to return empty results for all folders
      const mockSend = jest.fn().mockResolvedValue({ Contents: [], IsTruncated: false });
      const s3Module = require('@aws-sdk/client-s3');
      s3Module.S3Client.mockImplementation(() => ({ send: mockSend }));

      // Re-create service so it picks up the new S3Client mock
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadCleanupService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: 'REDIS', useValue: mockRedis },
        ],
      }).compile();

      const svc = module.get<UploadCleanupService>(UploadCleanupService);
      const result = await svc.cleanupOrphanedUploads();

      expect(result).toEqual({ checked: 0, deleted: 0 });

      // Should have tried to list from each of the 9 folders
      const listCalls = mockSend.mock.calls.filter(
        (c: any[]) => c[0] && c[0].Prefix,
      );
      const prefixes = listCalls.map((c: any[]) => c[0].Prefix);
      expect(prefixes).toContain('posts/');
      expect(prefixes).toContain('stories/');
      expect(prefixes).toContain('messages/');
      expect(prefixes).toContain('avatars/');
    });

    it('should delete orphaned objects older than 24h', async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h ago
      const mockSend = jest.fn();

      // First call: ListObjectsV2 returns one old object
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'posts/test-file.jpg', LastModified: oldDate },
        ],
        IsTruncated: false,
      });
      // DeleteObject succeeds
      mockSend.mockResolvedValueOnce({});
      // Remaining folders return empty
      for (let i = 0; i < 8; i++) {
        mockSend.mockResolvedValueOnce({ Contents: [], IsTruncated: false });
      }

      const s3Module = require('@aws-sdk/client-s3');
      s3Module.S3Client.mockImplementation(() => ({ send: mockSend }));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadCleanupService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: 'REDIS', useValue: mockRedis },
        ],
      }).compile();

      const svc = module.get<UploadCleanupService>(UploadCleanupService);
      const result = await svc.cleanupOrphanedUploads();

      expect(result.checked).toBe(1);
      expect(result.deleted).toBe(1);
    });

    it('should NOT delete objects younger than 24h', async () => {
      const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1h ago
      const mockSend = jest.fn();

      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'posts/recent-file.jpg', LastModified: recentDate },
        ],
        IsTruncated: false,
      });
      for (let i = 0; i < 8; i++) {
        mockSend.mockResolvedValueOnce({ Contents: [], IsTruncated: false });
      }

      const s3Module = require('@aws-sdk/client-s3');
      s3Module.S3Client.mockImplementation(() => ({ send: mockSend }));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadCleanupService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: 'REDIS', useValue: mockRedis },
        ],
      }).compile();

      const svc = module.get<UploadCleanupService>(UploadCleanupService);
      const result = await svc.cleanupOrphanedUploads();

      expect(result.checked).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('should NOT delete objects that are referenced in DB', async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const mockSend = jest.fn();

      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'posts/referenced-file.jpg', LastModified: oldDate },
        ],
        IsTruncated: false,
      });
      for (let i = 0; i < 8; i++) {
        mockSend.mockResolvedValueOnce({ Contents: [], IsTruncated: false });
      }

      // Mark as referenced: post.findFirst returns a match
      mockPrisma.post.findFirst.mockResolvedValueOnce({ id: 'post-1' });

      const s3Module = require('@aws-sdk/client-s3');
      s3Module.S3Client.mockImplementation(() => ({ send: mockSend }));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadCleanupService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: 'REDIS', useValue: mockRedis },
        ],
      }).compile();

      const svc = module.get<UploadCleanupService>(UploadCleanupService);
      const result = await svc.cleanupOrphanedUploads();

      expect(result.checked).toBe(1);
      expect(result.deleted).toBe(0);
    });

    it('should handle S3 errors gracefully', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('S3 network error'));

      const s3Module = require('@aws-sdk/client-s3');
      s3Module.S3Client.mockImplementation(() => ({ send: mockSend }));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadCleanupService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: 'REDIS', useValue: mockRedis },
        ],
      }).compile();

      const svc = module.get<UploadCleanupService>(UploadCleanupService);

      // Should not throw
      const result = await svc.cleanupOrphanedUploads();
      expect(result).toEqual({ checked: 0, deleted: 0 });
    });
  });
});

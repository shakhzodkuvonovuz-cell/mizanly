import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { EmbeddingsService } from './embeddings.service';

// Store original fetch so we can restore it
const originalFetch = global.fetch;
const mockFetch = jest.fn();

describe('EmbeddingsService — SQL Injection Prevention', () => {
  let service: EmbeddingsService;
  let prisma: any;

  beforeEach(async () => {
    mockFetch.mockReset();
    global.fetch = mockFetch as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        {
          provide: PrismaService,
          useValue: {
            post: { findUnique: jest.fn() },
            reel: { findUnique: jest.fn() },
            thread: { findUnique: jest.fn() },
            video: { findUnique: jest.fn() },
            feedInteraction: { findMany: jest.fn() },
            $executeRaw: jest.fn(),
            $queryRawUnsafe: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'GEMINI_API_KEY') return 'test-api-key';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EmbeddingsService>(EmbeddingsService);
    prisma = module.get(PrismaService) as any;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('findSimilar — filterTypes SQL injection prevention', () => {
    it('should strip invalid filterTypes that contain SQL injection payloads', async () => {
      // Attempt SQL injection via filterTypes
      const maliciousTypes = [
        "POST'; DROP TABLE embeddings; --" as any,
        "REEL' OR '1'='1" as any,
        "UNION SELECT * FROM users--" as any,
      ];

      await service.findSimilar('content-1', 'POST' as any, 20, maliciousTypes);

      // The query should have been called, but with no type filter
      // because all malicious types are stripped by validateFilterTypes
      const queryCall = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = queryCall[0] as string;

      // The SQL should NOT contain any of the injection payloads
      expect(sql).not.toContain('DROP TABLE');
      expect(sql).not.toContain("OR '1'='1");
      expect(sql).not.toContain('UNION SELECT');

      // The SQL should NOT contain a type filter IN clause since all were invalid
      expect(sql).not.toContain('IN (');
    });

    it('should pass through valid EmbeddingContentType values', async () => {
      const validTypes = ['POST', 'REEL'] as any[];

      await service.findSimilar('content-1', 'POST' as any, 20, validTypes);

      const queryCall = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = queryCall[0] as string;

      // Valid types should appear in the IN clause
      expect(sql).toContain("'POST'");
      expect(sql).toContain("'REEL'");
    });

    it('should filter out invalid types while keeping valid ones', async () => {
      const mixedTypes = [
        'POST' as any,
        "'; DROP TABLE embeddings; --" as any,
        'THREAD' as any,
      ];

      await service.findSimilar('content-1', 'POST' as any, 10, mixedTypes);

      const queryCall = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = queryCall[0] as string;

      // Only valid types should appear
      expect(sql).toContain("'POST'");
      expect(sql).toContain("'THREAD'");
      expect(sql).not.toContain('DROP TABLE');
    });
  });

  describe('findSimilarByVector — excludeIds SQL injection prevention', () => {
    it('should strip excludeIds containing SQL injection payloads', async () => {
      const fakeVector = Array(768).fill(0.1);
      const maliciousIds = [
        "abc'; DROP TABLE embeddings; --",
        "123' OR '1'='1",
        "'; DELETE FROM users WHERE '1'='1",
      ];

      await service.findSimilarByVector(fakeVector, 20, undefined, maliciousIds);

      const queryCall = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = queryCall[0] as string;

      // The SQL should NOT contain injection payloads
      expect(sql).not.toContain('DROP TABLE');
      expect(sql).not.toContain("OR '1'='1");
      expect(sql).not.toContain('DELETE FROM');

      // Since all IDs were invalid, the NOT IN clause should not appear
      expect(sql).not.toContain('NOT IN');
    });

    it('should pass through valid cuid/uuid-format excludeIds', async () => {
      const fakeVector = Array(768).fill(0.1);
      const validIds = ['clx12abc34', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'simple_id-123'];

      await service.findSimilarByVector(fakeVector, 20, undefined, validIds);

      const queryCall = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = queryCall[0] as string;

      // Valid IDs should appear in the NOT IN clause
      expect(sql).toContain('NOT IN');
      expect(sql).toContain("'clx12abc34'");
      expect(sql).toContain("'simple_id-123'");
    });

    it('should filter out invalid IDs while keeping valid ones', async () => {
      const fakeVector = Array(768).fill(0.1);
      const mixedIds = [
        'valid-id-123',
        "'; DROP TABLE embeddings; --",
        'another_valid_id',
      ];

      await service.findSimilarByVector(fakeVector, 20, undefined, mixedIds);

      const queryCall = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = queryCall[0] as string;

      expect(sql).toContain("'valid-id-123'");
      expect(sql).toContain("'another_valid_id'");
      expect(sql).not.toContain('DROP TABLE');
    });

    it('should handle empty excludeIds array', async () => {
      const fakeVector = Array(768).fill(0.1);

      await service.findSimilarByVector(fakeVector, 20, undefined, []);

      const queryCall = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = queryCall[0] as string;

      // Empty array should not produce a NOT IN clause
      expect(sql).not.toContain('NOT IN');
    });

    it('should handle both filterTypes and excludeIds injection attempts simultaneously', async () => {
      const fakeVector = Array(768).fill(0.1);

      const maliciousTypes = ["POST' UNION SELECT password FROM users--" as any];
      const maliciousIds = ["1'; DELETE FROM embeddings WHERE '1'='1"];

      await service.findSimilarByVector(fakeVector, 20, maliciousTypes, maliciousIds);

      const queryCall = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = queryCall[0] as string;

      // Neither injection attempt should appear in the SQL
      expect(sql).not.toContain('UNION SELECT');
      expect(sql).not.toContain('DELETE FROM');
      expect(sql).not.toContain('password');
    });
  });

  describe('validateFilterTypes — enum whitelist validation', () => {
    it('should return empty array for undefined input', async () => {
      // Calling findSimilar without filterTypes should produce no filter clause
      await service.findSimilar('content-1', 'POST' as any, 10);

      const queryCall = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = queryCall[0] as string;
      expect(sql).not.toContain('IN (');
    });

    it('should return empty array when all types are invalid', async () => {
      const invalidTypes = ['INVALID_TYPE', 'ANOTHER_BAD', 'NOT_A_TYPE'] as any[];

      await service.findSimilar('content-1', 'POST' as any, 10, invalidTypes);

      const queryCall = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = queryCall[0] as string;
      expect(sql).not.toContain('IN (');
    });
  });

  describe('validateIds — safe ID pattern', () => {
    it('should reject IDs with spaces', async () => {
      const fakeVector = Array(768).fill(0.1);
      const idsWithSpaces = ['id with space', 'another bad id'];

      await service.findSimilarByVector(fakeVector, 10, undefined, idsWithSpaces);

      const queryCall = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = queryCall[0] as string;
      expect(sql).not.toContain('NOT IN');
    });

    it('should reject IDs with special SQL characters', async () => {
      const fakeVector = Array(768).fill(0.1);
      const specialCharIds = ["id'quote", 'id;semicolon', 'id(paren)', 'id=equals'];

      await service.findSimilarByVector(fakeVector, 10, undefined, specialCharIds);

      const queryCall = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = queryCall[0] as string;
      expect(sql).not.toContain('NOT IN');
    });

    it('should accept IDs with alphanumeric, dashes, and underscores', async () => {
      const fakeVector = Array(768).fill(0.1);
      const validIds = ['abc123', 'id-with-dashes', 'id_with_underscores', 'MiXeD-CaSe_123'];

      await service.findSimilarByVector(fakeVector, 10, undefined, validIds);

      const queryCall = prisma.$queryRawUnsafe.mock.calls[0];
      const sql = queryCall[0] as string;
      expect(sql).toContain('NOT IN');
      for (const id of validIds) {
        expect(sql).toContain(`'${id}'`);
      }
    });
  });
});

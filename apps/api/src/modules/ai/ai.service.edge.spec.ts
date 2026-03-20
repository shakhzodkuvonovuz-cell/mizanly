import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { ConfigService } from '@nestjs/config';

describe('AiService — edge cases', () => {
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        AiService,
        {
          provide: PrismaService,
          useValue: {
            caption: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findFirst: jest.fn() },
            aiAvatar: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
            message: { findUnique: jest.fn(), update: jest.fn() },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'ANTHROPIC_API_KEY') return 'test-key';
              if (key === 'OPENAI_API_KEY') return 'test-key';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  describe('moderateContent — edge cases', () => {
    it('should return safe result for Arabic text (no crash)', async () => {
      // callClaude is mocked via globalMockProviders — returns default safe result
      const result = await service.moderateContent('محتوى إسلامي مفيد', 'post');
      expect(result).toBeDefined();
      expect(result.safe).toBe(true);
    });

    it('should handle empty string without crash', async () => {
      const result = await service.moderateContent('', 'post');
      expect(result).toBeDefined();
    });
  });

  describe('suggestCaptions — edge cases', () => {
    it('should return array for empty content', async () => {
      const result = await service.suggestCaptions('');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('translateText — edge cases', () => {
    it('should handle Arabic to English translation request', async () => {
      const result = await service.translateText('السلام عليكم', 'en');
      expect(result).toBeDefined();
    });
  });

  describe('suggestSmartReplies — edge cases', () => {
    it('should return fallback replies for empty context', async () => {
      const result = await service.suggestSmartReplies('', []);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('summarizeContent — edge cases', () => {
    it('should return original text if shorter than maxLength', async () => {
      const shortText = 'Short text';
      const result = await service.summarizeContent(shortText, 150);
      expect(result).toBe(shortText);
    });
  });

  describe('moderateImage — edge cases', () => {
    it('should return SAFE classification by default (from mock)', async () => {
      const result = await service.moderateImage('https://example.com/image.jpg');
      expect(result.classification).toBe('SAFE');
    });
  });

  describe('isAvailable — edge cases', () => {
    it('should return true when API key is configured', () => {
      const result = service.isAvailable();
      expect(result).toBe(true);
    });
  });
});

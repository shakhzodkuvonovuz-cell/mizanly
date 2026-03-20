import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionController } from './encryption.controller';
import { EncryptionService } from './encryption.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('EncryptionController', () => {
  let controller: EncryptionController;
  let service: jest.Mocked<EncryptionService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EncryptionController],
      providers: [
        ...globalMockProviders,
        {
          provide: EncryptionService,
          useValue: {
            registerKey: jest.fn(),
            getBulkKeys: jest.fn(),
            getPublicKey: jest.fn(),
            storeEnvelope: jest.fn(),
            getEnvelope: jest.fn(),
            rotateKey: jest.fn(),
            computeSafetyNumber: jest.fn(),
            getConversationEncryptionStatus: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(EncryptionController);
    service = module.get(EncryptionService) as jest.Mocked<EncryptionService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('registerKey', () => {
    it('should call encryptionService.registerKey with userId and publicKey', async () => {
      service.registerKey.mockResolvedValue({ registered: true } as any);

      const result = await controller.registerKey(userId, { publicKey: 'base64key123456789012345678901234' } as any);

      expect(service.registerKey).toHaveBeenCalledWith(userId, 'base64key123456789012345678901234');
      expect(result).toEqual({ registered: true });
    });
  });

  describe('getBulkKeys', () => {
    it('should parse comma-separated userIds and call service.getBulkKeys', async () => {
      const mockKeys = [{ userId: 'user-1', publicKey: 'key1' }, { userId: 'user-2', publicKey: 'key2' }];
      service.getBulkKeys.mockResolvedValue(mockKeys as any);

      const result = await controller.getBulkKeys('user-1,user-2');

      expect(service.getBulkKeys).toHaveBeenCalledWith(['user-1', 'user-2']);
      expect(result).toHaveLength(2);
    });

    it('should handle empty userIds string', async () => {
      service.getBulkKeys.mockResolvedValue([] as any);

      await controller.getBulkKeys('');

      expect(service.getBulkKeys).toHaveBeenCalledWith([]);
    });
  });

  describe('getPublicKey', () => {
    it('should call encryptionService.getPublicKey with userId', async () => {
      service.getPublicKey.mockResolvedValue({ publicKey: 'key123' } as any);

      const result = await controller.getPublicKey('user-2');

      expect(service.getPublicKey).toHaveBeenCalledWith('user-2');
      expect(result).toEqual(expect.objectContaining({ publicKey: 'key123' }));
    });
  });

  describe('storeEnvelope', () => {
    it('should call encryptionService.storeEnvelope with userId and dto fields', async () => {
      const dto = { conversationId: 'conv-1', recipientId: 'user-2', encryptedKey: 'enc-key', nonce: 'nonce123' };
      service.storeEnvelope.mockResolvedValue({ stored: true } as any);

      await controller.storeEnvelope(userId, dto as any);

      expect(service.storeEnvelope).toHaveBeenCalledWith(userId, {
        conversationId: 'conv-1',
        recipientId: 'user-2',
        encryptedKey: 'enc-key',
        nonce: 'nonce123',
      });
    });
  });

  describe('getEnvelope', () => {
    it('should call encryptionService.getEnvelope with conversationId and userId', async () => {
      service.getEnvelope.mockResolvedValue({ encryptedKey: 'key', nonce: 'n' } as any);

      const result = await controller.getEnvelope(userId, 'conv-1');

      expect(service.getEnvelope).toHaveBeenCalledWith('conv-1', userId);
      expect(result).toEqual(expect.objectContaining({ encryptedKey: 'key' }));
    });
  });

  describe('rotateKey', () => {
    it('should call encryptionService.rotateKey with conversationId, userId, envelopes', async () => {
      const envelopes = [{ userId: 'user-2', encryptedKey: 'new-key', nonce: 'new-nonce' }];
      service.rotateKey.mockResolvedValue({ rotated: true } as any);

      await controller.rotateKey(userId, 'conv-1', { envelopes } as any);

      expect(service.rotateKey).toHaveBeenCalledWith('conv-1', userId, envelopes);
    });
  });

  describe('getSafetyNumber', () => {
    it('should call encryptionService.computeSafetyNumber and wrap result', async () => {
      service.computeSafetyNumber.mockResolvedValue('12345 67890 12345 67890' as any);

      const result = await controller.getSafetyNumber(userId, 'user-2');

      expect(service.computeSafetyNumber).toHaveBeenCalledWith(userId, 'user-2');
      expect(result).toEqual({ safetyNumber: '12345 67890 12345 67890' });
    });
  });

  describe('getConversationStatus', () => {
    it('should call encryptionService.getConversationEncryptionStatus', async () => {
      service.getConversationEncryptionStatus.mockResolvedValue({ encrypted: true, allKeysValid: true } as any);

      const result = await controller.getConversationStatus('conv-1');

      expect(service.getConversationEncryptionStatus).toHaveBeenCalledWith('conv-1');
      expect(result).toEqual(expect.objectContaining({ encrypted: true }));
    });
  });
});

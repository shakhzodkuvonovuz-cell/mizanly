import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        WebhooksService,
        {
          provide: PrismaService,
          useValue: {
            webhook: {
              create: jest.fn().mockResolvedValue({
                id: 'wh-1', name: 'Test Hook', url: 'https://example.com/hook',
                events: ['message.created'], secret: 'abc123', createdById: 'u1',
              }),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue({ id: 'wh-1', createdById: 'u1' }),
              delete: jest.fn().mockResolvedValue({}),
              update: jest.fn().mockResolvedValue({}),
            },
            webhookDelivery: {
              create: jest.fn().mockResolvedValue({}),
              findMany: jest.fn().mockResolvedValue([]),
            },
          },
        },
      ],
    }).compile();

    service = module.get(WebhooksService);
    prisma = module.get(PrismaService) as any;
  });

  it('should create a webhook', async () => {
    const result = await service.create('u1', {
      circleId: 'c1', name: 'Test Hook',
      url: 'https://example.com/hook', events: ['message.created'],
    });
    expect(result.name).toBe('Test Hook');
    expect(result.secret).toBeDefined();
  });

  it('should list webhooks for a circle', async () => {
    const result = await service.list('c1');
    expect(Array.isArray(result)).toBe(true);
  });

  it('should delete a webhook', async () => {
    const result = await service.delete('wh-1', 'u1');
    expect(result).toBeDefined();
  });

  it('should throw NotFoundException when deleting non-existent webhook', async () => {
    prisma.webhook.findUnique.mockResolvedValueOnce(null);
    await expect(service.delete('invalid', 'u1')).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when user does not own webhook', async () => {
    prisma.webhook.findUnique.mockResolvedValueOnce({ id: 'wh-1', createdById: 'other-user' });
    await expect(service.delete('wh-1', 'u1')).rejects.toThrow(NotFoundException);
  });
});

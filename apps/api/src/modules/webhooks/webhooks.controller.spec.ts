import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let service: jest.Mocked<WebhooksService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        ...globalMockProviders,
        {
          provide: WebhooksService,
          useValue: {
            create: jest.fn(),
            list: jest.fn(),
            delete: jest.fn(),
            test: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(WebhooksController);
    service = module.get(WebhooksService) as jest.Mocked<WebhooksService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should call webhooksService.create with userId and body', async () => {
      const body = { circleId: 'circle-1', name: 'My Hook', url: 'https://example.com/hook', events: ['message.created'] };
      service.create.mockResolvedValue({ id: 'wh-1' } as any);

      await controller.create(userId, body);

      expect(service.create).toHaveBeenCalledWith(userId, body);
    });
  });

  describe('list', () => {
    it('should call webhooksService.list with circleId', async () => {
      service.list.mockResolvedValue([{ id: 'wh-1' }] as any);

      await controller.list('circle-1');

      expect(service.list).toHaveBeenCalledWith('circle-1');
    });
  });

  describe('delete', () => {
    it('should call webhooksService.delete with id and userId', async () => {
      service.delete.mockResolvedValue({ deleted: true } as any);

      await controller.delete('wh-1', userId);

      expect(service.delete).toHaveBeenCalledWith('wh-1', userId);
    });
  });

  describe('test', () => {
    it('should call webhooksService.test with id and userId', async () => {
      service.test.mockResolvedValue({ delivered: true } as any);

      await controller.test('wh-1', userId);

      expect(service.test).toHaveBeenCalledWith('wh-1', userId);
    });
  });
});

import { Test } from '@nestjs/testing';
import { DraftsController } from './drafts.controller';
import { DraftsService } from './drafts.service';

describe('DraftsController', () => {
  let controller: DraftsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      getDrafts: jest.fn().mockResolvedValue([]),
      getDraft: jest.fn().mockResolvedValue({ id: '1' }),
      saveDraft: jest.fn().mockResolvedValue({ id: '1' }),
      updateDraft: jest.fn().mockResolvedValue({ id: '1' }),
      deleteDraft: jest.fn().mockResolvedValue({ deleted: true }),
      deleteAllDrafts: jest.fn().mockResolvedValue({ deleted: true }),
    };

    const module = await Test.createTestingModule({
      controllers: [DraftsController],
      providers: [{ provide: DraftsService, useValue: service }],
    }).compile();

    controller = module.get(DraftsController);
  });

  it('getDrafts calls service', async () => {
    await controller.getDrafts('user1');
    expect(service.getDrafts).toHaveBeenCalledWith('user1', undefined);
  });

  it('saveDraft calls service', async () => {
    await controller.saveDraft('user1', { space: 'SAF', data: { content: 'test' } });
    expect(service.saveDraft).toHaveBeenCalledWith('user1', 'SAF', { content: 'test' });
  });

  it('deleteDraft calls service', async () => {
    await controller.deleteDraft('1', 'user1');
    expect(service.deleteDraft).toHaveBeenCalledWith('1', 'user1');
  });
});
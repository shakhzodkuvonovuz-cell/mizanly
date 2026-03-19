import { Test } from '@nestjs/testing';
import { DraftsController } from './drafts.controller';
import { DraftsService } from './drafts.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('DraftsController', () => {
  let controller: DraftsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      getDrafts: jest.fn().mockResolvedValue([]),
      getDraft: jest.fn().mockResolvedValue({ id: '1', space: 'SAF', data: { content: 'test' } }),
      saveDraft: jest.fn().mockResolvedValue({ id: '1' }),
      updateDraft: jest.fn().mockResolvedValue({ id: '1', data: { content: 'updated' } }),
      deleteDraft: jest.fn().mockResolvedValue({ deleted: true }),
      deleteAllDrafts: jest.fn().mockResolvedValue({ deleted: true }),
    };

    const module = await Test.createTestingModule({
      controllers: [DraftsController],
      providers: [...globalMockProviders, { provide: DraftsService, useValue: service }],
    }).compile();

    controller = module.get(DraftsController);
  });

  it('should get drafts for user', async () => {
    await controller.getDrafts('user1');
    expect(service.getDrafts).toHaveBeenCalledWith('user1', undefined);
  });

  it('should get drafts filtered by space', async () => {
    await controller.getDrafts('user1', 'SAF' as any);
    expect(service.getDrafts).toHaveBeenCalledWith('user1', 'SAF');
  });

  it('should save a new draft', async () => {
    await controller.saveDraft('user1', { space: 'SAF', data: { content: 'test' } });
    expect(service.saveDraft).toHaveBeenCalledWith('user1', 'SAF', { content: 'test' });
  });

  it('should get a single draft by ID', async () => {
    const result = await controller.getDraft('1', 'user1');
    expect(service.getDraft).toHaveBeenCalledWith('1', 'user1');
    expect(result.id).toBe('1');
  });

  it('should update an existing draft', async () => {
    await controller.updateDraft('1', 'user1', { data: { content: 'updated' } });
    expect(service.updateDraft).toHaveBeenCalledWith('1', 'user1', { content: 'updated' });
  });

  it('should delete a draft', async () => {
    await controller.deleteDraft('1', 'user1');
    expect(service.deleteDraft).toHaveBeenCalledWith('1', 'user1');
  });

  it('should delete all drafts', async () => {
    await controller.deleteAllDrafts('user1');
    expect(service.deleteAllDrafts).toHaveBeenCalledWith('user1');
  });

  it('should return empty array when no drafts exist', async () => {
    service.getDrafts.mockResolvedValue([]);
    const result = await controller.getDrafts('user1');
    expect(result).toEqual([]);
  });

  it('should handle save draft with MAJLIS space', async () => {
    await controller.saveDraft('user1', { space: 'MAJLIS', data: { content: 'thread draft' } });
    expect(service.saveDraft).toHaveBeenCalledWith('user1', 'MAJLIS', { content: 'thread draft' });
  });

  it('should return draft data on save', async () => {
    service.saveDraft.mockResolvedValue({ id: 'draft-1', space: 'SAF' });
    const result = await controller.saveDraft('user1', { space: 'SAF', data: { content: 'test' } });
    expect(result.id).toBe('draft-1');
  });
});

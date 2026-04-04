/**
 * Tests for useDraftPersistence hook logic.
 *
 * Since the hook requires React lifecycle (useEffect, useCallback, useRef),
 * we test the underlying AsyncStorage interaction patterns that the hook wraps.
 * This validates the serialization, deserialization, debouncing, and error handling.
 */

// Mock AsyncStorage
const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockStorage.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      mockStorage.delete(key);
      return Promise.resolve();
    }),
  },
}));

// Mock React hooks so the module loads in node environment
const mockCallbacks: Array<() => void> = [];
jest.mock('react', () => ({
  useEffect: jest.fn((fn: () => (() => void) | void) => {
    const cleanup = fn();
    if (typeof cleanup === 'function') mockCallbacks.push(cleanup);
  }),
  useCallback: jest.fn((fn: (...args: unknown[]) => unknown) => fn),
  useRef: jest.fn((initial: unknown) => ({ current: initial })),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDraftPersistence } from '../useDraftPersistence';

describe('useDraftPersistence', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
    mockCallbacks.length = 0;
  });

  describe('save', () => {
    it('should serialize and store data to AsyncStorage', async () => {
      const onRestore = jest.fn();
      const { save } = useDraftPersistence<{ title: string }>('test-draft', onRestore);

      await save({ title: 'My Draft' });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('test-draft', JSON.stringify({ title: 'My Draft' }));
      expect(mockStorage.get('test-draft')).toBe(JSON.stringify({ title: 'My Draft' }));
    });

    it('should overwrite existing draft', async () => {
      mockStorage.set('test-draft', JSON.stringify({ title: 'Old' }));
      const onRestore = jest.fn();
      const { save } = useDraftPersistence<{ title: string }>('test-draft', onRestore);

      await save({ title: 'New' });

      expect(mockStorage.get('test-draft')).toBe(JSON.stringify({ title: 'New' }));
    });
  });

  describe('clear', () => {
    it('should remove draft from AsyncStorage', async () => {
      mockStorage.set('test-draft', JSON.stringify({ title: 'Will be deleted' }));
      const onRestore = jest.fn();
      const { clear } = useDraftPersistence<{ title: string }>('test-draft', onRestore);

      await clear();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('test-draft');
      expect(mockStorage.has('test-draft')).toBe(false);
    });

    it('should not throw when clearing non-existent draft', async () => {
      const onRestore = jest.fn();
      const { clear } = useDraftPersistence<{ title: string }>('nonexistent', onRestore);

      await expect(clear()).resolves.not.toThrow();
    });
  });

  describe('onRestore', () => {
    it('should call onRestore with parsed draft on mount', async () => {
      const draft = { title: 'Restored', content: 'Hello' };
      mockStorage.set('restore-key', JSON.stringify(draft));
      const onRestore = jest.fn();

      useDraftPersistence<typeof draft>('restore-key', onRestore);

      // useEffect fires synchronously in our mock — wait for the async chain
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(AsyncStorage.getItem).toHaveBeenCalledWith('restore-key');
      expect(onRestore).toHaveBeenCalledWith(draft);
    });

    it('should not call onRestore when no draft exists', async () => {
      const onRestore = jest.fn();

      useDraftPersistence<{ title: string }>('empty-key', onRestore);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(AsyncStorage.getItem).toHaveBeenCalledWith('empty-key');
      expect(onRestore).not.toHaveBeenCalled();
    });

    it('should clear corrupted draft and not call onRestore', async () => {
      mockStorage.set('corrupt-key', '{invalid json');
      const onRestore = jest.fn();

      useDraftPersistence<{ title: string }>('corrupt-key', onRestore);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(onRestore).not.toHaveBeenCalled();
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('corrupt-key');
    });
  });

  describe('debouncedSave', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should debounce saves with default 2000ms delay', () => {
      const onRestore = jest.fn();
      const { debouncedSave } = useDraftPersistence<{ text: string }>('debounce-key', onRestore);

      debouncedSave({ text: 'first' });
      debouncedSave({ text: 'second' });
      debouncedSave({ text: 'third' });

      // Only the last call should win after debounce
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();

      jest.advanceTimersByTime(2000);

      // The setTimeout callback is async, run microtasks
      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
          expect(AsyncStorage.setItem).toHaveBeenCalledWith('debounce-key', JSON.stringify({ text: 'third' }));
          resolve();
        }, 0);
        jest.advanceTimersByTime(1);
      });
    });

    it('should respect custom debounceMs option', () => {
      const onRestore = jest.fn();
      const { debouncedSave } = useDraftPersistence<{ text: string }>(
        'custom-debounce',
        onRestore,
        { debounceMs: 500 },
      );

      debouncedSave({ text: 'fast' });

      // Should not fire at 400ms
      jest.advanceTimersByTime(400);
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();

      // Should fire at 500ms
      jest.advanceTimersByTime(100);

      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(AsyncStorage.setItem).toHaveBeenCalledWith('custom-debounce', JSON.stringify({ text: 'fast' }));
          resolve();
        }, 0);
        jest.advanceTimersByTime(1);
      });
    });
  });

  describe('different draft types', () => {
    it('should handle post draft shape', async () => {
      const onRestore = jest.fn();
      const { save } = useDraftPersistence<{ content: string; mediaUrls: string[] }>('post-draft', onRestore);

      await save({ content: 'Hello world', mediaUrls: ['img1.jpg', 'img2.jpg'] });

      const stored = JSON.parse(mockStorage.get('post-draft')!);
      expect(stored.content).toBe('Hello world');
      expect(stored.mediaUrls).toEqual(['img1.jpg', 'img2.jpg']);
    });

    it('should handle video draft shape', async () => {
      const onRestore = jest.fn();
      const { save } = useDraftPersistence<{ title: string; tags: string[]; visibility: string }>('video-draft', onRestore);

      await save({ title: 'My Video', tags: ['tag1', 'tag2'], visibility: 'PUBLIC' });

      const stored = JSON.parse(mockStorage.get('video-draft')!);
      expect(stored.title).toBe('My Video');
      expect(stored.tags).toEqual(['tag1', 'tag2']);
    });

    it('should handle thread draft shape with nested parts', async () => {
      const onRestore = jest.fn();
      const parts = [{ content: 'Part 1', media: [] }, { content: 'Part 2', media: ['img.jpg'] }];
      const { save } = useDraftPersistence<{ parts: typeof parts }>('draft:thread', onRestore);

      await save({ parts });

      const stored = JSON.parse(mockStorage.get('draft:thread')!);
      expect(stored.parts).toHaveLength(2);
      expect(stored.parts[0].content).toBe('Part 1');
    });

    it('should handle event draft shape with booleans', async () => {
      const onRestore = jest.fn();
      const { save } = useDraftPersistence<{ title: string; isOnline: boolean; allDay: boolean }>('event-draft', onRestore);

      await save({ title: 'Iftar', isOnline: false, allDay: true });

      const stored = JSON.parse(mockStorage.get('event-draft')!);
      expect(stored.isOnline).toBe(false);
      expect(stored.allDay).toBe(true);
    });
  });

  describe('key isolation', () => {
    it('should not cross-contaminate between different keys', async () => {
      const onRestore1 = jest.fn();
      const onRestore2 = jest.fn();

      const hook1 = useDraftPersistence<{ text: string }>('key-a', onRestore1);
      const hook2 = useDraftPersistence<{ text: string }>('key-b', onRestore2);

      await hook1.save({ text: 'A' });
      await hook2.save({ text: 'B' });

      expect(mockStorage.get('key-a')).toBe(JSON.stringify({ text: 'A' }));
      expect(mockStorage.get('key-b')).toBe(JSON.stringify({ text: 'B' }));

      await hook1.clear();
      expect(mockStorage.has('key-a')).toBe(false);
      expect(mockStorage.has('key-b')).toBe(true);
    });
  });
});

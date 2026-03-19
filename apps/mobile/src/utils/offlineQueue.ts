import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'mizanly:offline_queue';

interface QueuedAction {
  id: string;
  type: 'like' | 'unlike' | 'follow' | 'unfollow' | 'bookmark' | 'unbookmark' | 'comment' | 'share';
  endpoint: string;
  method: 'POST' | 'DELETE';
  body?: Record<string, unknown>;
  createdAt: number;
}

/**
 * Offline action queue.
 * When user performs an action while offline, it's queued here.
 * When connection returns, the queue is flushed in order.
 */
class OfflineQueue {
  private queue: QueuedAction[] = [];
  private flushing = false;

  async load(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      this.queue = raw ? JSON.parse(raw) : [];
    } catch {
      this.queue = [];
    }
  }

  private async persist(): Promise<void> {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
  }

  async enqueue(action: Omit<QueuedAction, 'id' | 'createdAt'>): Promise<void> {
    const entry: QueuedAction = {
      ...action,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };
    this.queue.push(entry);
    await this.persist();
  }

  get pending(): number {
    return this.queue.length;
  }

  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Flush all queued actions. Called when connection is restored.
   * Processes actions in order. Failed actions are re-queued.
   */
  async flush(
    executor: (action: QueuedAction) => Promise<boolean>,
  ): Promise<{ succeeded: number; failed: number }> {
    if (this.flushing || this.queue.length === 0) {
      return { succeeded: 0, failed: 0 };
    }

    this.flushing = true;
    const toProcess = [...this.queue];
    this.queue = [];
    let succeeded = 0;
    let failed = 0;

    for (const action of toProcess) {
      try {
        const ok = await executor(action);
        if (ok) {
          succeeded++;
        } else {
          // Re-queue failed action if it's less than 24 hours old
          if (Date.now() - action.createdAt < 24 * 60 * 60 * 1000) {
            this.queue.push(action);
          }
          failed++;
        }
      } catch {
        if (Date.now() - action.createdAt < 24 * 60 * 60 * 1000) {
          this.queue.push(action);
        }
        failed++;
      }
    }

    await this.persist();
    this.flushing = false;
    return { succeeded, failed };
  }

  async clear(): Promise<void> {
    this.queue = [];
    await this.persist();
  }
}

export const offlineQueue = new OfflineQueue();

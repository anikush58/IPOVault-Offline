export type EventType = 'TABLE_UPDATED' | 'SYNC_STARTED' | 'SYNC_FINISHED' | 'SYNC_FAILED';

export interface EventPayloads {
  TABLE_UPDATED: { tableName: string };
  SYNC_STARTED: undefined;
  SYNC_FINISHED: undefined;
  SYNC_FAILED: { error: string };
}

type EventCallback<K extends EventType> = (payload: EventPayloads[K]) => void;

class EventBus {
  private listeners: Map<EventType, Set<Function>> = new Map();

  subscribe<K extends EventType>(event: K, callback: EventCallback<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(callback);
    return () => {
      set.delete(callback);
    };
  }

  publish<K extends EventType>(event: K, payload?: EventPayloads[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((cb) => {
        try {
          cb(payload as EventPayloads[K]);
        } catch (e) {
          console.error(`[EventBus] Error in listener for event ${event}:`, e);
        }
      });
    }
  }
}

export const eventBus = new EventBus();

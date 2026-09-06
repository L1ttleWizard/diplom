import { OscilloscopeEvent } from '../../domain/events/events';

export type EventCallback<T extends OscilloscopeEvent = OscilloscopeEvent> = (event: T) => void;

export interface IEventBus {
  publish(event: OscilloscopeEvent): void;
  publishAll(events: readonly OscilloscopeEvent[]): void;
  subscribe<T extends OscilloscopeEvent = OscilloscopeEvent>(
    eventType: T['type'] | '*',
    callback: EventCallback<T>
  ): () => void;
}

export class EventBus implements IEventBus {
  private _listeners: Map<string, Set<EventCallback<any>>> = new Map();

  public publish(event: OscilloscopeEvent): void {
    // Notify type-specific listeners
    const specific = this._listeners.get(event.type);
    if (specific) {
      for (const cb of specific) {
        try {
          cb(event);
        } catch (err) {
          console.error(`Error in event listener for ${event.type}:`, err);
        }
      }
    }

    // Notify wildcard '*' listeners
    const wildcards = this._listeners.get('*');
    if (wildcards) {
      for (const cb of wildcards) {
        try {
          cb(event);
        } catch (err) {
          console.error(`Error in wildcard event listener:`, err);
        }
      }
    }
  }

  public publishAll(events: readonly OscilloscopeEvent[]): void {
    for (const evt of events) {
      this.publish(evt);
    }
  }

  public subscribe<T extends OscilloscopeEvent = OscilloscopeEvent>(
    eventType: T['type'] | '*',
    callback: EventCallback<T>
  ): () => void {
    let set = this._listeners.get(eventType);
    if (!set) {
      set = new Set();
      this._listeners.set(eventType, set);
    }
    set.add(callback);

    return () => {
      const currentSet = this._listeners.get(eventType);
      if (currentSet) {
        currentSet.delete(callback);
        if (currentSet.size === 0) {
          this._listeners.delete(eventType);
        }
      }
    };
  }

  public clear(): void {
    this._listeners.clear();
  }
}

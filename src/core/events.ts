/**
 * Tiny typed event bus. The simulation emits events; the UI and renderer
 * listen (toasts, floating "+$" text, future sound effects, achievements...).
 */
export interface GameEvents {
  flightLanded: { planeId: string; from: string; to: string; passengers: number; net: number };
  planeBought: { planeId: string };
  airportUnlocked: { code: string };
}

type Handler<T> = (payload: T) => void;

class EventBus {
  private handlers: { [K in keyof GameEvents]?: Handler<GameEvents[K]>[] } = {};
  /** While muted (e.g. during offline catch-up), events are dropped. */
  muted = false;

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    const list = (this.handlers[type] ??= []) as Handler<GameEvents[K]>[];
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    if (this.muted) return;
    for (const fn of (this.handlers[type] ?? []) as Handler<GameEvents[K]>[]) fn(payload);
  }
}

export const events = new EventBus();

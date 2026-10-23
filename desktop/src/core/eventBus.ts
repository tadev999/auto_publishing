type Listener = (...args: any[]) => void;

class EventBus {
  private events = new Map<string, Set<Listener>>();

  on(event: string, fn: Listener): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(fn);
    return () => this.off(event, fn);
  }

  off(event: string, fn: Listener): void {
    this.events.get(event)?.delete(fn);
  }

  emit(event: string, ...args: any[]): void {
    this.events.get(event)?.forEach((fn) => {
      try {
        fn(...args);
      } catch (err) {
        console.error(`Error in event listener for ${event}:`, err);
      }
    });
  }
}

export const eventBus = new EventBus();

/** Snapshot subscriptions so removals during notification do not skip callbacks. */
export class Emitter<Events> {
  private readonly listeners = new Map<keyof Events, Set<unknown>>();

  constructor(private readonly onError: () => void) {}

  on<K extends keyof Events>(
    name: K,
    handler: (value: Events[K]) => void | Promise<void>,
  ): () => void {
    const subscription = (value: Events[K]): void | Promise<void> => handler(value);
    const channel = this.listeners.get(name) ?? new Set();
    channel.add(subscription);
    this.listeners.set(name, channel);

    return () => {
      channel.delete(subscription);
    };
  }

  emit<K extends keyof Events>(name: K, value: Events[K], report = true): void {
    const subscribers = [...(this.listeners.get(name) ?? [])];

    for (const subscriber of subscribers) {
      try {
        const result = (subscriber as (input: Events[K]) => void | Promise<void>)(value);

        if (result) {
          void Promise.resolve(result).catch(() => {
            if (report) {
              this.onError();
            }
          });
        }
      } catch {
        if (report) {
          this.onError();
        }
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

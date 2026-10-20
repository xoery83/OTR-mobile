// One foreground timer follows durable C3 retry and lease deadlines for one Account generation.
export function createCaptureProcessingForeground(input: {
  isActive(): boolean;
  now(): number;
  subscribeAppState(listener: (active: boolean) => void): () => void;
  subscribeAccountChange(listener: () => void): () => void;
  run(): Promise<{ processedCount: number }>;
  nextWake(): Promise<number | null>;
  changed(): void;
}) {
  let active = input.isActive();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let version = 0;
  let running: Promise<void> | null = null;
  function clear() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  async function schedule() {
    const current = ++version;
    clear();
    if (stopped || !active) return;
    try {
      const due = await input.nextWake();
      if (stopped || !active || current !== version || due === null) return;
      timer = setTimeout(
        () => {
          timer = null;
          void run();
        },
        Math.max(1000, due - input.now()),
      );
    } catch {
      // Account generation or SQLite availability changed; the next foreground read rebinds.
    }
  }
  async function run() {
    if (stopped || !active) return;
    if (running) return running;
    running = (async () => {
      try {
        const result = await input.run();
        if (!stopped && result.processedCount) input.changed();
      } catch {
        // Durable queue rows remain; schedule retries from the owning repository.
      } finally {
        running = null;
        void schedule();
      }
    })();
    return running;
  }
  const unsubscribeApp = input.subscribeAppState((next) => {
    active = next;
    if (next) void run();
    else {
      ++version;
      clear();
    }
  });
  const unsubscribeAccount = input.subscribeAccountChange(() => stop());
  function stop() {
    if (stopped) return;
    stopped = true;
    ++version;
    clear();
    unsubscribeApp();
    unsubscribeAccount();
  }
  return { start: () => void schedule(), refresh: () => void schedule(), stop };
}

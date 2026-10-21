export type DictationError =
  "permission" | "unavailable" | "interrupted" | "failed" | "timeout";
export type DictationState = {
  status: "idle" | "starting" | "listening" | "finishing" | "error";
  error?: DictationError;
};
export type DictationNative = {
  start(sessionId: string, locale: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  addListener(
    event: "transcript" | "state",
    listener: (value: unknown) => void,
  ): { remove(): void };
};
const errors = new Set<DictationError>([
  "permission",
  "unavailable",
  "interrupted",
  "failed",
  "timeout",
]);
let nextSession = 0;

// A live session owns only its appended draft text, never an Import submission.
export function createLocalDictation(options: {
  load(): Promise<DictationNative>;
  onText(text: string): void;
  onState(state: DictationState): void;
}) {
  type Session = {
    id: string;
    before: string;
    native?: DictationNative;
    listeners: { remove(): void }[];
  };
  let active: Session | null = null;
  let disposed = false;
  const publish = (state: DictationState) => {
    if (!disposed) options.onState(state);
  };
  const release = (session: Session) => {
    session.listeners.splice(0).forEach((listener) => listener.remove());
    if (active === session) active = null;
  };
  const cancelNative = (session: Session) => {
    void session.native?.cancel(session.id).catch(() => {});
  };
  const fail = (session: Session, error: DictationError, cancel = true) => {
    if (active !== session) return;
    release(session);
    if (cancel) cancelNative(session);
    publish({ status: "error", error });
  };
  return {
    async start(before: string, locale: string) {
      if (disposed || active) return;
      const session: Session = {
        id: `dictation-${Date.now()}-${++nextSession}`,
        before,
        listeners: [],
      };
      active = session;
      publish({ status: "starting" });
      try {
        const native = await options.load();
        if (active !== session || disposed) return;
        session.native = native;
        session.listeners.push(
          native.addListener("transcript", (value) => {
            if (active !== session || !value || typeof value !== "object") return;
            const event = value as Record<string, unknown>;
            if (event.sessionId !== session.id) return;
            if (typeof event.text !== "string" || event.text.length > 65536) {
              fail(session, "failed");
              return;
            }
            const separator = before && !/\s$/.test(before) && event.text ? " " : "";
            options.onText(before + separator + event.text);
          }),
        );
        session.listeners.push(
          native.addListener("state", (value) => {
            if (active !== session || !value || typeof value !== "object") return;
            const event = value as Record<string, unknown>;
            if (event.sessionId !== session.id) return;
            if (event.status === "error") {
              fail(
                session,
                errors.has(event.error as DictationError)
                  ? (event.error as DictationError)
                  : "failed",
                false,
              );
            } else if (event.status === "stopped") {
              release(session);
              publish({ status: "idle" });
            } else if (
              event.status === "starting" ||
              event.status === "listening" ||
              event.status === "finishing"
            ) {
              publish({ status: event.status });
            }
          }),
        );
        await native.start(session.id, locale);
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        fail(
          session,
          errors.has(code as DictationError) ? (code as DictationError) : "unavailable",
        );
      }
    },
    async stop() {
      const session = active;
      if (!session?.native) return;
      publish({ status: "finishing" });
      try {
        await session.native.stop(session.id);
      } catch {
        fail(session, "failed");
      }
    },
    cancel() {
      const session = active;
      if (!session) return;
      release(session);
      cancelNative(session);
      options.onText(session.before);
      publish({ status: "idle" });
    },
    end() {
      if (active) {
        const session = active;
        release(session);
        cancelNative(session);
        publish({ status: "idle" });
      }
    },
    dispose() {
      disposed = true;
      if (active) {
        const session = active;
        release(session);
        cancelNative(session);
      }
    },
  };
}

// Session-local choices only. Native references are unverified and may expire.
export type CaptureSelection = Readonly<{
  source: "files" | "photos";
  temporaryUri: string | null;
  name: string | null;
  typeHint: string | null;
  size?: number;
  width?: number;
  height?: number;
}>;
export type StagedCaptureItem = CaptureSelection &
  Readonly<{
    stagingId: number;
    availability: "unverified" | "unavailable";
  }>;
export type CaptureStagingSnapshot = Readonly<{
  items: readonly StagedCaptureItem[];
  selecting: boolean;
  error: "picker" | null;
}>;
export const emptyCaptureStaging: CaptureStagingSnapshot = Object.freeze({
  items: Object.freeze([]),
  selecting: false,
  error: null,
});
export type CapturePicker = (
  source: CaptureSelection["source"],
) => Promise<readonly CaptureSelection[]>;

// The host owns identity admission/fencing; staging has no Account or Guest model.
export function createCaptureStaging(picker: CapturePicker, isCurrent: () => boolean) {
  let snapshot = emptyCaptureStaging;
  let disposed = false;
  let sequence = 0;
  let epoch = 0;
  const listeners = new Set<() => void>();
  const current = () => !disposed && isCurrent();
  function publish(next: CaptureStagingSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => (current() ? snapshot : emptyCaptureStaging),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async pick(source: CaptureSelection["source"]) {
      if (!current() || snapshot.selecting) return;
      const request = epoch;
      publish({ ...snapshot, selecting: true, error: null });
      try {
        const selected = await picker(source);
        if (!current() || request !== epoch) return;
        publish({
          items: [
            ...snapshot.items,
            ...selected.map((item) => ({
              ...item,
              stagingId: ++sequence,
              availability: item.temporaryUri
                ? ("unverified" as const)
                : ("unavailable" as const),
            })),
          ],
          selecting: false,
          error: null,
        });
      } catch {
        if (current() && request === epoch)
          publish({ ...snapshot, selecting: false, error: "picker" });
      }
    },
    remove(stagingId: number) {
      if (current())
        publish({
          ...snapshot,
          items: snapshot.items.filter((item) => item.stagingId !== stagingId),
        });
    },
    cancel() {
      epoch += 1;
      publish(emptyCaptureStaging);
    },
    attach() {
      disposed = false;
      publish(snapshot);
      return () => {
        disposed = true;
        epoch += 1;
        snapshot = emptyCaptureStaging;
      };
    },
  };
}

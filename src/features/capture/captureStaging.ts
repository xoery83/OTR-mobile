// Session-local choices only. Native references are unverified and may expire.
export type CaptureSelection = Readonly<{
  source: "files" | "photos" | "camera";
  // Only a native provider may supply verified selection identity/revision.
  identity?: Readonly<{ key: string; revision: string }>;
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
export type CaptureDraftOwner = Readonly<{ accountId: string; tripPrior: string | null }>;
export type StagedCaptureText = Readonly<{
  source: "magic_input";
  stagingId: number;
  text: string;
}>;
export type CaptureDraftItem = StagedCaptureItem | StagedCaptureText;
export type CaptureDraftSnapshot = Readonly<{
  items: readonly CaptureDraftItem[];
  editorText: string;
  selecting: boolean;
  error: "picker" | null;
}>;
const emptyCaptureDraft: CaptureDraftSnapshot = Object.freeze({
  items: Object.freeze([]),
  editorText: "",
  selecting: false,
  error: null,
});
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
  isCurrent?: () => boolean,
) => Promise<readonly CaptureSelection[]>;

// The host owns authenticated admission; the optional owner only keys its draft.
export function createCaptureStaging(
  picker: CapturePicker,
  isCurrent: () => boolean,
  owner?: CaptureDraftOwner,
) {
  const draftOwner = owner ? Object.freeze({ ...owner }) : undefined;
  if (
    draftOwner &&
    (!draftOwner.accountId ||
      draftOwner.accountId.length > 128 ||
      (draftOwner.tripPrior !== null && !draftOwner.tripPrior))
  )
    throw new Error("CAPTURE_DRAFT_OWNER_INVALID");
  let currentLease = isCurrent;
  let hidden = false;
  let invocation = 0;
  let editorText = "";
  let texts: readonly StagedCaptureText[] = [];
  let draftSnapshot = emptyCaptureDraft;
  let snapshot = emptyCaptureStaging;
  let disposed = false;
  let sequence = 0;
  let epoch = 0;
  const listeners = new Set<() => void>();
  const current = () => !disposed && !hidden && currentLease();
  function publish(next: CaptureStagingSnapshot) {
    snapshot = next;
    draftSnapshot = Object.freeze({
      items: Object.freeze(
        [...snapshot.items, ...texts].sort((a, b) => a.stagingId - b.stagingId),
      ),
      editorText,
      selecting: snapshot.selecting,
      error: snapshot.error,
    });
    listeners.forEach((listener) => listener());
  }
  function hide() {
    epoch += 1;
    hidden = true;
    publish({ ...snapshot, selecting: false, error: null });
  }
  function clear() {
    epoch += 1;
    editorText = "";
    texts = [];
    publish(emptyCaptureStaging);
  }
  return {
    getDraftSnapshot: () => (draftOwner && current() ? draftSnapshot : emptyCaptureDraft),
    resume(requestedOwner: CaptureDraftOwner, freshLease: () => boolean) {
      if (
        !draftOwner ||
        requestedOwner.accountId !== draftOwner.accountId ||
        requestedOwner.tripPrior !== draftOwner.tripPrior ||
        !freshLease()
      )
        return false;
      epoch += 1;
      invocation += 1;
      currentLease = freshLease;
      disposed = false;
      hidden = false;
      publish({ ...snapshot, selecting: false, error: null });
      return true;
    },
    setEditorText(text: string) {
      if (!draftOwner || !current()) return;
      editorText = text;
      publish({ ...snapshot });
    },
    addEditorText() {
      if (!draftOwner || !current() || !editorText.trim()) return;
      const duplicate = texts.some((item) => item.text === editorText);
      if (!duplicate)
        texts = [
          ...texts,
          Object.freeze({
            source: "magic_input",
            stagingId: ++sequence,
            text: editorText,
          }),
        ];
      editorText = "";
      publish({ ...snapshot });
      return duplicate ? "duplicate" : "added";
    },
    prepareSubmit(): readonly CaptureDraftItem[] | null {
      if (!draftOwner || !current() || snapshot.selecting) return null;
      // Pre-submit only: unsupported provenance is never relabelled for C2.
      const roster = [...draftSnapshot.items];
      if (editorText.trim() && !texts.some((item) => item.text === editorText))
        roster.push({ source: "magic_input", stagingId: sequence + 1, text: editorText });
      return Object.freeze(
        roster.map((item) =>
          Object.freeze({
            ...item,
            ...(item.source !== "magic_input" && item.identity
              ? { identity: Object.freeze({ ...item.identity }) }
              : {}),
          }),
        ),
      );
    },
    hide() {
      if (draftOwner) hide();
      else clear();
    },
    clearAllConfirmed() {
      if (current()) clear();
    },
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
        const selected = await picker(source, () => current() && request === epoch);
        if (!current() || request !== epoch) return;
        if (selected.some((item) => item.source !== source))
          throw new Error("CAPTURE_PICKER_SOURCE_MISMATCH");
        const items = [...snapshot.items];
        let duplicates = 0;
        for (const item of selected) {
          const identity = item.identity;
          if (
            identity?.key &&
            identity.revision &&
            items.some(
              (prior) =>
                prior.source === item.source &&
                prior.identity?.key === identity.key &&
                prior.identity.revision === identity.revision,
            )
          ) {
            duplicates += 1;
            continue;
          }
          items.push({
            ...item,
            ...(identity ? { identity: Object.freeze({ ...identity }) } : {}),
            stagingId: ++sequence,
            availability: item.temporaryUri ? "unverified" : "unavailable",
          });
        }
        const added = items.length - snapshot.items.length;
        publish({ items, selecting: false, error: null });
        return { added, duplicates };
      } catch {
        if (current() && request === epoch)
          publish({ ...snapshot, selecting: false, error: "picker" });
      }
    },
    remove(stagingId: number) {
      if (current()) {
        texts = texts.filter((item) => item.stagingId !== stagingId);
        publish({
          ...snapshot,
          items: snapshot.items.filter((item) => item.stagingId !== stagingId),
        });
      }
    },
    cancel: clear,
    attach() {
      const attachment = ++invocation;
      disposed = false;
      publish(snapshot);
      return () => {
        if (draftOwner && attachment !== invocation) return;
        disposed = true;
        if (draftOwner) hide();
        else {
          epoch += 1;
          snapshot = emptyCaptureStaging;
        }
      };
    },
  };
}

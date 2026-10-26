// Session-local choices only. Native references are unverified and may expire.
export type CaptureSelection = Readonly<{
  source: "files" | "photos" | "camera";
  // Only a native provider may supply verified selection identity/revision.
  identity?: Readonly<{ key: string; revision: string }>;
  temporaryUri: string | null;
  name: string | null;
  typeHint: string | null;
  size?: number;
  // Session-only native lease; never serialized into a submission or Source.
  release?: () => void;
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
export type CapturePastedImage = Readonly<{
  token: string;
  uri: string;
  byteSize: number;
  mimeType: string;
  source: "clipboard";
  representation: "item-provider";
}>;
export type StagedCapturePaste = Readonly<{
  source: "clipboard";
  stagingId: number;
  token: string;
  temporaryUri: string;
  name: null;
  typeHint: string;
  size: number;
  availability: "unverified";
}>;
export type CaptureDraftItem = StagedCaptureItem | StagedCaptureText | StagedCapturePaste;
export type CaptureTripTarget = Readonly<{ id: string; name: string }> | null;
export type CaptureDraftSnapshot = Readonly<{
  tripTarget?: CaptureTripTarget;
  targetRevision?: number;
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
  let tripTarget: CaptureTripTarget | undefined;
  let targetRevision = 0;
  let texts: readonly StagedCaptureText[] = [];
  let pasted: readonly StagedCapturePaste[] = [];
  const pasteReleases = new Map<string, (tokens: readonly string[]) => void>();
  const releasePaste = (items: readonly StagedCapturePaste[]) => {
    for (const item of items) {
      const release = pasteReleases.get(item.token);
      pasteReleases.delete(item.token);
      release?.([item.token]);
    }
  };
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
        [...snapshot.items, ...texts, ...pasted].sort(
          (a, b) => a.stagingId - b.stagingId,
        ),
      ),
      editorText,
      ...(tripTarget !== undefined ? { tripTarget } : {}),
      ...(targetRevision ? { targetRevision } : {}),
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
    targetRevision += 1;
    editorText = "";
    texts = [];
    releasePaste(pasted);
    snapshot.items.forEach((item) => item.release?.());
    pasted = [];
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
    // The immutable owner keys the launching draft. This is only its chosen prior.
    setTripTarget(target: CaptureTripTarget) {
      if (!draftOwner || !current() || snapshot.selecting) return false;
      if (target && (!target.id || !target.name)) return false;
      epoch += 1;
      targetRevision += 1;
      tripTarget = target ? Object.freeze({ ...target }) : null;
      publish({ ...snapshot });
      return true;
    },
    stagePastedImages(
      images: readonly CapturePastedImage[],
      release: (tokens: readonly string[]) => void,
    ) {
      const fresh = images.filter((item) => !pasteReleases.has(item.token));
      const reject = () => {
        release(fresh.map((item) => item.token));
        return false;
      };
      if (!draftOwner || !current() || snapshot.selecting) return reject();
      const supported = new Set([
        "image/png",
        "image/jpeg",
        "image/heic",
        "image/heif",
        "image/webp",
      ]);
      if (
        fresh.length > 10 ||
        pasted.length + fresh.length > 10 ||
        new Set(fresh.map((i) => i.token)).size !== fresh.length ||
        fresh.some(
          (i) =>
            !i.token ||
            i.source !== "clipboard" ||
            i.representation !== "item-provider" ||
            !i.uri.startsWith("file://") ||
            !Number.isSafeInteger(i.byteSize) ||
            i.byteSize <= 0 ||
            !supported.has(i.mimeType),
        ) ||
        pasted.reduce((sum, i) => sum + i.size, 0) +
          fresh.reduce((sum, i) => sum + i.byteSize, 0) >
          20 * 1024 * 1024
      )
        return reject();
      pasted = [
        ...pasted,
        ...fresh.map((item) => {
          pasteReleases.set(item.token, release);
          return Object.freeze({
            source: "clipboard" as const,
            stagingId: ++sequence,
            token: item.token,
            temporaryUri: item.uri,
            name: null,
            typeHint: item.mimeType,
            size: item.byteSize,
            availability: "unverified" as const,
          });
        }),
      ];
      publish({ ...snapshot });
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
            ...(item.source !== "magic_input" &&
            item.source !== "clipboard" &&
            item.identity
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
        if (!current() || request !== epoch) {
          selected.forEach((item) => item.release?.());
          return;
        }
        if (selected.some((item) => item.source !== source)) {
          selected.forEach((item) => item.release?.());
          throw new Error("CAPTURE_PICKER_SOURCE_MISMATCH");
        }
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
            item.release?.();
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
        snapshot.items
          .filter((item) => item.stagingId === stagingId)
          .forEach((item) => item.release?.());
        releasePaste(pasted.filter((item) => item.stagingId === stagingId));
        pasted = pasted.filter((item) => item.stagingId !== stagingId);
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
          snapshot.items.forEach((item) => item.release?.());
          snapshot = emptyCaptureStaging;
        }
      };
    },
  };
}

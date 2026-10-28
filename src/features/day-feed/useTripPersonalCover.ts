import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { readLocalTripPersonalCoverRepository } from "@/data/repositories/tripPersonalCoverRepository";
import type { TripCoverChoice } from "@/domain/trip/tripCoverAssets";

type Repository = Awaited<ReturnType<typeof readLocalTripPersonalCoverRepository>>;
type Selection = NonNullable<Awaited<ReturnType<Repository["read"]>>>;
type Intent = {
  key: string;
  context: Selection["context"];
  input: Parameters<Repository["save"]>[1];
};
const rejectedSelections = new Set([
  "TRIP_COVER_ACCESS_UNAVAILABLE",
  "TRIP_COVER_ACCESS_CHANGED",
  "TRIP_COVER_LOCAL_CONFLICT",
  "TRIP_COVER_PHOTO_UNAVAILABLE",
  "TRIP_COVER_INVALID",
]);

// One selected Trip consumer; list cards use the owning discovery bulk overlay.
export function useTripPersonalCover(tripId: string | null) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const key = JSON.stringify([generation, tripId]);
  const active = useRef<string | null>(key);
  const request = useRef(0);
  const busy = useRef(false);
  const pending = useRef<Intent | null>(null);
  const [read, setRead] = useState<{
    key: string;
    selection: Selection;
    repository: Repository;
  } | null>(null);
  const current = useCallback(
    () => active.current === key && generation === getAccountGeneration(),
    [key, generation],
  );
  const reload = useCallback(async () => {
    const ticket = ++request.current;
    if (!tripId || !current()) return null;
    try {
      const repository = await readLocalTripPersonalCoverRepository();
      if (!current()) return null;
      const selection = await repository.read(tripId);
      if (!current() || ticket !== request.current) return null;
      setRead(selection ? { key, selection, repository } : null);
      return selection;
    } catch {
      if (current() && ticket === request.current) setRead(null);
      return null;
    }
  }, [tripId, current, key]);
  useLayoutEffect(() => {
    active.current = key;
    request.current++;
    return () => {
      active.current = null;
    };
  }, [key]);
  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);
  const snapshot =
    generation === getAccountGeneration() && read?.key === key ? read : null;
  useEffect(() => {
    if (!snapshot) return;
    return snapshot.repository.subscribe(snapshot.selection.context, () => void reload());
  }, [snapshot, reload]);

  const open = async () => {
    if (busy.current || !current()) return false;
    const selection = await reload();
    if (!selection || !current()) return false;
    pending.current = null;
    return true;
  };
  const select = async (after: TripCoverChoice | null) => {
    if (busy.current || !current()) throw new Error("TRIP_COVER_CONTEXT_CHANGED");
    busy.current = true;
    try {
      let intent = pending.current;
      // An unknown result retries the exact owning tuple; a different choice starts fresh.
      if (!intent || intent.key !== key || intent.input.after !== after) {
        pending.current = null;
        const selection = await reload();
        if (!selection || !current()) throw new Error("TRIP_COVER_UNAVAILABLE");
        intent = {
          key,
          context: selection.context,
          input: {
            beforeRaw: selection.raw,
            expectedRevision: selection.selectionRevision,
            expectedAccessToken: selection.accessToken,
            after,
          },
        };
        pending.current = intent;
      }
      const repository = await readLocalTripPersonalCoverRepository();
      if (!current()) throw new Error("TRIP_COVER_CONTEXT_CHANGED");
      const committed = await repository.save(intent.context, intent.input);
      if (!current()) throw new Error("TRIP_COVER_CONTEXT_CHANGED");
      pending.current = null;
      setRead({ key, selection: committed, repository });
      await reload();
    } catch (error) {
      if (error instanceof Error && rejectedSelections.has(error.message)) {
        pending.current = null;
        if (current()) await reload();
      }
      throw error;
    } finally {
      busy.current = false;
    }
  };
  return { selection: snapshot?.selection ?? null, open, select };
}

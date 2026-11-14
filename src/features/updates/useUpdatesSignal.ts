import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { assertAccountRequestGeneration } from "@/data/auth/accountRequestContext";
import { openDefaultUpdatesInbox } from "@/data/operations/defaultUpdatesInbox";
import {
  readDefaultUniversalImportUpdates,
  importUpdateReadVersion,
  type UniversalImportUpdate,
} from "@/data/operations/universalImportUpdates";
import { readImportUpdateVersions } from "@/data/repositories/importUpdateReadStateRepository";
import { subscribeCaptureProcessingActivity } from "@/data/operations/captureProcessingActivity";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";

// Derived read-only signal; Inbox filters/read actions and owning Review stay separate.
export function useUpdatesSignal(
  tripId: string | null,
  pathname: string,
  enabled: boolean,
) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const target = JSON.stringify([tripId, pathname, enabled, generation]);
  const owner = useMemo(() => Symbol(target), [target]);
  const lease = useRef<symbol | null>(null);
  const [observed, setObserved] = useState<{
    owner: symbol;
    count: number | null;
  } | null>(null);
  useLayoutEffect(() => {
    lease.current = owner;
    return () => {
      if (lease.current === owner) lease.current = null;
    };
  }, [owner]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true,
      running = false,
      active = AppState.currentState === "active",
      request = 0;
    const current = () =>
      alive && lease.current === owner && generation === getAccountGeneration();
    let importCards: readonly UniversalImportUpdate[] = [],
      importOwner: AccountRequestContext | null = null;
    let importObserved = false,
      importRunning = false,
      importChanged = false;
    let importRevision = 0,
      refreshAgain = false;
    let expected = new Set<string>(),
      coverageIds = new Set<string>();
    const refresh = async () => {
      if (!enabled || !active || !current()) return;
      if (running) return;
      running = true;
      const ticket = ++request;
      try {
        const reader = await openDefaultUpdatesInbox();
        if (!current() || ticket !== request) return;
        assertAccountRequestGeneration(reader.context);
        const signal = await reader.repository.unreadActionableSignal(
          reader.context,
          tripId,
        );
        assertAccountRequestGeneration(reader.context);
        if (!current() || ticket !== request) return;
        const importTicket = importRevision,
          observed = importObserved,
          ownerContext = importOwner;
        const eligible = importCards
          .filter((card) => card.attention)
          .map((card) => ({
            batchId: card.batchId,
            version: importUpdateReadVersion(card),
          }));
        const versions = ownerContext
          ? await readImportUpdateVersions(
              ownerContext,
              eligible.map((card) => card.batchId),
            )
          : {};
        if (!current() || ticket !== request) return;
        if (importTicket !== importRevision) {
          refreshAgain = true;
          return;
        }
        const extra = eligible
          .filter((card) => versions[card.batchId] !== card.version)
          .map((card) => card.batchId);
        const count =
          observed &&
          signal.coverage === "COMPLETE" &&
          Number.isSafeInteger(signal.unreadActionableCards) &&
          signal.unreadActionableCards !== null &&
          signal.unreadActionableCards >= 0
            ? signal.batchIds
              ? new Set([...signal.batchIds, ...extra]).size
              : signal.unreadActionableCards + new Set(extra).size
            : null;
        setObserved({ owner, count });
      } catch {
        if (current() && ticket === request) setObserved({ owner, count: null });
      } finally {
        running = false;
        if (refreshAgain && current() && active) {
          refreshAgain = false;
          void refresh();
        }
      }
    };
    // Remote Task reads run on navigation/foreground/activity changes, never on the two-second read-preference poll.
    const refreshImport = async () => {
      if (!active || !current()) return;
      if (importRunning) {
        importChanged = true;
        return;
      }
      importRunning = true;
      importObserved = false;
      expected = new Set();
      coverageIds = new Set();
      importCards = [];
      importRevision++;
      try {
        await readDefaultUniversalImportUpdates(
          tripId,
          () => current() && active,
          (cards, context, observedIds) => {
            if (current() && active) {
              importCards = cards;
              importOwner = context;
              coverageIds = new Set(observedIds ?? cards.map((card) => card.batchId));
              importRevision++;
            }
          },
          (jobs, context) => {
            if (current() && active) {
              importOwner = context;
              expected = new Set(
                jobs
                  .filter(
                    (job) =>
                      job.allInputsAccepted &&
                      (job.batch.context.tripPrior?.id ?? job.assignedTripId),
                  )
                  .map((job) => job.batch.batchId),
              );
            }
          },
          undefined,
          true,
        );
        if (current() && active) {
          importObserved = [...expected].every((id) => coverageIds.has(id));
          importRevision++;
        }
      } catch {
        importObserved = false;
      } finally {
        importRunning = false;
        if (current() && active) {
          void refresh();
          if (importChanged) {
            importChanged = false;
            void refreshImport();
          }
        }
      }
    };
    const stopActivity = subscribeCaptureProcessingActivity((accountId) => {
      if (!importOwner || accountId === importOwner.accountId) void refreshImport();
    });
    void refreshImport();
    void refresh();
    // Same foreground current-access polling pattern as the existing Search detail.
    const timer = setInterval(() => {
      void refresh();
    }, 2000);
    const subscription = AppState.addEventListener("change", (state) => {
      active = state === "active";
      ++request;
      if (current()) setObserved({ owner, count: null });
      if (active) {
        void refreshImport();
        void refresh();
      }
    });
    return () => {
      alive = false;
      ++request;
      clearInterval(timer);
      stopActivity();
      subscription.remove();
    };
  }, [tripId, owner, enabled, generation]);
  return enabled && observed?.owner === owner ? observed.count : null;
}

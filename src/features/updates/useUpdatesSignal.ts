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
    const refresh = async () => {
      if (!enabled || !active || running || !current()) return;
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
        const count =
          signal.coverage === "COMPLETE" &&
          Number.isSafeInteger(signal.unreadActionableCards) &&
          signal.unreadActionableCards !== null &&
          signal.unreadActionableCards >= 0
            ? signal.unreadActionableCards
            : null;
        setObserved({ owner, count });
      } catch {
        if (current() && ticket === request) setObserved({ owner, count: null });
      } finally {
        running = false;
      }
    };
    void refresh();
    // Same foreground current-access polling pattern as the existing Search detail.
    const timer = setInterval(() => {
      void refresh();
    }, 2000);
    const subscription = AppState.addEventListener("change", (state) => {
      active = state === "active";
      ++request;
      if (current()) setObserved({ owner, count: null });
      if (active) void refresh();
    });
    return () => {
      alive = false;
      ++request;
      clearInterval(timer);
      subscription.remove();
    };
  }, [tripId, owner, enabled, generation]);
  return enabled && observed?.owner === owner ? observed.count : null;
}

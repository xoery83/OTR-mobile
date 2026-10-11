import { useEffect, useState } from "react";
import { AppState } from "react-native";

const snapshot = () => ({
  instant: new Date(Math.floor(Date.now() / 60000) * 60000).toISOString(),
  deviceZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

export function subscribeMinuteClock(
  publish: (value: ReturnType<typeof snapshot>) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = AppState.currentState === "active";
  const update = () => {
    if (timer) clearTimeout(timer);
    if (!active) return;
    publish(snapshot());
    timer = setTimeout(update, 60000 - (Date.now() % 60000));
  };
  const subscription = AppState.addEventListener("change", (state) => {
    active = state === "active";
    if (timer) clearTimeout(timer);
    update();
  });
  update();
  return () => {
    active = false;
    if (timer) clearTimeout(timer);
    subscription.remove();
  };
}

// One subscription per feed; explicit query-zone changes also refresh its snapshot.
export function useMinuteClock(queryZone: string | null) {
  const [clock, setClock] = useState(snapshot);
  useEffect(
    () =>
      subscribeMinuteClock((next) =>
        setClock((previous) =>
          previous.instant === next.instant && previous.deviceZone === next.deviceZone
            ? previous
            : next,
        ),
      ),
    [queryZone],
  );
  return clock;
}

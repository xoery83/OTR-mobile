import * as SecureStore from "expo-secure-store";
import { nextDayHeaderStyle, type DayHeaderStyle } from "@/domain/trip/dayHeaderStyle";

// Like the UI locale preference: device-local SecureStore, no Account or business writes.
export function createDayHeaderStylePreference(
  storage: Pick<typeof SecureStore, "getItemAsync" | "setItemAsync"> = SecureStore,
) {
  const entries = new Map<
    string,
    {
      style: DayHeaderStyle;
      revision: number;
      hydration?: Promise<void>;
      writes: Promise<void>;
      listeners: Set<() => void>;
    }
  >();
  function entry(tripId: string) {
    let value = entries.get(tripId);
    if (!value) {
      value = {
        style: "A",
        revision: 0,
        writes: Promise.resolve(),
        listeners: new Set(),
      };
      entries.set(tripId, value);
    }
    return value;
  }
  const key = (tripId: string) => `otr-day-header-style-v1-${encodeURIComponent(tripId)}`;
  function publish(value: ReturnType<typeof entry>, style: DayHeaderStyle) {
    if (value.style === style) return;
    value.style = style;
    for (const notify of value.listeners) notify();
  }
  return {
    get: (tripId: string) => entry(tripId).style,
    subscribe(tripId: string, notify: () => void) {
      const value = entry(tripId);
      value.listeners.add(notify);
      return () => {
        value.listeners.delete(notify);
      };
    },
    hydrate(tripId: string) {
      const value = entry(tripId),
        revision = value.revision;
      return (value.hydration ??= (async () => {
        try {
          const saved = await storage.getItemAsync(key(tripId));
          if (
            revision === 0 &&
            value.revision === revision &&
            (saved === "A" || saved === "B" || saved === "C" || saved === "D")
          )
            publish(value, saved);
        } catch {
          /* Storage unavailable: keep the same session preference. */
        }
      })());
    },
    cycle(tripId: string) {
      const value = entry(tripId),
        style = nextDayHeaderStyle(value.style);
      value.revision++;
      publish(value, style);
      value.writes = value.writes.then(async () => {
        try {
          await storage.setItemAsync(key(tripId), style);
        } catch {
          /* Failed persistence never blocks or reverses a local choice. */
        }
      });
      return value.writes;
    },
  };
}
export const dayHeaderStylePreference = createDayHeaderStylePreference();

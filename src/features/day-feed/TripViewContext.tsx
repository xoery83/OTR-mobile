import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
export type TripView = { tripId: string; date: string; zone: string; generation: number };
const Context = createContext<{
  view: TripView | null;
  select: (view: TripView | null) => void;
}>({ view: null, select: () => {} });
export function TripViewProvider({ children }: { children: ReactNode }) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const [selected, select] = useState<TripView | null>(null);
  // Transient navigation context only; no selectedTrip persistence or canonical mutation.
  return (
    <Context.Provider
      value={{ view: selected?.generation === generation ? selected : null, select }}
    >
      {children}
    </Context.Provider>
  );
}
export const useTripView = () => useContext(Context);

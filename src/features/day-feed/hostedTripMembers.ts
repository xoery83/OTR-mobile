import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { TripPreparationSetup } from "@/data/repositories/tripPreparationSetupRepository";
import type { AddTravelerInput } from "@/features/people/AddTravelerSheet";
import { createContext } from "react";

export type TripMembersProps = {
  visible: boolean;
  tripId?: string;
  members: TripPreparationSetup["members"] | null;
  onClose(): void;
  onAddTraveler?(input: AddTravelerInput): Promise<void>;
  onInvitePerson?(personId: string): void;
};

export const hostedTripMembersEnabled: boolean = true;
export const TripMembersExitContext = createContext<{
  register(handler: () => void): () => void;
  allowClose(): void;
} | null>(null);

export function createTripMembersInvocations() {
  let sequence = 0;
  let active: { id: string; tripId: string; generation: number; props: TripMembersProps } | undefined;
  const listeners = new Set<() => void>();
  const publish = () => listeners.forEach(listener => listener());
  const read = (id: string | undefined) =>
    active?.id === id && active?.generation === getAccountGeneration() ? active?.props : undefined;
  return {
    stage(props: TripMembersProps) {
      if (!props.visible || !props.tripId) return undefined;
      const id = String(++sequence);
      active = { id, tripId: props.tripId, generation: getAccountGeneration(), props };
      publish();
      return id;
    },
    update(id: string | undefined, props: TripMembersProps) {
      if (!active || !read(id) || active.tripId !== props.tripId || !props.visible) return;
      if (active.props === props) return;
      active.props = props;
      publish();
    },
    read,
    release(id: string | undefined) {
      if (!active || active.id !== id) return;
      active = undefined;
      publish();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      const stop = subscribeAccountGeneration(listener);
      return () => { listeners.delete(listener); stop(); };
    },
  };
}

export const tripMembersInvocations = createTripMembersInvocations();

import { createContext } from "react";
import type { ManualPlanFields } from "@/data/repositories/manualPlanRepository";
import { createItineraryPickerHandoff } from "./itineraryPickerHandoff";

export type Participation = ManualPlanFields["participation"];
export type ParticipantPickerProps = {
  value: Participation;
  options: readonly { personId: string; displayName: string; isCurrentActor?: boolean }[];
  disabled: boolean;
  onChange(value: Participation): void;
};

export const OpenParticipantPickerContext = createContext<((read: () => ParticipantPickerProps | null) => void) | null>(null);

export const createParticipantPickerHandoff = () => createItineraryPickerHandoff<ParticipantPickerProps>();

export const ParticipantPickerHandoffContext = createContext<ReturnType<typeof createParticipantPickerHandoff> | null>(null);

export function canApplyParticipation({ disabled, options, value }: Omit<ParticipantPickerProps, "onChange">, draft: Participation) {
  if (disabled) return false;
  if (draft.mode === "WHOLE_GROUP") return true;
  if (draft.mode === "SELF") return Boolean(draft.selfPersonId && draft.selfPersonId === value.selfPersonId);
  return draft.people.length > 0 && draft.people.every(id => options.some(person => person.personId === id));
}

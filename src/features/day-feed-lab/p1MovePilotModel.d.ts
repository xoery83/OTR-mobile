// Frozen WebLab pilot math plus Native no-resnap option; DEV only, never a Core write port.
export type MoveItem = {
  availability: string;
  date: string;
  time?: string | null;
  zone?: string | null;
  instant?: string | null;
  endInstant?: string | null;
  endDate?: string | null;
  endTime?: string | null;
};
export type MoveProposal = {
  status: "READY" | "UNAVAILABLE" | "UNQUALIFIED_TIME";
  date?: string;
  time?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  instant?: string | null;
  endInstant?: string | null;
  precision?: string;
  zone?: string | null;
  durationMinutes?: number | null;
};
export function snapMinutes(value: number, step?: number): number;
export function snapTenMinutes(value: number): number;
export function timeTick(value: number, step: number, offset: number): number | null;
export function scrubTicksPerSecond(offset: number): number;
export function clockForMinutes(minutes: number): string;
export function durationMinutes(item: MoveItem): number | null;
export function moveProposal(
  item: MoveItem,
  date: string,
  minutes: number,
  ntc?: boolean,
  retainedDuration?: number | null,
  preserveMinute?: boolean,
): MoveProposal;
export function samePlacement(item: MoveItem, proposal: MoveProposal): boolean;
export function applyMove(item: MoveItem, proposal: MoveProposal): MoveItem;

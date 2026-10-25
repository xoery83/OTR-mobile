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

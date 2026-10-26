export type MoveItem = {
  availability: string;
  date: string;
  dateScope?: "SAME_DAY";
  clockRole?: "CHECKIN" | "CHECKOUT";
  minuteRange?: readonly [number, number];
  time?: string | null;
  zone?: string | null;
  instant?: string | null;
  endInstant?: string | null;
  endDate?: string | null;
  endTime?: string | null;
};

export function moveProposalInScope(item: MoveItem, proposal: MoveProposal) {
  return (
    proposal.status === "READY" &&
    (item.dateScope !== "SAME_DAY" ||
      (proposal.date === item.date &&
        (!proposal.endDate || proposal.endDate === item.date)))
  );
}
export type MoveProposal = {
  status: "READY" | "UNAVAILABLE" | "UNQUALIFIED_TIME";
  unavailableReason?: "DAY_LOCK" | "STAY_ORDER";
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

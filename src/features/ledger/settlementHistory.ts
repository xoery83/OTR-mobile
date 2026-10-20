export function settlementHistory<
  T extends {
    lineageSequence?: number;
    balances: { memberId: string; netMinor: number }[];
    adjustmentDeltas?: { memberId: string; deltaMinor: number }[];
  },
>(rows: T[], actorMemberId: string) {
  let balanceMinor = 0;
  return [...rows]
    .sort((a, b) => (a.lineageSequence ?? 0) - (b.lineageSequence ?? 0))
    .map((row, index, lineage) => {
      const deltaMinor =
        (row.lineageSequence ?? 0) === 0
          ? null
          : ((row.adjustmentDeltas ?? []).find((item) => item.memberId === actorMemberId)
              ?.deltaMinor ?? 0);
      balanceMinor =
        deltaMinor === null
          ? (row.balances.find((item) => item.memberId === actorMemberId)?.netMinor ?? 0)
          : balanceMinor + deltaMinor;
      return { row, balanceMinor, deltaMinor, isCurrent: index === lineage.length - 1 };
    });
}

export function settlementBalanceLabel(minor: number) {
  return minor > 0 ? "You receive" : minor < 0 ? "You pay" : "Settled";
}

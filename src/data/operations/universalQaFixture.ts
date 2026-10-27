// shortcut: one fixed Train specimen; extend only for a qualified owning slice.
export function universalQaFixture(
  accountId: string | undefined,
  tripId: string | null | undefined,
  dev: boolean,
): string | undefined {
  if (
    !dev ||
    accountId !== "f4b059c5-8241-4ffb-aa15-37fa25474543" ||
    tripId !== "825f79b2-4a9d-4535-a62e-43000ca50c4a"
  )
    return undefined;
  return [
    "Synthetic QA only",
    "Service: Coastal QA Train",
    "Operator: Coastal QA Rail",
    "Service number: CQ101",
    "Transport subtype: TRAIN",
    "Departure date: 2026-11-03",
  ].join("\n");
}

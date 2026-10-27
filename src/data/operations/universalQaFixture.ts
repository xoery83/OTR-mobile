// shortcut: fixed Train/Activity specimens for the qualified DEV QA slices only.
export function universalQaFixture(
  accountId: string | undefined,
  tripId: string | null | undefined,
  dev: boolean,
  family: "P5" | "P6" = "P5",
): string | undefined {
  if (
    !dev ||
    accountId !== "f4b059c5-8241-4ffb-aa15-37fa25474543" ||
    tripId !== "825f79b2-4a9d-4535-a62e-43000ca50c4a"
  )
    return undefined;
  if (family === "P6")
    return [
      "Synthetic QA only",
      "P6 Activity: Harbour QA Gallery Visit",
      "Activity date: 2026-11-03",
    ].join("\n");
  return [
    "Synthetic QA only",
    "Service: Coastal QA Train",
    "Operator: Coastal QA Rail",
    "Service number: CQ101",
    "Transport subtype: TRAIN",
    "Departure date: 2026-11-03",
  ].join("\n");
}

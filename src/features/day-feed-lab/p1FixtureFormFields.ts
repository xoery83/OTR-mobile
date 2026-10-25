import type { ManualPlanFields } from "@/data/repositories/manualPlanRepository";
import { p1FidelityPack } from "./p1FidelityFixture";
// Fixture UI fields only: never a Repository draft, proof, queue operation or persisted record.
export function p1FixtureFormFields(itemId: string): ManualPlanFields {
  const source = p1FidelityPack.items.find(
    (item) => item.id === itemId && item.availability !== "UNAVAILABLE",
  );
  if (!source) throw new Error("P1_FIXTURE_UNAVAILABLE");
  const item = source as typeof source & {
    endDate?: string;
    endTime?: string;
    note?: string;
    place?: string;
    participation?: { mode: string; personIds?: string[] };
  };
  const participation = item.participation;
  return {
    title: item.title,
    startDate: item.date,
    startTime: item.time ?? null,
    endDate: item.endTime ? (item.endDate ?? item.date) : null,
    endTime: item.endTime ?? null,
    location: item.place ?? null,
    description: item.note ?? null,
    participation:
      participation?.mode === "SELECTED_MEMBERS"
        ? {
            mode: "SELECTED_MEMBERS",
            people: participation.personIds ?? [],
            selfPersonId: null,
          }
        : participation?.mode === "SELF"
          ? { mode: "SELF", people: [], selfPersonId: null }
          : { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
  };
}

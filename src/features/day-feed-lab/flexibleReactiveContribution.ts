import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { openTtr, projectTtr } from "@/domain/trip/ttrState";
import { ttrLabFixture } from "@/features/ttr/labFixtures";
import type { FlexibleSnapshot } from "@/features/day-feed/flexibleSnapshot";
import { place, scenario } from "./fixtureFacts";
import { t } from "@/ui/locale";

export const flexibleFixtureActions = [
  "COPY",
  "REMOVE",
  "GROUP_EDIT",
  "RESIZE",
  "DELETE",
  "NEST_ANCHOR",
  "INVALID_AFFILIATION",
] as const;
export type FlexibleFixtureAction = (typeof flexibleFixtureActions)[number];

// Complete synthetic replacements only; no Flexible command/storage lifecycle.
export function flexibleFixtureUpdate(
  snapshot: FlexibleSnapshot,
  action: FlexibleFixtureAction,
): FlexibleSnapshot {
  const block = snapshot.blocks.find((entry) => entry.id === "reactive-block");
  if (!block) return { ...snapshot, revision: snapshot.revision + 1 };
  let next = block;
  if (action === "COPY")
    next = {
      ...block,
      choices: [
        ...block.choices.filter((choice) => choice.id !== "copied"),
        { id: "copied", scope: "MY", name: t("dayLab.snapshotCopied") },
      ],
    };
  if (action === "REMOVE")
    next = { ...block, choices: block.choices.filter((choice) => choice.scope !== "MY") };
  if (action === "GROUP_EDIT")
    next = {
      ...block,
      choices: block.choices.map((choice) =>
        choice.scope === "GROUP"
          ? { ...choice, name: t("dayLab.snapshotEdited") }
          : choice,
      ),
    };
  if (action === "RESIZE")
    next = { ...block, softWindow: { startMinute: 1080, endMinute: 1200 } };
  if (action === "NEST_ANCHOR")
    next = {
      ...block,
      itemIds: [
        ...block.itemIds,
        ttrLabFixture("NOW_COLLISION").supplemental!.input.to!.eventId,
      ],
    };
  let blocks = snapshot.blocks.map((entry) => (entry.id === block.id ? next : entry));
  if (action === "DELETE") blocks = blocks.filter((entry) => entry.id !== block.id);
  if (action === "INVALID_AFFILIATION")
    blocks = [
      ...blocks.filter((entry) => entry.id !== "conflicting-block"),
      { ...next, id: "conflicting-block", choices: [] },
    ];
  return { ...snapshot, revision: snapshot.revision + 1, blocks };
}

export function flexibleReactiveContribution() {
  const ttr = ttrLabFixture("NOW_COLLISION");
  const tripId = "20000000-0000-4000-8000-000000000099";
  const date = ttr.selectedDate;
  const input = {
    ...ttr.supplemental!.input,
    scope: { ...ttr.supplemental!.input.scope, tripId },
    from: { ...ttr.supplemental!.input.from!, tripId },
    to: { ...ttr.supplemental!.input.to!, tripId },
  };
  const state = openTtr(input);
  const projection = projectTtr(state, { now: ttr.instant, displayPermission: "DENIED" });
  const fixture = scenario(tripId, t("dayLab.snapshotScenario"), [
    ...ttr.projection.events,
    place("reactive-item", t("dayLab.flexibleItem"), date, "14:00"),
    ...Array.from({ length: 8 }, (_, index) =>
      place(
        `reactive-tail-${index}`,
        t("dayLab.trailStop", { number: index + 3 }),
        date,
        `${index + 15}:00`,
      ),
    ),
    place("reactive-tns", t("dayLab.flexibleTns"), date),
  ]);
  const day = { ...fixture.projection, accountId: input.scope.accountId };
  const scope = { accountId: day.accountId, tripId, localDate: date, generation: 1 };
  const snapshot: FlexibleSnapshot = {
    version: "g2-flexible-snapshot/1",
    scope,
    revision: 0,
    blocks: [
      {
        version: "g2-flexible/1",
        synthetic: true,
        id: "reactive-block",
        title: t("dayLab.snapshotBlock"),
        accountId: scope.accountId,
        tripId,
        localDate: date,
        itemIds: ["reactive-item", "reactive-tns"],
        softWindow: { startMinute: 600, endMinute: 720 },
        choices: [
          { id: "garden", scope: "MY", name: t("dayLab.flexibleMyChoice") },
          { id: "cafe", scope: "GROUP", name: t("dayLab.flexibleGroupChoice") },
        ],
      },
    ],
  };
  return {
    ...fixture,
    dateRange: { start: date, end: date },
    dates: [date],
    projection: day,
    instant: ttr.instant,
    supplemental: { ...ttr.supplemental!, input, state, projection },
    flexiblePublication: { scope, snapshot },
    ports: { scope: { accountId: scope.accountId, tripId }, transitions: [projection] },
    query: (selectedDate: string, zone: string) =>
      itemsForLocalDate(day, selectedDate, zone),
  };
}

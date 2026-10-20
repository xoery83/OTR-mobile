import { expect, it } from "vitest";
import { collectFixtureContributions } from "./contribution";
import {
  getFixtureCatalog,
  getDl1FixtureCatalog,
  selectLabContext,
} from "./fixtureCatalog";
import { stayContribution } from "./stayContribution";
import { composeDayStream } from "@/features/day-feed/composition";
import { bindRenderer } from "@/features/day-feed/rendererContribution";

it("registers a sixth typed Stay without changing the five accepted fixtures or switching rules", () => {
  const original = getDl1FixtureCatalog(),
    catalog = getFixtureCatalog();
  expect(catalog).toHaveLength(6);
  expect(catalog.slice(0, 5)).toEqual(original);
  const stay = stayContribution();
  expect(selectLabContext(stay.id, undefined, catalog).date).toBe("2027-01-16");
  expect(stay.supplemental).toMatchObject({
    family: "P3",
    nights: 3,
    checkin: "2027-01-15",
    checkout: "2027-01-18",
  });
  expect(stay.projection.events).toHaveLength(1);
  expect(stay.projection.events[0].authored_address).toBeNull();
});
it("uses actual owning P3 roles and one stable Item, date-only TNS and middle-day BASE without midnight", () => {
  const stay = stayContribution(),
    id = stay.projection.events[0].id;
  const roles = ["CHECKIN", "TONIGHT", "TONIGHT", "CHECKOUT"];
  const before = JSON.stringify(stay.projection);
  stay.dates.forEach((date, index) => {
    const query = stay.query!(date, stay.zone);
    const stream = composeDayStream(query, stay.instant, { focus: id, immersive: id });
    expect(query.timed).toHaveLength(0);
    expect(query.unresolved).toEqual([]);
    expect(query.nonComparable).toHaveLength(1);
    expect(stream.rows).toHaveLength(1);
    expect(stream.rows[0].key).toBe(JSON.stringify([id, roles[index], date]));
    expect(stream.rows[0].position).toBe(index === 1 || index === 2 ? "BASE" : "TNS");
    expect(stream.focus).toBe(id);
    expect(stream.immersive).toBe(id);
    expect(query.nonComparable[0].anchor).toBeNull();
    expect(query.coreRows![0].displayTime?.instant).toBeUndefined();
    expect(query.coreRows![0].capabilities.canEdit).toBe(false);
  });
  expect(stay.query!("2027-01-19", stay.zone).coreRows).toEqual([]);
  expect(JSON.stringify(stay.projection)).toBe(before);
});
it("rejects duplicate Trip IDs, non-synthetic/version/scope/date/clock mismatches at contribution registration", () => {
  const s = stayContribution();
  expect(() => collectFixtureContributions([s, s])).toThrow();
  for (const change of [
    { version: "day-feed-lab/2" },
    { synthetic: false },
    { selectedDate: "2027-02-01" },
    { dates: ["2027-01-16", "2027-01-15"] },
    { instant: "bad" },
    { projection: { ...s.projection, tripId: "other" } },
    { ports: { scope: { accountId: "other", tripId: s.id } } },
  ])
    expect(() =>
      collectFixtureContributions([{ ...s, ...change } as typeof s]),
    ).toThrow();
});
it("binds typed supplemental facts and yields fallback for absent Item facts without a mutable registry", () => {
  const stay = stayContribution(),
    query = stay.query!(stay.selectedDate, stay.zone);
  const row = composeDayStream(query, stay.instant).rows[0];
  const seen: string[] = [];
  const renderer = bindRenderer({
    version: "day-feed-renderer/1",
    family: "P3",
    facts: { [row.item.event.id]: stay.supplemental! },
    render: ({ facts, depth }) => {
      seen.push(depth);
      return facts.propertyName ?? null;
    },
  });
  const rendered = renderer({ row, container: undefined, depth: "F", onDepth: () => {} });
  expect(rendered).toHaveProperty("props.facts", stay.supplemental);
  expect(rendered).toHaveProperty("props.depth", "F");
  expect(seen).toEqual([]);
  const fallback = bindRenderer({
    version: "day-feed-renderer/1",
    family: "P3",
    facts: {},
    render: () => "unexpected",
  });
  expect(
    fallback({ row, container: undefined, depth: "B", onDepth: () => {} }),
  ).toBeNull();
});
it("preserves Flexible soft facts, one nested Item and My/Group Choices through the shared Composer", () => {
  const stay = stayContribution(),
    query = stay.query!(stay.selectedDate, stay.zone),
    id = stay.projection.events[0].id;
  const softWindow = {
    start: { comparable: false, localDate: stay.selectedDate },
    end: { comparable: false, localDate: stay.selectedDate },
  };
  const flexible = [
    {
      id: "synthetic-block",
      itemIds: [id, id],
      softWindow,
      choices: [
        { id: "my-choice", scope: "MY" as const },
        { id: "group-choice", scope: "GROUP" as const },
      ],
    },
  ];
  const stream = composeDayStream(query, stay.instant, { flexible, choiceScope: "MY" });
  expect(stream.rows).toHaveLength(1);
  expect(stream.containers[0].rowKeys).toHaveLength(1);
  expect(stream.containers[0].softWindow).toEqual(softWindow);
  expect(stream.containers[0].choices.map((c) => c.id)).toEqual(["my-choice"]);
  expect(
    composeDayStream(query, stay.instant, {
      flexible,
      choiceScope: "GROUP",
    }).containers[0].choices.map((c) => c.id),
  ).toEqual(["group-choice"]);
  expect(
    composeDayStream(query, stay.instant, {
      flexible: [...flexible, { ...flexible[0], id: "ambiguous" }],
    }).rows[0].containerId,
  ).toBeNull();
});

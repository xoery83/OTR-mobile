import data from "./data.json";
import {
  resourceSnapshot,
  type Basket,
  type Block,
  type GalleryState,
  type Resource,
} from "./model";
export const fixtureIds = [
  "f01",
  "f02",
  "f03",
  "f04",
  "f05",
  "f06",
  "f07",
  "f08",
  "f09",
  "f10",
  "f11",
  "f12",
  "f13",
  "f14",
] as const;
export type FixtureId = (typeof fixtureIds)[number];
export type Context = "future" | "today" | "past";
export const fixtureOrigin = { latitude: 48.853, longitude: 2.333 };
export const baskets = data.baskets as Basket[];
export function resources(): Resource[] {
  return (data.resources as Resource[]).map(resourceSnapshot);
}
export function initialState(id: FixtureId): GalleryState {
  return {
    resources: resources(),
    my: ["f01", "f09"].includes(id) ? [] : id === "f02" ? [] : ["garden", "cafe"],
    saved: ["garden", "saved-away"],
    block:
      id === "f09"
        ? null
        : {
            id: `fixture-flexible-${id}`,
            title: "",
            start: 780,
            end: 1080,
            area: "Saint-Germain",
          },
    serial: 1,
    promotion: "idle",
    promoted: null,
    undo: null,
  };
}
export type FlexibleFixtureProjection = Readonly<{
  version: "flexible-fixture/1";
  synthetic: true;
  tripId: "flexible-fixture-trip";
  localDate: "2026-10-12";
  block: Readonly<Block> | null;
  scope: "MY" | "GROUP";
  choices: readonly Resource[];
  published: readonly Readonly<
    Omit<Basket, "resources"> & { resources: readonly string[] }
  >[];
  itemRefs: readonly string[];
  affiliation: Readonly<{ blockId: string; itemIds: readonly string[] }> | null;
  adjacentBlocks: readonly Readonly<Block>[];
  syntheticItems: readonly Readonly<{
    reference: string;
    title: string;
    startMinute: number | null;
    endMinute: number | null;
    authorized: true;
  }>[];
}>;
// G2 must certify/compose/render supplied Item references; they are never Canonical writes.
export function projectFixture(
  state: GalleryState,
  fixture: FixtureId,
  scope: "MY" | "GROUP",
): FlexibleFixtureProjection {
  const itemRefs = ["f04", "f10", "f13", "f14"].includes(fixture)
    ? ["fixture-fixed"]
    : [];
  if (fixture === "f13") itemRefs.push("fixture-tns");
  if (state.promoted) itemRefs.push(`fixture-promoted-${state.promoted}`);
  const ids =
    scope === "MY"
      ? state.my
      : ["f01", "f09"].includes(fixture)
        ? []
        : baskets[0].resources;
  return {
    version: "flexible-fixture/1",
    synthetic: true,
    tripId: "flexible-fixture-trip",
    localDate: "2026-10-12",
    block: state.block ? { ...state.block } : null,
    scope,
    choices: ids
      .map((id) => state.resources.find((r) => r.id === id)!)
      .filter(Boolean)
      .map(resourceSnapshot),
    published: baskets
      .filter(
        (b) => b.published && (!["f01", "f09"].includes(fixture) || b.id === "group"),
      )
      .map((b) => ({
        ...b,
        resources: ["f01", "f09"].includes(fixture) ? [] : [...b.resources],
      })),
    itemRefs,
    adjacentBlocks:
      fixture === "f13"
        ? [{ id: "fixture-flexible-adjacent", title: "", start: 1110, end: 1200 }]
        : [],
    syntheticItems: itemRefs.map((reference) => ({
      reference,
      title: reference,
      startMinute: reference === "fixture-tns" ? null : fixture === "f13" ? 750 : 900,
      endMinute: reference === "fixture-tns" ? null : 990,
      authorized: true,
    })),
    affiliation: state.block
      ? {
          blockId: state.block.id,
          itemIds: itemRefs.filter((id) => id !== "fixture-tns"),
        }
      : null,
  };
}

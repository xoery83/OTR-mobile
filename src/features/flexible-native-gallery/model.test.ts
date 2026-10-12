import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { reduceGallery, resizePreview, straightLine, poolResources } from "./model";
import { initialState, baskets, fixtureIds, projectFixture } from "./fixtures";
import { en, zhHans } from "../../../fixtures/flexible-native/src/ui/catalogs";
it("covers all fourteen deterministic fixtures and preserves source baskets on copy", () => {
  expect(fixtureIds).toHaveLength(14);
  const before = JSON.stringify(baskets);
  let s = initialState("f08");
  s = reduceGallery(s, { type: "add", id: "museum" });
  expect(s.my).toContain("museum");
  expect(s.saved).toContain("museum");
  expect(reduceGallery(s, { type: "add", id: "museum" })).toBe(s);
  expect(JSON.stringify(baskets)).toBe(before);
  s = reduceGallery(s, { type: "undo" });
  expect(s.my).not.toContain("museum");
  expect(s.saved).not.toContain("museum");
});
it("heart and membership remain independent; remove/undo never erase a resource", () => {
  let s = initialState("f08");
  s = reduceGallery(s, { type: "heart", id: "garden" });
  expect(s.my).toContain("garden");
  expect(s.saved).not.toContain("garden");
  s = reduceGallery(s, { type: "remove", id: "garden" });
  expect(s.resources.some((r) => r.id === "garden")).toBe(true);
  s = reduceGallery(s, { type: "undo" });
  expect(s.my).toContain("garden");
  expect(s.saved).not.toContain("garden");
});
it("retains a name-only custom resource on undo, with no invented coordinates", () => {
  let s = initialState("f07");
  s = reduceGallery(s, { type: "custom", name: "  My walk  " });
  const r = s.resources.at(-1)!;
  expect(r.name).toBe("My walk");
  expect(r.coordinates).toBeUndefined();
  expect(reduceGallery(s, { type: "custom", name: r.name })).toBe(s);
  const undone = reduceGallery(s, { type: "undo" });
  expect(undone.resources).toContain(r);
  expect(undone.saved).not.toContain(r.id);
  expect(reduceGallery(s, { type: "custom", name: " ".repeat(3) })).toBe(s);
});
it("only snapped, valid edge releases alter a window; rail approach is required", () => {
  const s = initialState("f09");
  const made = reduceGallery(s, { type: "create" });
  const b = made.block!;
  expect(reduceGallery(made, { type: "create" })).toBe(made);
  expect(resizePreview(b, "start", 8, 90)).toBeNull();
  expect(resizePreview(b, "start", 8, 20)).toBe(795);
  expect(resizePreview(b, "start", 999, 20)).toBeNull();
  expect(reduceGallery(made, { type: "resize", edge: "end", minute: 780 })).toBe(made);
  expect(reduceGallery(made, { type: "resize", edge: "end", minute: 1001 })).toBe(made);
  const changed = reduceGallery(made, { type: "resize", edge: "start", minute: 795 });
  expect(reduceGallery(changed, { type: "undo" }).block).toEqual(b);
});
it("distance is geometric only and missing/invalid coordinates remain unknown", () => {
  expect(straightLine({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBe(
    111195,
  );
  expect(straightLine(undefined, { latitude: 0, longitude: 0 })).toBeNull();
  expect(
    straightLine({ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 0 }),
  ).toBeNull();
});
it("supplies explicit affiliation independent of Choice scope; deletion retains Item references", () => {
  const s = initialState("f13");
  const before = JSON.stringify(s);
  const a = projectFixture(s, "f13", "MY"),
    b = projectFixture(s, "f13", "GROUP");
  expect(a.itemRefs).toEqual(b.itemRefs);
  expect(a.affiliation!.itemIds).toEqual(["fixture-fixed"]);
  expect(a.itemRefs).toContain("fixture-tns");
  const removed = projectFixture(reduceGallery(s, { type: "delete" }), "f13", "MY");
  expect(removed.affiliation).toBeNull();
  expect(removed.itemRefs).toEqual(a.itemRefs);
  expect(a.published.every((b) => b.published)).toBe(true);
  expect(JSON.stringify(a)).not.toContain("SECRET");
  expect(JSON.stringify(s)).toBe(before);
});
it("pending/failed promotion keeps Choice; accepted fixture removes it after acceptance only", () => {
  let s = initialState("f14");
  for (const outcome of ["pending", "failed"] as const) {
    s = reduceGallery(s, { type: "promotion", outcome, id: "garden" });
    expect(s.my).toContain("garden");
    expect(s.promoted).toBeNull();
  }
  s = reduceGallery(s, { type: "promotion", outcome: "accepted", id: "garden" });
  expect(s.my).not.toContain("garden");
  expect(s.saved).toContain("garden");
  expect(baskets[0].resources).toContain("garden");
  expect(
    projectFixture(s, "f14", "MY").itemRefs.filter((id) =>
      id.startsWith("fixture-promoted"),
    ),
  ).toHaveLength(1);
});
it("Saved partitions without duplicates, refresh is deterministic and search matches name only", () => {
  const s = initialState("f07");
  expect(poolResources(s, "saved", "").map((r) => r.id)).toEqual([
    "garden",
    "saved-away",
  ]);
  expect(poolResources(s, "search", "Paris")).toEqual([]);
  expect(poolResources(s, "recommended", "", 1)).toEqual(
    poolResources(s, "recommended", "", 1),
  );
});
it("fixture dictionaries have identical keys and message parameters", () => {
  expect(Object.keys(zhHans)).toEqual(Object.keys(en));
  for (const key of Object.keys(en) as (keyof typeof en)[])
    expect(zhHans[key].match(/\{\w+\}/g)).toEqual(en[key].match(/\{\w+\}/g));
});
it("module cannot own a compositor, NOW, Focus or Canonical writer", () => {
  for (const name of ["Gallery.tsx", "model.ts", "fixtures.ts"]) {
    const source = readFileSync(`src/features/flexible-native-gallery/${name}`, "utf8");
    expect(source).not.toMatch(
      /data\/|supabase|sqlite|auth\/|sync\/|composeDayStream|NowMarker|P1Row|setFocus|setDate|setTrip/,
    );
  }
});
it("R3 fixture factories and projection Resources are deeply readonly and independently detached", () => {
  const a = initialState("f10"),
    b = initialState("f10");
  const first = a.resources.find((r) => r.id === "garden")!,
    second = b.resources.find((r) => r.id === "garden")!;
  expect(first).not.toBe(second);
  expect(first.coordinates).not.toBe(second.coordinates);
  expect(Reflect.set(first, "name", "MUTATED")).toBe(false);
  expect(Reflect.set(first.coordinates!, "latitude", 0)).toBe(false);
  const projection = projectFixture(a, "f10", "MY"),
    projected = projection.choices.find((r) => r.id === "garden")!;
  expect(projected).not.toBe(first);
  expect(projected.coordinates).not.toBe(first.coordinates);
  expect(Reflect.set(projected.coordinates!, "latitude", 0)).toBe(false);
  expect(second.coordinates!.latitude).toBe(48.8462);
});

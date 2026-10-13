import { expect, it } from "vitest";
import {
  ttrFixture,
  TtrMemoryTestRepository,
  syntheticObservation,
} from "./__fixtures__/ttr";
import { qualifyTtr, ttrIdentity, ttrIdentityKey, ttrInputSchema } from "./ttr";
import { openTtr, projectTtr, reduceTtr } from "./ttrState";
import { ordinaryFixture, ordinaryHash } from "./__fixtures__/coreOrdinaryOrder";
import { qualifyCoreTtr } from "./tripCoreTtr";
const now = "2026-10-11T22:00:00Z";
const show = (input: unknown) =>
  projectTtr(openTtr(input), { now, displayPermission: "DENIED" });
it("accepted Core UNKNOWN with zero geometry maps without editing Core input", async () => {
  const f = ordinaryFixture();
  Object.assign(f.graph.itinerary_events[1], {
    accepted_latitude: f.graph.itinerary_events[0].accepted_latitude,
    accepted_longitude: f.graph.itinerary_events[0].accepted_longitude,
  });
  const result = await qualifyCoreTtr(
    f.graph,
    f.actor,
    f.orderId,
    f.ids[0],
    f.ids[1],
    { accountId: f.actor.accountId, tripId: f.actor.tripId, generation: 1 },
    { epoch: "synthetic-accepted" },
    [f.actor.personId!],
    ordinaryHash,
  );
  expect(result.status).toBe("QUALIFIED");
  if (result.status !== "QUALIFIED") return;
  expect(result.spatial.equivalence).toBe("UNKNOWN");
  expect(qualifyTtr(result.input)).toMatchObject({
    status: "QUALIFIED",
    spatialEquivalence: { equivalence: "UNKNOWN" },
    geometricDistance: { meters: 0 },
  });
  expect(show(result.input).visibility).toBe("STRAIGHT_LINE");
});

it.each([
  [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0 },
  ],
  [
    { latitude: 0, longitude: 180 },
    { latitude: 0, longitude: -180 },
  ],
  [
    { latitude: 90, longitude: 1 },
    { latitude: 90, longitude: 90 },
  ],
] as const)(
  "equal geometry %j / %j retains UNKNOWN, zero distance and open intent",
  (a, b) => {
    const f = ttrFixture();
    f.from!.endpoint!.coordinates = { ...a };
    f.to!.endpoint!.coordinates = { ...b };
    const q = qualifyTtr(f);
    expect(q).toMatchObject({
      status: "QUALIFIED",
      spatialEquivalence: { equivalence: "UNKNOWN" },
      geometricDistance: { meters: 0 },
    });
    expect(show(f)).toMatchObject({
      version: "ttr-presentation/1",
      visibility: "STRAIGHT_LINE",
      mode: null,
      modeOrigin: "NONE",
      unavailableReason: null,
      geometricDistance: { meters: 0 },
    });
    expect(show(f).actions.openTtr).not.toBeNull();
  },
);
it("omitted evidence is explicitly compatible UNKNOWN, never a geometric default", () => {
  const f = ttrFixture();
  delete f.spatialEquivalence;
  f.to!.endpoint!.coordinates = { ...f.from!.endpoint!.coordinates! };
  expect(ttrInputSchema.safeParse(f).success).toBe(true);
  expect(qualifyTtr(f)).toMatchObject({
    status: "QUALIFIED",
    spatialEquivalence: { equivalence: "UNKNOWN" },
  });
  expect(show(f).visibility).toBe("STRAIGHT_LINE");
});
it("nearby and differing coordinates remain UNKNOWN without mode or ETA inference", () => {
  const f = ttrFixture();
  f.to!.endpoint!.coordinates!.longitude = 0.00000001;
  const p = show(f);
  expect(p.geometricDistance!.meters).toBeGreaterThan(0);
  expect(p.visibility).toBe("STRAIGHT_LINE");
  expect(p.mode).toBeNull();
  expect(p.route).toEqual({ status: "MISSING" });
  expect(qualifyTtr(f)).toMatchObject({ spatialEquivalence: { equivalence: "UNKNOWN" } });
});
it("explicit SAME_LOCATION requires provenance and suppresses without consulting distance", () => {
  const f = ttrFixture();
  f.spatialEquivalence = {
    equivalence: "SAME_LOCATION",
    provenance: "synthetic-authority/pair-1",
  };
  expect(show(f)).toMatchObject({
    qualification: "QUALIFIED",
    visibility: "HIDDEN",
    unavailableReason: "SAME_LOCATION",
  });
  expect(show(f).actions.openTtr).toBeNull();
  const s = reduceTtr(reduceTtr(openTtr(f), { type: "PREVIEW", mode: "walking" }), {
    type: "BEGIN_FIXTURE_REQUEST",
  });
  expect(s.route.status).toBe("MISSING");
  expect(
    qualifyTtr({ ...f, spatialEquivalence: { equivalence: "SAME_LOCATION" } }).status,
  ).toBe("UNQUALIFIED");
});
it.each([
  { equivalence: "DISTINCT", provenance: "unavailable-core-proof" },
  { equivalence: "NEARBY" },
  {
    equivalence: "SAME_LOCATION",
    provenance: "synthetic",
    exception: "DIFFERENT_TERMINAL",
  },
  { equivalence: "UNKNOWN", sameLocation: true },
  { equivalence: "SAME_LOCATION", provenance: "" },
])(
  "unsupported/invalid spatial assertion %j fails strict validation",
  (spatialEquivalence) => {
    const f = { ...ttrFixture(), spatialEquivalence };
    expect(ttrInputSchema.safeParse(f).success).toBe(false);
    expect(show(f).visibility).toBe("HIDDEN");
  },
);
it.each(["continuity", "applicability", "coordinates", "coverage"])(
  "UNKNOWN does not bypass missing %s authority",
  (kind) => {
    const f = ttrFixture();
    if (kind === "continuity") f.continuity = null;
    if (kind === "applicability") f.to!.applicable = "UNKNOWN";
    if (kind === "coordinates") f.to!.endpoint!.coordinates = null;
    if (kind === "coverage") f.special = "EXPLICIT_TRANSPORT";
    expect(qualifyTtr(f).status).toBe("UNQUALIFIED");
    expect(show(f).actions.openTtr).toBeNull();
  },
);
it("Past remains independently hidden even with equal UNKNOWN geometry", () => {
  const f = ttrFixture();
  f.period = "PAST";
  f.to!.endpoint!.coordinates = { ...f.from!.endpoint!.coordinates! };
  expect(show(f)).toMatchObject({ visibility: "HIDDEN", unavailableReason: "PAST" });
});
it("spatial revisions and location/time edits preserve personal identity while invalidating route observations", () => {
  const f = ttrFixture();
  const repo = new TtrMemoryTestRepository();
  let s = repo.open(f);
  s = repo.dispatch(s, { type: "PREVIEW", mode: "walking" });
  s = repo.dispatch(s, { type: "CONFIRM", selectedAt: now });
  s = reduceTtr(s, { type: "BEGIN_FIXTURE_REQUEST" });
  if (s.route.status !== "PENDING") throw new Error("fixture request missing");
  s = reduceTtr(s, {
    type: "FIXTURE_RESULT",
    ticket: s.route.ticket,
    observation: syntheticObservation(),
  });
  const edited = structuredClone(f);
  edited.from!.endpoint!.coordinates!.longitude = 5;
  edited.from!.endpoint!.locationInputRevision = 2;
  edited.from!.semanticRevision = 2;
  edited.queryTime = {
    kind: "DEPARTURE",
    instant: now,
    zone: "UTC",
    quality: "EXACT",
    precision: 0,
    comparable: true,
  };
  const refreshed = reduceTtr(s, { type: "REFRESH", input: edited });
  expect(refreshed.identity).toEqual(s.identity);
  expect(refreshed.confirmed!.mode).toBe("walking");
  expect(refreshed.route.status).toBe("MISSING");
  const same = structuredClone(edited);
  same.spatialEquivalence = {
    equivalence: "SAME_LOCATION",
    provenance: "synthetic-proof",
  };
  expect(ttrIdentity(same)).toEqual(ttrIdentity(f));
});
it("A→B→C→D keep independent keys and incident invalidation without day-level suppression", () => {
  const f = ttrFixture();
  const a = f.from!,
    b = f.to!;
  const c = {
    ...structuredClone(b),
    eventId: "30000000-0000-4000-8000-000000000003",
    occurrenceToken: "synthetic-C",
  };
  const d = {
    ...structuredClone(c),
    eventId: "30000000-0000-4000-8000-000000000004",
    occurrenceToken: "synthetic-D",
  };
  const pair = (from: typeof a, to: typeof b) => ({
    ...structuredClone(f),
    from,
    to,
    continuity: {
      ...f.continuity!,
      fromToken: from.occurrenceToken!,
      toToken: to.occurrenceToken!,
    },
  });
  const pairs = [pair(a, b), pair(b, c), pair(c, d)];
  expect(new Set(pairs.map((p) => ttrIdentityKey(ttrIdentity(p)!))).size).toBe(3);
  expect(pairs.map((p) => qualifyTtr(p).status)).toEqual([
    "QUALIFIED",
    "QUALIFIED",
    "QUALIFIED",
  ]);
  const badB = { ...structuredClone(b), endpoint: null };
  expect(
    [pair(a, badB), pair(badB, c), pair(c, d)].map((p) => qualifyTtr(p).status),
  ).toEqual(["UNQUALIFIED", "UNQUALIFIED", "QUALIFIED"]);
  expect(show(pair(c, d)).visibility).toBe("STRAIGHT_LINE");
  expect(ttrIdentityKey(ttrIdentity(pair(b, a))!)).not.toBe(
    ttrIdentityKey(ttrIdentity(pair(a, b))!),
  );
  const repeated = { ...structuredClone(b), occurrenceToken: "synthetic-second-visit" };
  expect(ttrIdentityKey(ttrIdentity(pair(a, repeated))!)).not.toBe(
    ttrIdentityKey(ttrIdentity(pair(a, b))!),
  );
});

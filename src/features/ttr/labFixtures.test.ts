import { describe, expect, it } from "vitest";
import { collectFixtureContributions } from "@/features/day-feed-lab/contribution";
import { getFixtureCatalog } from "@/features/day-feed-lab/fixtureCatalog";
import { composeDayStream, dayRowKey } from "@/features/day-feed/composition";
import { ttrIdentityKey } from "@/domain/trip/ttr";
import { projectTtr, reduceTtr } from "@/domain/trip/ttrState";
import { syntheticObservation } from "@/domain/trip/__fixtures__/ttr";
import {
  acceptsTtrLabIntent,
  getTtrLabFixtures,
  ttrLabFixture,
  ttrLabCases,
} from "./labFixtures";

describe("TTR shared Lab contribution", () => {
  it("keeps synthetic availability separate from display permission and the G2 structural subset", () => {
    const f = ttrLabFixture("DRIVING_PENDING"),
      facts = f.supplemental!;
    if (facts.state.route.status !== "PENDING")
      throw new Error("Expected pending fixture");
    const state = reduceTtr(facts.state, {
      type: "FIXTURE_RESULT",
      ticket: facts.state.route.ticket,
      observation: { ...syntheticObservation("driving"), observedAt: f.instant },
    });
    expect(state.route.status).toBe("AVAILABLE");
    const denied = projectTtr(state, { now: f.instant, displayPermission: "DENIED" });
    const permitted = projectTtr(state, {
      now: f.instant,
      displayPermission: "SYNTHETIC_ALLOWED",
    });
    expect(denied.route).toEqual({ status: "MISSING" });
    expect(permitted.route).toMatchObject({
      status: "AVAILABLE",
      observation: {
        source: "SYNTHETIC_FIXTURE",
        provider: "SYNTHETIC",
        durationSeconds: 600,
      },
    });
    expect(denied.mode).toBe("driving");
    expect(denied.geometricDistance).toEqual(permitted.geometricDistance);
    const stream = composeDayStream(f.query!(f.selectedDate, f.zone), f.instant, {
      ...f.ports,
      transitions: [permitted],
    });
    expect(stream.rows[1].transition).not.toHaveProperty("route");
  });
  it("validates all feature contributions with the actual registry contract without altering existing registration", () => {
    const existing = getFixtureCatalog();
    const bytes = JSON.stringify(existing);
    const contributed = getTtrLabFixtures();
    expect(contributed).toHaveLength(16);
    expect(collectFixtureContributions([...existing, ...contributed])).toHaveLength(22);
    expect(JSON.stringify(getFixtureCatalog())).toBe(bytes);
    expect(getFixtureCatalog()).toHaveLength(6);
    expect(JSON.stringify(getTtrLabFixtures())).toBe(JSON.stringify(contributed));
    expect(() => collectFixtureContributions([...contributed, contributed[0]])).toThrow(
      "DAY_LAB_CONTRIBUTION",
    );
  });
  it.each(ttrLabCases)(
    "%s uses owning qualification/projection and the single G2 Composer",
    (id) => {
      const f = ttrLabFixture(id),
        facts = f.supplemental!;
      const bytes = JSON.stringify(f);
      const p = facts.projection;
      expect(p.version).toBe("ttr-presentation/1");
      expect(p.qualification).toBe(facts.expected.qualification);
      expect(p.visibility).toBe(facts.expected.visibility);
      expect(p.mode).toBe(facts.expected.mode);
      expect(p.route.status).toBe(facts.expected.routeStatus);
      expect(p).toEqual(
        projectTtr(facts.state, { now: f.instant, displayPermission: "DENIED" }),
      );
      expect(f.ports!.transitions![0]).toBe(p);
      const stream = composeDayStream(
        f.query!(f.selectedDate, f.zone),
        f.instant,
        f.ports,
      );
      expect(stream.rows).toHaveLength(2);
      expect(stream.rows.filter((r) => r.transition)).toHaveLength(
        facts.expected.composed ? 1 : 0,
      );
      if (facts.expected.composed) {
        const row = stream.rows[1];
        expect(row.transition).toMatchObject({
          geometricDistance: {
            kind: "STRAIGHT_LINE",
            source: "LOCAL_GEOMETRY",
            meters: p.geometricDistance!.meters,
          },
          mode: p.mode,
          modeOrigin: p.modeOrigin,
          suppressConnector: facts.expected.suppressConnector,
          openTtr: p.actions.openTtr,
        });
        expect(row.transition).not.toHaveProperty("route");
        expect(row.transition).not.toHaveProperty("externalMaps");
      }
      expect(JSON.stringify(f)).toBe(bytes);
      expect(p.route).not.toHaveProperty("observation");
      expect(Object.isFrozen(p)).toBe(true);
    },
  );
  it("provides independent geometric, selected, pending, failed and collision facts", () => {
    const facts = (id: Parameters<typeof ttrLabFixture>[0]) =>
      ttrLabFixture(id).supplemental!;
    expect(facts("STRAIGHT_LINE").projection).toMatchObject({
      visibility: "STRAIGHT_LINE",
      mode: null,
      modeOrigin: "NONE",
    });
    expect(facts("STRAIGHT_LINE").projection.geometricDistance!.meters).toBeCloseTo(
      111195.08,
      1,
    );
    expect(facts("WALKING_NO_ETA").projection).toMatchObject({
      mode: "walking",
      modeOrigin: "USER_CONFIRMED",
      route: { status: "MISSING" },
    });
    expect(facts("DRIVING_PENDING").projection).toMatchObject({
      mode: "driving",
      route: { status: "PENDING" },
    });
    expect(facts("TRANSIT_FAILED").state.route).toMatchObject({
      status: "FAILED",
      reason: "NO_ROUTE",
    });
    const f = ttrLabFixture("NOW_COLLISION");
    const stream = composeDayStream(f.query!(f.selectedDate, f.zone), f.instant, f.ports);
    expect(stream.context).toBe("TODAY");
    expect(stream.now.mode).toBe("BETWEEN_EVENTS");
    expect(stream.rows[1].transition?.suppressConnector).toBe(true);
    expect(stream.rows[1].transition?.geometricDistance).toEqual(
      f.supplemental!.projection.geometricDistance,
    );
  });
  it("keeps coincident geometry UNKNOWN until explicit same-location evidence exists", () => {
    const unknown = ttrLabFixture("COINCIDENT_UNKNOWN").supplemental!;
    const same = ttrLabFixture("EXPLICIT_SAME_LOCATION").supplemental!;
    expect(unknown.input.spatialEquivalence).toEqual({ equivalence: "UNKNOWN" });
    expect(unknown.projection).toMatchObject({
      qualification: "QUALIFIED",
      visibility: "STRAIGHT_LINE",
      geometricDistance: { meters: 0 },
      actions: { openTtr: expect.any(Object) },
    });
    expect(same.input.spatialEquivalence).toEqual({
      equivalence: "SAME_LOCATION",
      provenance: "synthetic-lab-equivalence",
    });
    expect(same.projection).toMatchObject({
      qualification: "QUALIFIED",
      visibility: "HIDDEN",
      unavailableReason: "SAME_LOCATION",
      actions: { openTtr: null },
    });
    expect(same.projection).not.toHaveProperty("geometricDistance");
  });
  it.each(["UNKNOWN_CONTINUITY", "MISSING_ENDPOINT", "TEXT_ONLY_ENDPOINT"] as const)(
    "%s never fabricates geometry or an action",
    (id) => {
      const p = ttrLabFixture(id).supplemental!.projection;
      expect(p).toMatchObject({
        qualification: "UNQUALIFIED",
        visibility: "HIDDEN",
        actions: { openTtr: null, externalMaps: null },
      });
      expect(p).not.toHaveProperty("geometricDistance");
    },
  );
  it("keeps repeated occurrence distinct without minting a second Canonical Event", () => {
    const f = ttrLabFixture("REPEATED_OCCURRENCE"),
      facts = f.supplemental!;
    expect(facts.projection.identity!.toEventId).toBe(facts.before!.identity!.toEventId);
    expect(ttrIdentityKey(facts.projection.identity!)).not.toBe(
      ttrIdentityKey(facts.before!.identity!),
    );
    expect(facts.projection.anchors).toEqual(facts.before!.anchors);
    expect(new Set(f.projection.events.map((e) => e.id)).size).toBe(2);
  });
  it("preserves confirmed mode and identity after location edit while invalidating the result fingerprint", () => {
    const facts = ttrLabFixture("LOCATION_EDIT").supplemental!;
    expect(facts.projection.identity).toEqual(facts.before!.identity);
    expect(facts.projection.mode).toBe("walking");
    expect(facts.state.confirmed!.selectedAt).toBe("2027-01-14T12:00:00Z");
    expect(facts.projection.inputFingerprint).not.toBe(facts.before!.inputFingerprint);
    expect(facts.state.route.status).toBe("MISSING");
  });
  it("reversal cannot transfer personal choice, while external maps needs no selected mode", () => {
    const reversed = ttrLabFixture("REVERSED_RELATION").supplemental!;
    expect(reversed.before!.mode).toBe("walking");
    expect(reversed.state.confirmed).toBeNull();
    expect(reversed.projection.mode).toBeNull();
    expect(reversed.projection.identity!.fromEventId).toBe(
      reversed.before!.identity!.toEventId,
    );
    const f = ttrLabFixture("EXTERNAL_MAPS_NO_MODE"),
      p = f.supplemental!.projection;
    expect(p.mode).toBeNull();
    expect(p.actions.externalMaps).toEqual({
      from: { latitude: 0, longitude: 0 },
      to: { latitude: 0, longitude: 1 },
    });
  });
  it("rejects stale versions, Account/Trip/branch/generation changes including A→B→A", () => {
    const facts = ttrLabFixture("STALE_OPEN_TTR").supplemental!;
    expect(
      acceptsTtrLabIntent(facts.projection, facts.input.scope, facts.intentVector!),
    ).toBe(false);
    const current = {
      intent: facts.projection.actions.openTtr!,
      capturedScope: { ...facts.input.scope },
      expectedAccepted: true,
    };
    expect(acceptsTtrLabIntent(facts.projection, facts.input.scope, current)).toBe(true);
    for (const scope of [
      { ...facts.input.scope, generation: 3 },
      { ...facts.input.scope, accountId: "different-account" },
      { ...facts.input.scope, tripId: "different-trip" },
      { ...facts.input.scope, travellerKey: "different-branch" },
    ])
      expect(acceptsTtrLabIntent(facts.projection, scope, current)).toBe(false);
    expect(
      acceptsTtrLabIntent(
        { ...facts.projection, visibility: "HIDDEN" },
        facts.input.scope,
        current,
      ),
    ).toBe(false);
  });
  it("respects shared stale/duplicate/scope/anchor rejection without inferring authority from adjacency", () => {
    const f = ttrLabFixture("STRAIGHT_LINE"),
      p = f.supplemental!.projection;
    const query = f.query!(f.selectedDate, f.zone);
    for (const transition of [
      {
        ...p,
        actions: {
          ...p.actions,
          openTtr: {
            ...p.actions.openTtr!,
            publicationVersion: p.publicationVersion + 1,
          },
        },
      },
      {
        ...p,
        anchors: {
          ...p.anchors!,
          fromRowKey: dayRowKey(p.identity!.fromEventId, "END", f.selectedDate),
        },
      },
    ])
      expect(
        composeDayStream(query, f.instant, {
          ...f.ports,
          transitions: [transition],
        }).rows.every((r) => !r.transition),
      ).toBe(true);
    expect(
      composeDayStream(query, f.instant, { ...f.ports, transitions: [p, p] }).rows.every(
        (r) => !r.transition,
      ),
    ).toBe(true);
    expect(
      composeDayStream(query, f.instant, {
        ...f.ports,
        scope: { accountId: "other", tripId: f.id },
      }).rows.every((r) => !r.transition),
    ).toBe(true);
    expect(composeDayStream(query, f.instant).rows.every((r) => !r.transition)).toBe(
      true,
    );
  });
});

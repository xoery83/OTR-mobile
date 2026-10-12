import { describe, expect, it } from "vitest";
import {
  ttrFixture,
  syntheticObservation,
  TtrMemoryTestRepository,
} from "./__fixtures__/ttr";
import {
  qualifyTtr,
  straightLineDistance,
  ttrExpired,
  ttrIdentity,
  ttrIdentityKey,
  ttrRouteFingerprint,
  type TtrInput,
  type TtrMode,
} from "./ttr";
import { openTtr, projectTtr, reduceTtr, type TtrState } from "./ttrState";
const now = "2026-10-11T22:00:00Z";
const projection = (s: TtrState, permission: "SYNTHETIC_ALLOWED" | "DENIED" = "DENIED") =>
  projectTtr(s, { now, displayPermission: permission });
const preview = (s: TtrState, mode: TtrMode = "walking") =>
  reduceTtr(s, { type: "PREVIEW", mode });
function pending(s: TtrState) {
  const result = reduceTtr(s, { type: "BEGIN_FIXTURE_REQUEST" });
  if (result.route.status !== "PENDING")
    throw new Error("Expected synthetic pending state");
  return { state: result, ticket: result.route.ticket };
}
const confirmed = (
  repo: TtrMemoryTestRepository,
  input = ttrFixture(),
  mode: TtrMode = "walking",
) => repo.dispatch(preview(repo.open(input), mode), { type: "CONFIRM", selectedAt: now });
const key = (f: TtrInput) => ttrIdentityKey(ttrIdentity(f)!);

describe("TTR relation qualification", () => {
  it("qualifies supplied actor-applicable continuity with accepted geometry without a clock", () => {
    const q = qualifyTtr(ttrFixture());
    expect(q.status).toBe("QUALIFIED");
    if (q.status !== "QUALIFIED") return;
    expect(q.timedEligible).toBe(false);
    expect(q.geometricDistance).toMatchObject({
      kind: "STRAIGHT_LINE",
      source: "LOCAL_GEOMETRY",
    });
    expect(q.geometricDistance.meters).toBeCloseTo(111195.08, 1);
  });
  it.each([
    [
      "adjacency without continuity",
      (f: TtrInput) => {
        f.continuity = null;
      },
      "UNKNOWN_CONTINUITY",
    ],
    [
      "unproven continuity",
      (f: TtrInput) => {
        f.continuity!.proven = false;
      },
      "UNKNOWN_CONTINUITY",
    ],
    [
      "cross-day without proof",
      (f: TtrInput) => {
        f.continuity!.crossDay = true;
        f.continuity!.proven = false;
      },
      "UNKNOWN_CONTINUITY",
    ],
    [
      "TEXT_ONLY",
      (f: TtrInput) => {
        f.from!.endpoint!.qualification = "TEXT_ONLY";
      },
      "UNQUALIFIED_COORDINATES",
    ],
    [
      "missing coordinate pair",
      (f: TtrInput) => {
        f.to!.endpoint!.coordinates = null;
      },
      "UNQUALIFIED_COORDINATES",
    ],
    [
      "missing endpoint",
      (f: TtrInput) => {
        f.from!.endpoint = null;
      },
      "MISSING_ENDPOINT",
    ],
    [
      "wrong operative role",
      (f: TtrInput) => {
        f.from!.endpoint!.role = "PICKUP";
      },
      "MISSING_ENDPOINT",
    ],
    [
      "missing provenance",
      (f: TtrInput) => {
        f.from!.endpoint!.provenance = null;
      },
      "MISSING_PROVENANCE",
    ],
    [
      "missing location revision",
      (f: TtrInput) => {
        f.to!.endpoint!.locationInputRevision = null;
      },
      "MISSING_PROVENANCE",
    ],
    [
      "unknown applicability",
      (f: TtrInput) => {
        f.to!.applicable = "UNKNOWN";
      },
      "UNKNOWN_APPLICABILITY",
    ],
    [
      "readable but inapplicable",
      (f: TtrInput) => {
        f.to!.applicable = "NO";
      },
      "UNKNOWN_APPLICABILITY",
    ],
    [
      "ambiguous occurrence",
      (f: TtrInput) => {
        f.from!.occurrenceToken = null;
      },
      "AMBIGUOUS_OCCURRENCE",
    ],
    [
      "missing occurrence role",
      (f: TtrInput) => {
        f.from!.role = null;
      },
      "AMBIGUOUS_OCCURRENCE",
    ],
    [
      "explicit Transport",
      (f: TtrInput) => {
        f.special = "EXPLICIT_TRANSPORT";
      },
      "EXPLICIT_TRANSPORT",
    ],
    [
      "Flight wait",
      (f: TtrInput) => {
        f.special = "FLIGHT_WAIT";
      },
      "FLIGHT_WAIT",
    ],
    [
      "Pool candidate",
      (f: TtrInput) => {
        f.special = "FLEXIBLE_POOL";
      },
      "UNSELECTED_FLEXIBLE_POOL",
    ],
    [
      "unconfirmed Block",
      (f: TtrInput) => {
        f.special = "CONFIRMED_BLOCK";
      },
      "UNCONFIRMED_BLOCK",
    ],
    [
      "denied access",
      (f: TtrInput) => {
        f.source.accessible = false;
      },
      "ACCESS_UNAVAILABLE",
    ],
    [
      "incomplete source",
      (f: TtrInput) => {
        f.source.complete = false;
      },
      "INVALID_SOURCE_CONTEXT",
    ],
    [
      "mixed source",
      (f: TtrInput) => {
        f.to!.sourceKey = "foreign-source";
      },
      "INVALID_SOURCE_CONTEXT",
    ],
    [
      "scope mismatch",
      (f: TtrInput) => {
        f.to!.accountId = f.scope.tripId;
      },
      "INVALID_SOURCE_CONTEXT",
    ],
    [
      "continuity of wrong occurrence",
      (f: TtrInput) => {
        f.continuity!.toToken = "different-entry";
      },
      "UNKNOWN_CONTINUITY",
    ],
  ] as const)("fails closed: %s", (_, edit, reason) => {
    const f = ttrFixture();
    edit(f);
    expect(qualifyTtr(f)).toEqual({ status: "UNQUALIFIED", reason });
  });
  it("accepts explicitly confirmed Block anchors and proven cross-day continuity", () => {
    const f = ttrFixture();
    f.special = "CONFIRMED_BLOCK";
    f.blockAnchorsConfirmed = true;
    f.continuity!.crossDay = true;
    expect(qualifyTtr(f).status).toBe("QUALIFIED");
  });
  it.each([NaN, Infinity, 91, -91])("rejects invalid latitude %s", (latitude) => {
    const f = ttrFixture();
    f.to!.endpoint!.coordinates!.latitude = latitude;
    expect(qualifyTtr(f).status).toBe("UNQUALIFIED");
    expect(() =>
      straightLineDistance({ latitude, longitude: 0 }, { latitude: 0, longitude: 0 }),
    ).toThrow();
  });
  it.each([NaN, Infinity, 181, -181])("rejects invalid longitude %s", (longitude) => {
    const f = ttrFixture();
    f.to!.endpoint!.coordinates!.longitude = longitude;
    expect(qualifyTtr(f).status).toBe("UNQUALIFIED");
  });
  it("does not repair noncanonical IDs or supplied occurrence tokens", () => {
    const f = ttrFixture();
    f.from!.occurrenceToken = " ambiguous-token ";
    expect(qualifyTtr(f).status).toBe("UNQUALIFIED");
    expect(
      qualifyTtr({
        ...ttrFixture(),
        scope: { ...ttrFixture().scope, accountId: "not-a-uuid" },
      }).status,
    ).toBe("UNQUALIFIED");
  });
  it("handles identical points, tiny distinct points and antimeridian without road/time inference", () => {
    expect(
      straightLineDistance({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }),
    ).toBe(0);
    const f = ttrFixture();
    f.to!.endpoint!.coordinates!.longitude = 0;
    expect(projection(openTtr(f)).visibility).toBe("HIDDEN");
    expect(projection(openTtr(f)).unavailableReason).toBe("SAME_LOCATION");
    f.to!.endpoint!.coordinates!.longitude = 0.00000001;
    expect(projection(openTtr(f)).visibility).toBe("STRAIGHT_LINE");
    expect(
      straightLineDistance(
        { latitude: 0, longitude: 179 },
        { latitude: 0, longitude: -179 },
      ),
    ).toBeCloseTo(222390.16, 1);
    expect(
      straightLineDistance(
        { latitude: 0, longitude: 180 },
        { latitude: 0, longitude: -180 },
      ),
    ).toBe(0);
    expect(
      straightLineDistance(
        { latitude: 90, longitude: 1 },
        { latitude: 90, longitude: 90 },
      ),
    ).toBe(0);
  });
});
describe("stable identity and personal mode", () => {
  it("keeps identity across title, coordinates, time, date and semantic edits", () => {
    const f = ttrFixture(),
      old = key(f);
    f.from!.title = "Edited";
    f.from!.notes = "Edited notes";
    f.from!.semanticRevision++;
    f.from!.endpoint!.coordinates!.longitude = 5;
    f.from!.endpoint!.locationInputRevision = 2;
    f.expiry!.eventDate = "2026-10-14";
    f.anchors.fromRowKey = "new-display-row";
    f.queryTime = {
      kind: "DEPARTURE",
      instant: now,
      zone: "Pacific/Auckland",
      quality: "EXACT",
      precision: 0,
      comparable: true,
    };
    expect(key(f)).toBe(old);
  });
  it.each(["occurrence", "role", "account", "trip", "traveller", "reversed"] as const)(
    "isolates %s identity",
    (change) => {
      const f = ttrFixture(),
        original = key(f);
      if (change === "occurrence") f.to!.occurrenceToken = "second-appearance";
      if (change === "role") {
        f.to!.role = "RETURN";
        f.to!.endpoint!.role = "RETURN";
      }
      if (change === "account" || change === "trip") {
        const field = change === "account" ? "accountId" : "tripId";
        f.scope[field] = "90000000-0000-4000-8000-000000000001";
        f.from![field] = f.to![field] = f.scope[field];
      }
      if (change === "traveller") {
        f.scope.travellerKey =
          f.from!.travellerKey =
          f.to!.travellerKey =
            "different-person/branch";
      }
      if (change === "reversed") [f.from, f.to] = [f.to, f.from];
      expect(key(f)).not.toBe(original);
    },
  );
  it("preview/dismiss leaves repository and previous mode unchanged", () => {
    const repo = new TtrMemoryTestRepository();
    const original = confirmed(repo);
    const draft = preview(repo.open(ttrFixture()), "driving");
    expect(repo.writes).toBe(1);
    expect(draft.confirmed?.mode).toBe("walking");
    const closed = repo.dispatch(draft, { type: "DISMISS" });
    expect(closed.confirmed).toEqual(original.confirmed);
    expect(closed.preview).toBeNull();
    expect(repo.open(ttrFixture()).confirmed?.mode).toBe("walking");
  });
  it("explicit Confirm persists the final draft; no automatic mode on Open", () => {
    const repo = new TtrMemoryTestRepository();
    expect(repo.open(ttrFixture()).preview?.mode).toBeNull();
    const s = confirmed(repo, ttrFixture(), "transit");
    expect(s.confirmed?.mode).toBe("transit");
    expect(repo.open(ttrFixture()).preview?.mode).toBe("transit");
  });
  it.each(["pending", "failed"] as const)(
    "Confirm does not wait for simulated %s route",
    (kind) => {
      const repo = new TtrMemoryTestRepository();
      const { state, ticket } = pending(preview(repo.open(ttrFixture())));
      const before =
        kind === "failed"
          ? reduceTtr(state, { type: "FIXTURE_FAILURE", ticket, reason: "NETWORK" })
          : state;
      const saved = repo.dispatch(before, { type: "CONFIRM", selectedAt: now });
      expect(saved.confirmed?.mode).toBe("walking");
      expect(projection(saved).route.status).toBe(
        kind === "pending" ? "PENDING" : "FAILED",
      );
    },
  );
  it("preserves selected mode after location edit and removes only route inputs", () => {
    const repo = new TtrMemoryTestRepository();
    const { state, ticket } = pending(confirmed(repo));
    const available = reduceTtr(state, {
      type: "FIXTURE_RESULT",
      ticket,
      observation: syntheticObservation(),
    });
    const edited = ttrFixture();
    edited.from!.endpoint!.coordinates!.longitude = 2;
    edited.from!.endpoint!.locationInputRevision = 2;
    const next = repo.dispatch(available, { type: "REFRESH", input: edited });
    expect(next.confirmed?.mode).toBe("walking");
    expect(next.confirmed?.selectedAt).toBe(now);
    expect(next.route.status).toBe("MISSING");
    expect(projection(next).visibility).toBe("SELECTED_MODE");
  });
  it("preserves valid synthetic result across unrelated semantic/title edits", () => {
    const repo = new TtrMemoryTestRepository();
    const { state, ticket } = pending(confirmed(repo));
    const available = reduceTtr(state, {
      type: "FIXTURE_RESULT",
      ticket,
      observation: syntheticObservation(),
    });
    const edited = ttrFixture();
    edited.from!.title = "Other title";
    edited.from!.semanticRevision++;
    const next = repo.dispatch(available, { type: "REFRESH", input: edited });
    expect(next.route.status).toBe("AVAILABLE");
    expect(next.confirmed?.mode).toBe("walking");
    const q = qualifyTtr(edited);
    if (q.status !== "QUALIFIED") return;
    expect(ttrRouteFingerprint(q, "walking")).toBe(ticket.fingerprint);
  });
  it("time-sensitive edit changes result fingerprint but preserves mode", () => {
    const repo = new TtrMemoryTestRepository(),
      input = ttrFixture();
    input.queryTime = {
      kind: "DEPARTURE",
      instant: now,
      zone: "Pacific/Auckland",
      quality: "EXACT",
      precision: 0,
      comparable: true,
    };
    const { state, ticket } = pending(confirmed(repo, input));
    const available = reduceTtr(state, {
      type: "FIXTURE_RESULT",
      ticket,
      observation: syntheticObservation(),
    });
    input.queryTime.instant = "2026-10-11T23:00:00Z";
    const next = repo.dispatch(available, { type: "REFRESH", input });
    expect(next.route.status).toBe("MISSING");
    expect(next.confirmed?.mode).toBe("walking");
  });
  it("temporary incomplete source never deletes the choice; requalification needs no Confirm", () => {
    const repo = new TtrMemoryTestRepository();
    const s = confirmed(repo);
    const unavailable = ttrFixture();
    unavailable.source.complete = false;
    const next = repo.dispatch(s, { type: "REFRESH", input: unavailable });
    expect(projection(next).visibility).toBe("HIDDEN");
    expect(repo.count()).toBe(1);
    expect(
      repo.dispatch(next, { type: "REFRESH", input: ttrFixture() }).confirmed?.mode,
    ).toBe("walking");
  });
  it("reversed/removed relations do not inherit or destructively delete another choice", () => {
    const repo = new TtrMemoryTestRepository();
    const s = confirmed(repo),
      reversed = ttrFixture();
    [reversed.from, reversed.to] = [reversed.to, reversed.from];
    expect(repo.open(reversed).confirmed).toBeNull();
    const removed = ttrFixture();
    removed.to = null;
    expect(repo.dispatch(s, { type: "REFRESH", input: removed }).confirmed).toBeNull();
    expect(repo.count()).toBe(1);
  });
  it("fences stale A→B→A results even after returning to identical inputs", () => {
    const { state, ticket } = pending(preview(openTtr(ttrFixture())));
    const b = ttrFixture();
    b.scope.generation = 2;
    b.scope.travellerKey = b.from!.travellerKey = b.to!.travellerKey = "B";
    const away = reduceTtr(state, { type: "REFRESH", input: b });
    const a = ttrFixture();
    a.scope.generation = 3;
    const back = preview(openTtr(a, null, away.publicationVersion + 1));
    const current = pending(back).state;
    expect(
      reduceTtr(current, {
        type: "FIXTURE_RESULT",
        ticket,
        observation: syntheticObservation(),
      }),
    ).toBe(current);
  });
  it("suppresses callbacks on Account-generation change and after draft dismissal", () => {
    const { state, ticket } = pending(preview(openTtr(ttrFixture())));
    const f = ttrFixture();
    f.scope.generation++;
    for (const next of [
      reduceTtr(state, { type: "REFRESH", input: f }),
      reduceTtr(state, { type: "DISMISS" }),
    ])
      expect(
        reduceTtr(next, {
          type: "FIXTURE_RESULT",
          ticket,
          observation: syntheticObservation(),
        }),
      ).toBe(next);
  });
  it("confirmed pending owner survives dismissal; repeated starts share the same ticket", () => {
    const repo = new TtrMemoryTestRepository();
    const { state, ticket } = pending(confirmed(repo));
    expect(reduceTtr(state, { type: "BEGIN_FIXTURE_REQUEST" })).toBe(state);
    const dismissed = reduceTtr(state, { type: "DISMISS" });
    expect(
      reduceTtr(dismissed, {
        type: "FIXTURE_RESULT",
        ticket,
        observation: syntheticObservation(),
      }).route.status,
    ).toBe("AVAILABLE");
  });
  it("Cycling is rejected before confirmation/request modeling", () => {
    expect(() => preview(openTtr(ttrFixture()), "cycling" as TtrMode)).toThrow();
  });
  it("isolates repository reads across Account, Trip and traveller branch", () => {
    const repo = new TtrMemoryTestRepository();
    confirmed(repo);
    for (const field of ["accountId", "tripId", "travellerKey"] as const) {
      const f = ttrFixture();
      const value =
        field === "travellerKey"
          ? "different-person/branch"
          : "90000000-0000-4000-8000-000000000001";
      f.scope[field] = f.from![field] = f.to![field] = value;
      expect(repo.open(f).confirmed).toBeNull();
    }
    expect(repo.open(ttrFixture()).confirmed?.mode).toBe("walking");
  });
  it("preview-mode result never enters confirmed Day presentation", () => {
    const original = confirmed(new TtrMemoryTestRepository());
    const { state, ticket } = pending(preview(original, "driving"));
    const result = reduceTtr(state, {
      type: "FIXTURE_RESULT",
      ticket,
      observation: syntheticObservation("driving"),
    });
    expect(projection(result, "SYNTHETIC_ALLOWED")).toMatchObject({
      mode: "walking",
      route: { status: "MISSING" },
    });
    expect(reduceTtr(result, { type: "DISMISS" }).confirmed?.mode).toBe("walking");
  });
  it("incomplete expired source cannot authorize cleanup", () => {
    const repo = new TtrMemoryTestRepository();
    const original = confirmed(repo),
      f = ttrFixture();
    f.source.complete = false;
    const unavailable = repo.dispatch(original, { type: "REFRESH", input: f });
    repo.dispatch(unavailable, { type: "CLEANUP", now: "2026-10-30T00:00:00Z" });
    expect(repo.count()).toBe(1);
  });
});
describe("presentation and offline lifecycle", () => {
  it("shows straight-line without mode/ETA and allows external maps", () => {
    const p = projection(openTtr(ttrFixture()));
    expect(p.visibility).toBe("STRAIGHT_LINE");
    expect(p.modeOrigin).toBe("NONE");
    expect(p.route).toEqual({ status: "MISSING" });
    expect(p.actions.externalMaps).not.toBeNull();
    expect(p.actions.openTtr).not.toBeNull();
    expect(JSON.stringify(p)).not.toContain("durationSeconds");
    expect(JSON.stringify(p)).not.toContain("routeDistanceMeters");
    expect(Object.isFrozen(p)).toBe(true);
  });
  it("shows selected mode with no provider estimate", () => {
    const p = projection(confirmed(new TtrMemoryTestRepository()));
    expect(p).toMatchObject({
      visibility: "SELECTED_MODE",
      mode: "walking",
      modeOrigin: "USER_CONFIRMED",
      route: { status: "MISSING" },
    });
  });
  it("requires synthetic display permission and never presents Apple data as synthetic", () => {
    const { state, ticket } = pending(confirmed(new TtrMemoryTestRepository()));
    const available = reduceTtr(state, {
      type: "FIXTURE_RESULT",
      ticket,
      observation: syntheticObservation(),
    });
    expect(projection(available).route).toEqual({ status: "MISSING" });
    expect(projection(available, "SYNTHETIC_ALLOWED").route).toMatchObject({
      status: "AVAILABLE",
      observation: {
        source: "SYNTHETIC_FIXTURE",
        provider: "SYNTHETIC",
        durationSeconds: 600,
      },
    });
    const forbidden = reduceTtr(state, {
      type: "FIXTURE_RESULT",
      ticket,
      observation: { ...syntheticObservation(), provider: "APPLE" },
    });
    expect(forbidden.route.status).toBe("FAILED");
  });
  it("rejects mode substitution and invalid/fabricated fixture metrics", () => {
    const { state, ticket } = pending(confirmed(new TtrMemoryTestRepository()));
    for (const observation of [
      syntheticObservation("driving"),
      { ...syntheticObservation(), durationSeconds: -1 },
      { ...syntheticObservation(), source: "REAL" },
    ])
      expect(
        reduceTtr(state, { type: "FIXTURE_RESULT", ticket, observation }).route.status,
      ).toBe("FAILED");
  });
  it("suggestion stays ephemeral, requires exact execution within90min, and choice wins", () => {
    const f = ttrFixture();
    f.period = "TODAY";
    f.queryTime = {
      kind: "DEPARTURE",
      instant: "2026-10-11T23:00:00Z",
      zone: "Pacific/Auckland",
      quality: "EXACT",
      precision: 0,
      comparable: true,
    };
    const repo = new TtrMemoryTestRepository();
    const s = repo.open(f);
    const options = {
      now,
      displayPermission: "DENIED" as const,
      suggestion: {
        source: "SYNTHETIC_TRUSTED_CONTEXT" as const,
        mode: "transit" as const,
      },
    };
    expect(projectTtr(s, options)).toMatchObject({
      visibility: "SUGGESTED_MODE",
      modeOrigin: "SYSTEM_SUGGESTED",
    });
    expect(repo.count()).toBe(0);
    expect(s.confirmed).toBeNull();
    expect(projectTtr(confirmed(repo, f), options).modeOrigin).toBe("USER_CONFIRMED");
    f.queryTime.quality = "ESTIMATED";
    expect(projectTtr(openTtr(f), options).visibility).toBe("STRAIGHT_LINE");
    f.queryTime.quality = "EXACT";
    f.queryTime.instant = "2026-10-12T02:00:00Z";
    expect(projectTtr(openTtr(f), options).visibility).toBe("STRAIGHT_LINE");
  });
  it("Past hides ordinary assistance and exposes no map/provider actions", () => {
    const f = ttrFixture();
    f.period = "PAST";
    const p = projection(openTtr(f));
    expect(p.visibility).toBe("HIDDEN");
    expect(p.actions.externalMaps).toBeNull();
    expect(p.route.status).toBe("MISSING");
  });
  it("expires by authoritative Event date in its zone, never by UTC/device day", () => {
    const expiry = ttrFixture().expiry;
    expect(ttrExpired(expiry, "2026-10-12T10:59:59Z")).toBe(false);
    expect(ttrExpired(expiry, "2026-10-12T11:00:00Z")).toBe(true);
    const repo = new TtrMemoryTestRepository();
    const s = confirmed(repo);
    expect(
      repo.dispatch(s, { type: "CLEANUP", now: "2026-10-12T11:00:00Z" }).confirmed,
    ).toBeNull();
    expect(repo.count()).toBe(0);
  });
  it.each([
    null,
    { eventDate: "2026-02-30", zone: "UTC" },
    { eventDate: "2026-10-12", zone: "" },
    { eventDate: "2026-10-12", zone: "+13:00" },
    { eventDate: "2026-10-12", zone: "Invalid/Zone" },
  ])("unknown/invalid date or zone never deletes: %s", (expiry) => {
    const f = ttrFixture();
    f.expiry = expiry;
    const repo = new TtrMemoryTestRepository();
    const s = confirmed(repo, f);
    expect(
      repo.dispatch(s, { type: "CLEANUP", now: "2026-10-30T00:00:00Z" }).confirmed?.mode,
    ).toBe("walking");
    expect(repo.count()).toBe(1);
  });
  it("date edit updates expiry without resetting confirmation", () => {
    const repo = new TtrMemoryTestRepository();
    const s = confirmed(repo),
      f = ttrFixture();
    f.expiry!.eventDate = "2026-10-20";
    const next = repo.dispatch(s, { type: "REFRESH", input: f });
    expect(next.confirmed?.selectedAt).toBe(now);
    expect(next.confirmed?.expiry?.eventDate).toBe("2026-10-20");
    expect(
      repo.dispatch(next, { type: "CLEANUP", now: "2026-10-13T00:00:00Z" }).confirmed
        ?.mode,
    ).toBe("walking");
  });
  it("restart restores only explicitly retained in-memory selection, never results/drafts", () => {
    const repo = new TtrMemoryTestRepository();
    const { state, ticket } = pending(confirmed(repo));
    reduceTtr(state, {
      type: "FIXTURE_RESULT",
      ticket,
      observation: syntheticObservation(),
    });
    const reopened = repo.open(ttrFixture(), 100);
    expect(reopened.confirmed?.mode).toBe("walking");
    expect(reopened.route.status).toBe("MISSING");
    expect(new TtrMemoryTestRepository().open(ttrFixture()).confirmed).toBeNull();
  });
});

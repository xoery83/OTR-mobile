import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  ordinaryFixture,
  ordinaryHash,
  ordinaryPlace,
  ordinaryTime,
} from "./__fixtures__/coreOrdinaryOrder";
import { qualifyCoreTtr, projectOrdinaryOrder } from "./tripCoreTtr";
import { applyCoreCommand } from "./tripCoreV2Mutation";
import { corePlaceView } from "./tripCoreV2Day";
import { qualifyTtr } from "./ttr";
import { buildCoreActorCollection } from "../../../backend/src/tripCoreV2Collection";
import { validateCoreReadCollection } from "./tripCoreV2Read";
const qualify = (f: ReturnType<typeof ordinaryFixture>, i = 0) =>
  qualifyCoreTtr(
    f.graph,
    f.actor,
    f.orderId,
    f.ids[i],
    f.ids[i + 1],
    { accountId: f.actor.accountId, tripId: f.actor.tripId, generation: 0 },
    { epoch: "snapshot" },
    [f.actor.personId!],
    ordinaryHash,
  );
describe("Core ordinary ordering authority, CLOSED synthetic", () => {
  it("qualifies three independent pairs, accepted null-Place-ID coordinates and exact existing TTR input grammar", async () => {
    const f = ordinaryFixture();
    for (let i = 0; i < 3; i++) {
      const q = await qualify(f, i);
      expect(q.status).toBe("QUALIFIED");
      if (q.status === "QUALIFIED") {
        expect(qualifyTtr(q.input).status).toBe("QUALIFIED");
        expect(q.input.expiry).toEqual({ eventDate: "2027-01-15", zone: "UTC" });
        expect(q.authorityKey).toMatch(/^[a-f0-9]{64}$/);
      }
    }
    expect(corePlaceView(ordinaryPlace())).toMatchObject({ qualification: "QUALIFIED" });
  });
  it("unresolved intermediate blocks only incident pairs, never skips it", async () => {
    const f = ordinaryFixture();
    (f.graph.trip_person_ordinary_orders[0].nodes as any[])[1].entry = null;
    (f.graph.trip_person_ordinary_orders[0].nodes as any[])[1].exit = null;
    expect((await qualify(f, 0)).status).toBe("UNAVAILABLE");
    expect((await qualify(f, 1)).status).toBe("UNAVAILABLE");
    expect((await qualify(f, 2)).status).toBe("QUALIFIED");
  });
  it("redacts a private intermediate without leaking its UUID or manufacturing adjacency", async () => {
    const f = ordinaryFixture();
    f.graph.itinerary_events[1].owner_account_id = randomUUID();
    f.graph.itinerary_events[1].visibility = "PRIVATE";
    const p = projectOrdinaryOrder(
      f.graph,
      f.actor,
      f.graph.trip_person_ordinary_orders[0],
    );
    expect(JSON.stringify(p)).not.toContain(f.ids[1]);
    expect((p.gaps as any[])[0]).toMatchObject({ coverage: "UNKNOWN", complete: false });
    expect((await qualify(f, 2)).status).toBe("QUALIFIED");
    const col = await buildCoreActorCollection(
      f.graph,
      f.actor,
      {
        epoch: randomUUID(),
        revision: 1,
        accessRevision: 1,
        generatedAt: "2026-10-13T00:00:00Z",
      },
      [
        {
          person_id: f.actor.personId!,
          account_id: f.actor.accountId,
          active: true,
          participating: true,
          revision: 1,
        },
      ],
      ordinaryHash,
      [],
      [],
      [],
      1,
    );
    expect(JSON.stringify(col)).not.toContain(f.ids[1]);
    await validateCoreReadCollection(
      col.manifest,
      col.pages,
      f.actor.accountId,
      f.actor.tripId,
      ordinaryHash,
    );
  });
  it("unplaced private scope with unknown timezone cannot be excluded by a neighboring civil date", async () => {
    const f = ordinaryFixture();
    const privateId = randomUUID();
    f.graph.itinerary_events.push({
      ...f.graph.itinerary_events[0],
      id: privateId,
      owner_account_id: randomUUID(),
      visibility: "PRIVATE",
      start_local_date: "2027-01-14",
      start_zone_id: null,
    });
    expect((await qualify(f)).status).toBe("UNAVAILABLE");
    const p = projectOrdinaryOrder(
      f.graph,
      f.actor,
      f.graph.trip_person_ordinary_orders[0],
    );
    expect(JSON.stringify(p)).not.toContain(privateId);
  });
  it("does not expose ordering without explicit read2 negotiation", async () => {
    const f = ordinaryFixture(),
      col = await buildCoreActorCollection(
        f.graph,
        f.actor,
        {
          epoch: randomUUID(),
          revision: 1,
          accessRevision: 1,
          generatedAt: "2026-10-13T00:00:00Z",
        },
        [],
        ordinaryHash,
      );
    expect(col.manifest).not.toHaveProperty("ordinaryOrderVersion");
    expect(col.manifest.rosters).toHaveLength(7);
    expect(col.pages.flatMap((p) => p.records).some((r) => r.kind === "ORDER")).toBe(
      false,
    );
  });
  it("keeps occurrence tokens and personal identity stable on same-day reschedule", async () => {
    const f = ordinaryFixture(),
      before = await qualify(f);
    for (const item of f.graph.itinerary_events) {
      item.start_local_date = "2027-02-01";
      item.semantic_revision = 2;
    }
    const after = await qualify(f);
    expect(after.status).toBe("QUALIFIED");
    if (before.status === "QUALIFIED" && after.status === "QUALIFIED") {
      expect(after.input.from!.occurrenceToken).toBe(before.input.from!.occurrenceToken);
      expect(after.input.scope.travellerKey).toBe(before.input.scope.travellerKey);
      expect(after.authorityKey).not.toBe(before.authorityKey);
      expect(after.input.expiry!.eventDate).toBe("2027-02-01");
    }
  });
  it("fails closed on missing zone, text-only coordinates and Person rebinding", async () => {
    const f = ordinaryFixture();
    f.graph.itinerary_events[1].start_zone_id = null;
    expect((await qualify(f)).status).toBe("UNAVAILABLE");
    f.graph.itinerary_events[1].start_zone_id = "UTC";
    f.graph.itinerary_events[0].accepted_latitude = null;
    expect((await qualify(f)).status).toBe("UNAVAILABLE");
    f.actor.personId = randomUUID();
    expect((await qualify(f)).status).toBe("UNAVAILABLE");
  });
  it("UNKNOWN coverage fences only that gap; accepted leg coverage excludes a duplicate movement", async () => {
    const f = ordinaryFixture(),
      gaps = f.graph.trip_person_ordinary_orders[0].gaps as any[];
    gaps[0].coverage = "UNKNOWN";
    expect((await qualify(f)).status).toBe("UNAVAILABLE");
    expect((await qualify(f, 1)).status).toBe("QUALIFIED");
    const leg = {
      ...f.graph.itinerary_events[0],
      id: randomUUID(),
      temporal_shape: "TRANSPORT",
      experience_family: "P5",
    };
    f.graph.itinerary_events.push(leg);
    gaps[0].coverage = "EXPLICIT_TRANSPORT";
    gaps[0].transportId = leg.id;
    expect(await qualify(f)).toMatchObject({
      status: "UNAVAILABLE",
      reason: "EXPLICIT_TRANSPORT",
    });
  });
  it("Transport exit is destination/arrival, preserving terminal annotations", async () => {
    const f = ordinaryFixture();
    const item = f.graph.itinerary_events[0];
    item.temporal_shape = "TRANSPORT";
    item.experience_family = "P5";
    (f.graph.trip_person_ordinary_orders[0].nodes as any[])[0] = {
      eventId: item.id,
      entry: "ORIGIN",
      exit: "DESTINATION",
    };
    for (const role of ["ORIGIN", "DESTINATION"])
      f.graph.itinerary_transport_endpoints.push({
        event_id: item.id,
        trip_id: f.actor.tripId,
        role,
        ...ordinaryTime(),
        ...ordinaryPlace(role === "ORIGIN" ? 80 : 1),
      });
    f.graph.trip_endpoint_details.push({
      event_id: item.id,
      trip_id: f.actor.tripId,
      role: "DESTINATION",
      airport_code: null,
      terminal: "arrival-terminal",
      platform: null,
      pier: null,
    });
    const q = await qualify(f);
    expect(q.status).toBe("QUALIFIED");
    if (q.status === "QUALIFIED") {
      expect(q.input.from!.role).toBe("DESTINATION");
      expect(JSON.parse(q.input.anchors.fromRowKey)[1]).toBe("DESTINATION");
      expect(q.input.from!.endpoint!.coordinates!.latitude).toBe(1);
      expect(q.spatial.annotations[0].terminal).toBe("arrival-terminal");
    }
  });
  it("explicit branch rebind changes authority and traveller identity without inventing a split", async () => {
    const f = ordinaryFixture(),
      before = await qualify(f),
      q = structuredClone(f.order);
    q.operationId = randomUUID();
    q.payload.branchId = randomUUID();
    q.baseVector = q.baseVector.map((v) =>
      v.kind === "ORDER" ? { ...v, revision: 1 } : v,
    );
    f.graph = applyCoreCommand(f.graph, q, f.actor, "2026-10-13T00:00:00Z").graph;
    const after = await qualify(f);
    expect(after.status).toBe("QUALIFIED");
    if (before.status === "QUALIFIED" && after.status === "QUALIFIED") {
      expect(after.authorityKey).not.toBe(before.authorityKey);
      expect(after.input.scope.travellerKey).not.toBe(before.input.scope.travellerKey);
    }
  });
  it("same coordinate or venue ID is not SAME_LOCATION authority", async () => {
    const f = ordinaryFixture();
    Object.assign(f.graph.itinerary_events[1], ordinaryPlace(1), {
      accepted_place_id: randomUUID(),
    });
    f.graph.itinerary_events[0].accepted_place_id =
      f.graph.itinerary_events[1].accepted_place_id;
    const q = await qualify(f);
    expect(q).toMatchObject({
      status: "QUALIFIED",
      spatial: { equivalence: "UNKNOWN", proximityAuthority: "GEOMETRY_ONLY" },
    });
  });
  it("pins author-self and exact CAS, and rejects genuine repeated Item membership", () => {
    const f = ordinaryFixture();
    expect(() =>
      applyCoreCommand(f.graph, f.order, f.actor, "2026-10-13T00:00:00Z"),
    ).toThrow("REVISION_CONFLICT");
    const repeated = structuredClone(f.order);
    repeated.payload.nodes[1].eventId = repeated.payload.nodes[0].eventId;
    expect(() =>
      applyCoreCommand(f.graph, repeated, f.actor, "2026-10-13T00:00:00Z"),
    ).toThrow("INVALID_ORDINARY_ORDER");
    const q = structuredClone(f.order);
    q.operationId = randomUUID();
    q.payload.personId = randomUUID();
    q.baseVector = q.baseVector.map((v) =>
      v.kind === "ORDER" ? { ...v, revision: 1 } : v,
    );
    expect(() => applyCoreCommand(f.graph, q, f.actor, "2026-10-13T00:00:00Z")).toThrow(
      "INVALID_SELF_PERSON",
    );
  });
});

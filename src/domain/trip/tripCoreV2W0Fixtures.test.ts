import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  coreDefaults,
  coreKindTables,
  corePlaceSchema,
  itinerary_transport_servicesSchema,
  type CoreKind,
} from "./tripCoreV2";
import { applyCoreCommand, emptyCoreGraph } from "./tripCoreV2Mutation";
import { coreDateBoundary, normalizeCoreClock } from "./tripCoreV2Temporal";
import { projectCoreDay } from "./tripCoreV2Day";
type Fixture = {
  case: string;
  items: string[];
  bookings: string[];
  entitlements: string[];
  bookingItemLinks: string[][];
  entitlementItemLinks: string[][];
  itemFacts: {
    id: string;
    family: string;
    originDate?: string;
    startDate?: string;
    endDate?: string;
    flightNumberLiteral?: string;
    propertyName?: string;
    reservedCategory?: string;
    pickupPlaceLiteral?: string;
    serviceSubtype?: string;
    startLocalTime?: string;
    endLocalTime?: string;
    startInstant?: string;
    endInstant?: string;
    zoneId?: string;
    clockPrecision?: number;
  }[];
  bookingFacts?: {
    id: string;
    due: { minor: number; currency: string; scale: number };
  }[];
  entitlementFacts?: {
    id: string;
    kind?: string;
    quantity?: number;
    accessClass?: string;
    validFromDate?: string;
    validUntilDate?: string;
    validityPrecision?: string;
  }[];
};
const document = readFileSync(
  new URL("../../../docs/trip/contracts/W0_OWNER_REVIEW.md", import.meta.url),
  "utf8",
);
const fixtures = JSON.parse(
  document.split("```json\n")[1].split("\n```")[0],
) as Fixture[];
const place = (label: string | null) => ({
  ...Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
  authored_label: label,
});
// These are pure W0 synthetic graph fixtures, not sealed Source or deployed resolver authority.
it.each(fixtures)(
  "executes $case accepted W0 graph without extra roots or inferred originals",
  (fixture) => {
    const ids = new Map(
      [...fixture.items, ...fixture.bookings, ...fixture.entitlements].map((k) => [
        k,
        randomUUID(),
      ]),
    );
    const actor = {
      accountId: randomUUID(),
      tripId: randomUUID(),
      personId: null,
      personIds: [],
      active: true,
      canManageShared: false,
    };
    let graph = emptyCoreGraph();
    function apply(
      command: string,
      kind: CoreKind,
      label: string,
      payload: unknown,
      refs: { kind: CoreKind; label: string }[] = [],
    ) {
      const id = ids.get(label)!;
      const vector = [
        { kind, id, revision: null as number | null },
        ...refs.map((ref) => {
          const id = ids.get(ref.label)!;
          const row = graph[coreKindTables[ref.kind]].find((r) => r.id === id)!;
          return {
            kind: ref.kind,
            id,
            revision: row[
              ref.kind === "ITEM" ? "semantic_revision" : "revision"
            ] as number,
          };
        }),
      ].sort((a, b) => (a.kind + ":" + a.id < b.kind + ":" + b.id ? -1 : 1));
      graph = applyCoreCommand(
        graph,
        {
          contractVersion: 2,
          intentVersion: 2,
          operationId: randomUUID(),
          tripId: actor.tripId,
          command,
          target: { kind, id },
          baseVector: vector,
          admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
          payload,
        },
        actor,
        "2026-10-12T00:00:00Z",
      ).graph;
    }
    for (const fact of fixture.itemFacts) {
      if (fact.family === "P2") {
        apply("CREATE_SPARSE_FLIGHT", "ITEM", fact.id, {
          flightNumberLiteral: fact.flightNumberLiteral,
          departureDate: fact.originDate,
          ...coreDefaults("member"),
        });
        continue;
      }
      const boundary = (role: "start" | "end") => {
        const date = role === "start" ? fact.startDate : fact.endDate;
        const clock = role === "start" ? fact.startLocalTime : fact.endLocalTime;
        const instant = role === "start" ? fact.startInstant : fact.endInstant;
        if (!date) return undefined;
        const base = coreDateBoundary(date);
        if (!clock || !instant) return base;
        const local = normalizeCoreClock(clock, fact.clockPrecision!);
        return {
          ...base,
          instant,
          local_time: local,
          clock_precision: fact.clockPrecision,
          zone_id: fact.zoneId,
          quality: "EXACT",
          civil_resolution: "UNIQUE",
          resolution_offset_seconds:
            (Date.parse(date + "T" + local + "Z") - Date.parse(instant)) / 1000,
          interpretation_key: "synthetic-w0/1",
          interpretation_input_sha256: "0".repeat(64),
        };
      };
      const service = {
        ...Object.fromEntries(
          Object.keys(itinerary_transport_servicesSchema.shape)
            .filter((k) => !["trip_id", "event_id"].includes(k))
            .map((k) => [k, null]),
        ),
        service_key: "main",
        transport_subtype: fact.serviceSubtype,
        attribution: "UNSPECIFIED",
        // Required service fields are explicit synthetic test inputs, never inferred supplier facts.
        operator_namespace: "NAME",
        operator_issuer: "SYNTHETIC_W0_FIXTURE",
        operator_value: fixture.case,
        operator_literal: fixture.case,
        service_number: "synthetic",
        service_literal: "Synthetic fixture service",
      };
      apply("CREATE_ITEM", "ITEM", fact.id, {
        family: fact.family,
        core: { title: fact.id },
        ...coreDefaults("member"),
        ...(fact.family === "P5"
          ? {
              endpoints: {
                origin: { time: coreDateBoundary(fact.originDate!), place: place(null) },
                destination: {
                  time: coreDateBoundary(fact.originDate!),
                  place: place(null),
                },
              },
              service,
            }
          : {
              schedule: {
                start: boundary("start"),
                ...(fact.endDate ? { end: boundary("end") } : {}),
              },
            }),
        ...(fact.family === "P3"
          ? { details: { property_name: fact.propertyName } }
          : {}),
        ...(fact.family === "P4"
          ? {
              details: { reserved_category: fact.reservedCategory },
              places: { pickup: place(fact.pickupPlaceLiteral!) },
            }
          : {}),
      });
    }
    for (const label of fixture.bookings) {
      const itemLabels = fixture.bookingItemLinks
        .filter(([booking]) => booking === label)
        .map(([, item]) => item);
      const due = fixture.bookingFacts?.find((f) => f.id === label)?.due;
      apply(
        "CREATE_BOOKING",
        "BOOKING",
        label,
        {
          fields: {
            title: label,
            ...(due
              ? { due_minor: due.minor, due_currency: due.currency, due_scale: due.scale }
              : {}),
          },
          observations: [],
          itemIds: itemLabels.map((label) => ids.get(label)),
          entitlementIds: [],
          documentIds: [],
          acl: coreDefaults("member").acl,
        },
        itemLabels.map((label) => ({ kind: "ITEM", label })),
      );
    }
    for (const label of fixture.entitlements) {
      const itemLabels = fixture.entitlementItemLinks
        .filter(([ticket]) => ticket === label)
        .map(([, item]) => item);
      const fact = fixture.entitlementFacts?.find((f) => f.id === label);
      apply(
        "CREATE_ENTITLEMENT",
        "ENTITLEMENT",
        label,
        {
          fields: {
            title: label,
            kind: fact?.kind ?? "TICKET",
            ...(fact?.quantity ? { quantity: fact.quantity } : {}),
            ...(fact?.accessClass ? { access_class: fact.accessClass } : {}),
            ...(fact?.validFromDate
              ? {
                  valid_from_date: fact.validFromDate,
                  valid_until_date: fact.validUntilDate,
                  validity_precision: fact.validityPrecision,
                }
              : {}),
          },
          holders: [],
          itemLinks: itemLabels.map((label) => ({ itemId: ids.get(label) })),
          documentIds: [],
          acl: coreDefaults("member").acl,
        },
        itemLabels.map((label) => ({ kind: "ITEM", label })),
      );
    }
    expect(graph.itinerary_events.map((r) => r.id).sort()).toEqual(
      fixture.items.map((k) => ids.get(k)).sort(),
    );
    expect(graph.itinerary_reservations).toHaveLength(fixture.bookings.length);
    expect(graph.trip_entitlements).toHaveLength(fixture.entitlements.length);
    expect(graph.trip_booking_item_links).toHaveLength(fixture.bookingItemLinks.length);
    expect(graph.trip_entitlement_item_links).toHaveLength(
      fixture.entitlementItemLinks.length,
    );
    expect(graph.trip_entitlement_holders).toEqual([]);
    expect(graph.trip_operational_documents).toEqual([]);
    expect(graph.expense_links).toEqual([]);
    for (const fact of fixture.bookingFacts ?? [])
      expect(
        graph.itinerary_reservations.find((r) => r.id === ids.get(fact.id)),
      ).toMatchObject({ due_minor: fact.due.minor, commercial_status: "ACTIVE" });
    if (fixture.case === "A08")
      expect(projectCoreDay(graph, actor, "2026-12-14", 1)).toEqual([]);
  },
);

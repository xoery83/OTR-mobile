import { describe, expect, it } from "vitest";
import {
  instantMicroseconds,
  itemsForLocalDate,
  localCalendarDate,
  nextCalendarDate,
  today,
  tomorrow,
  nextComparableEvent,
  unresolvedCandidates,
  type DayBoundary,
  type DayEvent,
  type DayProjection,
} from "./dayReadModel";
const blankBoundary = {
  instant: null,
  local_date: null,
  local_time: null,
  clock_precision: null,
  quality: null,
  basis: null,
  zone_id: null,
  supplied_offset_seconds: null,
  source_instant: null,
  source_instant_precision: null,
  civil_resolution: null,
  resolution_offset_seconds: null,
  interpretation_key: null,
  interpretation_input_sha256: null,
  provenance_refs: null,
  authored_label: null,
  authored_text: null,
  authored_address: null,
  accepted_address: null,
  accepted_latitude: null,
  accepted_longitude: null,
  accepted_place_id: null,
  spatial_provenance_refs: null,
  location_input_revision: null,
  authored_address_line1: null,
  authored_address_line2: null,
  authored_address_locality: null,
  authored_address_region: null,
  authored_address_postal_code: null,
  authored_address_country: null,
  accepted_address_line1: null,
  accepted_address_line2: null,
  accepted_address_locality: null,
  accepted_address_region: null,
  accepted_address_postal_code: null,
  accepted_address_country: null,
};
function boundary(
  role: DayBoundary["role"],
  instant: string | null = null,
  fields: Partial<DayBoundary> = {},
): DayBoundary {
  return {
    ...blankBoundary,
    role,
    instant,
    quality: instant ? "EXACT" : "UNKNOWN",
    basis: instant ? "SOURCE_INSTANT" : "DERIVED_CIVIL",
    source_instant: instant,
    ...fields,
  };
}
function event(
  id = "a",
  shape: DayEvent["temporal_shape"] = "POINT",
  start: string | null = null,
  end: string | null = null,
): DayEvent {
  return {
    ...blankBoundary,
    id,
    semantic_revision: 1,
    title: id,
    event_type: "activity",
    status: "planned",
    order_index: null,
    trip_day_id: null,
    temporal_shape: shape,
    participant_scope: "UNASSIGNED",
    timing_label: null,
    timing_provenance_ref: null,
    is_estimated_time: false,
    boundaries:
      shape === "TRANSPORT"
        ? [boundary("ORIGIN", start), boundary("DESTINATION", end)]
        : [boundary("START", start), boundary("END", end)],
  };
}
function projection(...events: DayEvent[]): DayProjection {
  return {
    accountId: "a",
    tripId: "t",
    version: 1,
    generation: 1,
    source: { epochId: "e", revision: "1", fingerprint: "hash", appliedGeneration: 1 },
    events,
  };
}
const ids = (q: ReturnType<typeof itemsForLocalDate>) =>
  [...q.timed, ...q.nonComparable].map((i) => i.event.id);
describe("explicit Gregorian/IANA context", () => {
  it.each([
    ["2026-01-01T00:30:00Z", "Pacific/Auckland", "2026-01-01"],
    ["2026-01-01T00:30:00Z", "America/Los_Angeles", "2025-12-31"],
    ["2026-03-08T06:30:00Z", "America/New_York", "2026-03-08"],
    ["2026-11-01T05:30:00Z", "America/New_York", "2026-11-01"],
    ["2026-11-01T06:30:00Z", "America/New_York", "2026-11-01"],
  ])("%s in %s gives %s", (now, zone, date) =>
    expect(localCalendarDate(now, zone)).toBe(date),
  );
  it.each([
    ["2026-12-31", "2027-01-01"],
    ["2028-02-28", "2028-02-29"],
    ["2028-02-29", "2028-03-01"],
  ])("calendar successor %s", (date, next) => expect(nextCalendarDate(date)).toBe(next));
  it.each(["2026-02-29", "2026-04-31", "2026-1-01", "x"])(
    "rejects invalid date %s",
    (date) => expect(() => itemsForLocalDate(projection(), date, "UTC")).toThrow(),
  );
  it.each(["", "Device/Default", "+12:00"])("rejects implicit/invalid zone %s", (zone) =>
    expect(() => today(projection(), "2026-01-01T00:00:00Z", zone)).toThrow(),
  );
  it("Tomorrow crosses spring-forward by calendar label, not 24 hours", () => {
    const p = projection(
      event("today", "POINT", "2026-03-08T06:00:00Z"),
      event("tomorrow", "POINT", "2026-03-09T04:30:00Z"),
    );
    expect(ids(today(p, "2026-03-08T04:30:00Z", "America/New_York"))).toEqual([]);
    expect(ids(tomorrow(p, "2026-03-08T04:30:00Z", "America/New_York"))).toEqual([
      "today",
    ]);
    expect(ids(tomorrow(p, "2026-03-08T06:30:00Z", "America/New_York"))).toEqual([
      "tomorrow",
    ]);
  });
  it("Tomorrow crosses fall-back without repeating Today", () =>
    expect(tomorrow(projection(), "2026-11-01T04:30:00Z", "America/New_York").date).toBe(
      "2026-11-02",
    ));
});
describe("lossless temporal classes and occupancy", () => {
  it("same-zone timed anchor keeps original offset and six digits", () => {
    const instant = "2026-12-17T10:30:00.123456+13:00";
    const q = itemsForLocalDate(
      projection(event("a", "POINT", instant)),
      "2026-12-17",
      "Pacific/Auckland",
    );
    expect(q.timed[0].anchor).toBe(instant);
    expect(q.nonComparable).toEqual([]);
  });
  it("cross-zone endpoints retain roles on separate local days", () => {
    const e = event(
      "flight",
      "TRANSPORT",
      "2026-12-17T23:00:00-08:00",
      "2026-12-19T15:00:00+13:00",
    );
    expect(itemsForLocalDate(projection(e), "2026-12-18", "UTC").timed[0].roles).toEqual([
      "ORIGIN",
    ]);
    expect(itemsForLocalDate(projection(e), "2026-12-18", "UTC").timed[0].occupancy).toBe(
      true,
    );
    expect(
      itemsForLocalDate(projection(e), "2026-12-19", "Pacific/Auckland").timed[0].roles,
    ).toEqual(["DESTINATION"]);
  });
  it.each(["CALENDAR", "ALL_DAY", "WINDOW", "POINT"] as const)(
    "%s preserves date-only/qualitative facts without midnight",
    (shape) => {
      const e = event("a", shape);
      e.boundaries[0].local_date = "2026-12-17";
      if (shape === "WINDOW") e.timing_label = "late afternoon";
      const q = itemsForLocalDate(projection(e), "2026-12-17", "Pacific/Auckland");
      expect(q.timed).toEqual([]);
      expect(q.nonComparable[0].anchor).toBeNull();
      expect(q.nonComparable[0].event.temporal_shape).toBe(shape);
    },
  );
  it("named ALL_DAY occupies overlapping query Days without appointment instants", () => {
    const e = event("hike", "ALL_DAY");
    Object.assign(e.boundaries[0], {
      quality: null,
      local_date: "2026-12-17",
      zone_id: "Pacific/Auckland",
    });
    const p = projection(e);
    for (const date of ["2026-12-16", "2026-12-17"]) {
      const item = itemsForLocalDate(p, date, "America/Los_Angeles").nonComparable[0];
      expect(item).toMatchObject({
        occupancy: true,
        occupancyBasis: "NAMED_DAY",
        anchor: null,
      });
      expect(item.event.boundaries[0].instant).toBeNull();
    }
    expect(ids(itemsForLocalDate(p, "2026-12-18", "America/Los_Angeles"))).toEqual([]);
  });
  it("estimated span anchors do not establish exact occupancy", () => {
    const e = event("approx", "SPAN", "2026-12-17T12:00:00Z", "2026-12-20T00:00:00Z");
    e.boundaries[0].quality = "ESTIMATED";
    expect(itemsForLocalDate(projection(e), "2026-12-17", "UTC").timed[0].occupancy).toBe(
      false,
    );
    expect(ids(itemsForLocalDate(projection(e), "2026-12-18", "UTC"))).toEqual([]);
  });
  it("estimated anchor stays estimated", () => {
    const e = event("a", "POINT", "2026-12-17T12:00:00Z");
    e.boundaries[0].quality = "ESTIMATED";
    e.is_estimated_time = true;
    expect(
      itemsForLocalDate(projection(e), "2026-12-17", "UTC").timed[0].event.boundaries[0]
        .quality,
    ).toBe("ESTIMATED");
  });
  it.each(["PENDING", "GAP", "FOLD"] as const)(
    "%s floating civil clock cannot become a comparable instant",
    (resolution) => {
      const e = event();
      Object.assign(e.boundaries[0], {
        local_date: "2026-12-17",
        local_time: "10:30:00.123456",
        quality: "EXACT",
        civil_resolution: resolution,
        zone_id: "Pacific/Auckland",
      });
      const p = projection(e);
      expect(
        itemsForLocalDate(p, "2026-12-17", "Pacific/Auckland").nonComparable,
      ).toHaveLength(1);
      expect(nextComparableEvent(p, "2026-12-17T00:00:00Z", "UTC").next).toBeNull();
    },
  );
  it("untimed/no-date candidate remains unresolved without invented day", () => {
    const p = projection(event());
    expect(ids(itemsForLocalDate(p, "2026-12-17", "UTC"))).toEqual([]);
    expect(unresolvedCandidates(p)).toHaveLength(1);
  });
  it("conflicting retained civil/source evidence is non-comparable", () => {
    const e = event("a", "POINT", "2026-12-17T10:00:00Z");
    Object.assign(e.boundaries[0], {
      local_date: "2026-12-17",
      local_time: "09:00:00",
      zone_id: "UTC",
      civil_resolution: "UNIQUE",
      resolution_offset_seconds: 0,
    });
    expect(itemsForLocalDate(projection(e), "2026-12-17", "UTC").timed).toEqual([]);
    expect(
      nextComparableEvent(projection(e), "2026-12-17T00:00:00Z", "UTC").unresolved,
    ).toHaveLength(1);
  });
  it.each(["SPAN", "STAY", "TRANSPORT"] as const)(
    "%s multi-day half-open occupancy",
    (shape) => {
      const p = projection(
        event("a", shape, "2026-12-17T12:00:00Z", "2026-12-20T00:00:00Z"),
      );
      expect(itemsForLocalDate(p, "2026-12-18", "UTC").timed[0].occupancy).toBe(true);
      expect(itemsForLocalDate(p, "2026-12-19", "UTC").timed[0].occupancy).toBe(true);
      const last = itemsForLocalDate(p, "2026-12-20", "UTC");
      expect(last.timed[0].occupancy).toBe(false); // Explicit end milestone still exists.
      expect(ids(itemsForLocalDate(p, "2026-12-21", "UTC"))).toEqual([]);
    },
  );
  it("STAY unknown clocks derive calendar nights, not duration", () => {
    const e = event("stay", "STAY");
    e.boundaries[0].local_date = "2026-12-17";
    e.boundaries[1].local_date = "2026-12-20";
    const q = itemsForLocalDate(projection(e), "2026-12-18", "UTC");
    expect(q.nonComparable[0]).toMatchObject({
      occupancy: true,
      anchor: null,
      roles: [],
    });
    expect(
      itemsForLocalDate(projection(e), "2026-12-20", "UTC").nonComparable[0].occupancy,
    ).toBe(false);
  });
  it.each(["SPAN", "TRANSPORT", "STAY"] as const)(
    "%s missing boundary never extends occupancy",
    (shape) => {
      const p = projection(event("a", shape, "2026-12-17T12:00:00Z"));
      expect(itemsForLocalDate(p, "2026-12-17", "UTC").timed[0].occupancy).toBe(false);
      expect(ids(itemsForLocalDate(p, "2026-12-18", "UTC"))).toEqual([]);
    },
  );
  it("equal interval has zero occupancy and explicit endpoint milestones", () => {
    const e = event("a", "TRANSPORT", "2026-12-17T12:00:00Z", "2026-12-17T12:00:00Z");
    expect(itemsForLocalDate(projection(e), "2026-12-17", "UTC").timed[0]).toMatchObject({
      roles: ["DESTINATION", "ORIGIN"],
      occupancy: false,
    });
  });
  it.each([
    ["2026-03-08", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z"],
    ["2026-11-01", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z"],
  ])("DST %s exact day boundaries", (date, start, end) => {
    const e = event("span", "SPAN", start, end),
      p = projection(e);
    expect(itemsForLocalDate(p, date, "America/New_York").timed[0].roles).toEqual([
      "START",
    ]);
    expect(
      itemsForLocalDate(p, nextCalendarDate(date), "America/New_York").timed[0].occupancy,
    ).toBe(false);
  });
  it("skipped IANA date has no timed occupancy", () =>
    expect(
      ids(
        itemsForLocalDate(
          projection(event("a", "SPAN", "2011-12-29T00:00:00Z", "2012-01-01T00:00:00Z")),
          "2011-12-30",
          "Pacific/Apia",
        ),
      ),
    ).toEqual([]));
});
describe("exact ordering and next uncertainty", () => {
  it("orders sub-millisecond anchors and stable ties deterministically", () => {
    const a = event("b", "POINT", "2026-12-17T12:00:00.000001Z"),
      b = event("a", "POINT", "2026-12-17T12:00:00.000002Z"),
      c = event("c", "POINT", a.boundaries[0].instant);
    expect(ids(itemsForLocalDate(projection(c, b, a), "2026-12-17", "UTC"))).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
  it("incomparable items preserve authored order then identity", () => {
    const a = event("b"),
      b = event("a"),
      c = event("c");
    for (const e of [a, b, c]) e.boundaries[0].local_date = "2026-12-17";
    a.order_index = 4;
    b.order_index = 4;
    c.order_index = 1;
    expect(ids(itemsForLocalDate(projection(a, b, c), "2026-12-17", "UTC"))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
  it("strict after-now at microsecond precision includes unresolved candidates", () => {
    const p = projection(
      event("timed", "POINT", "2026-12-17T12:00:00.000002Z"),
      event("unknown"),
      event("window", "WINDOW"),
    );
    const result = nextComparableEvent(p, "2026-12-17T12:00:00.000001Z", "UTC");
    expect(result.next?.event.id).toBe("timed");
    expect(result.unresolved.map((e) => e.id)).toEqual(["unknown", "window"]);
    expect(nextComparableEvent(p, "2026-12-17T12:00:00.000002Z", "UTC").next).toBeNull();
  });
  it("next endpoint preserves one Event identity and role", () =>
    expect(
      nextComparableEvent(
        projection(
          event("flight", "TRANSPORT", "2026-12-17T10:00:00Z", "2026-12-17T12:00:00Z"),
        ),
        "2026-12-17T11:00:00Z",
        "UTC",
      ).next?.role,
    ).toBe("DESTINATION"));
  it("empty certified projection supports all queries", () => {
    const p = projection();
    expect(ids(today(p, "2026-12-17T12:00:00Z", "UTC"))).toEqual([]);
    expect(tomorrow(p, "2026-12-17T12:00:00Z", "UTC").date).toBe("2026-12-18");
    expect(nextComparableEvent(p, "2026-12-17T12:00:00Z", "UTC")).toEqual({
      next: null,
      unresolved: [],
    });
  });
  it("exact offset equivalence and pre-epoch microseconds", () => {
    expect(instantMicroseconds("2026-12-17T13:00:00.123456+13:00")).toBe(
      instantMicroseconds("2026-12-17T00:00:00.123456Z"),
    );
    expect(instantMicroseconds("1969-12-31T23:59:59.999999Z")).toBe(-1n);
    expect(localCalendarDate("1969-12-31T23:59:59.999999Z", "UTC")).toBe("1969-12-31");
  });
  it.each([
    "2026-02-30T00:00:00Z",
    "2026-12-17T24:00:00Z",
    "2026-12-17T00:00:60Z",
    "2026-12-17T00:00:00+18:01",
    "2026-12-17T00:00:00.1234567Z",
  ])("rejects invalid instant %s", (instant) =>
    expect(() => instantMicroseconds(instant)).toThrow(),
  );
});

import { expect, it, vi } from "vitest";
import DayFeedLabRoute from "../../../app/day-feed-lab";
import { readFileSync } from "node:fs";
import { getDl1FixtureCatalog, selectLabContext } from "./fixtureCatalog";
import { itemsForLocalDate, validateCalendarDate } from "@/domain/trip/dayReadModel";
import { composeDayStream } from "@/features/day-feed/composition";
import { flightPresentation } from "@/features/day-feed/presentation";

vi.mock("expo-router", () => ({ Redirect: "redirect" }));

const fixtureCatalog = getDl1FixtureCatalog();
it("has five deterministic, separate synthetic projections and globally stable row identities", () => {
  expect(fixtureCatalog).toHaveLength(5);
  const keys: string[] = [];
  const before = JSON.stringify(fixtureCatalog);
  for (const trip of fixtureCatalog) {
    expect(trip.projection.tripId).toBe(trip.id);
    expect(trip.id).toMatch(/^day-lab-/);
    for (const date of trip.dates) {
      expect(validateCalendarDate(date)).toBe(date);
      const query = itemsForLocalDate(trip.projection, date, trip.zone);
      const stream = composeDayStream(query, trip.instant);
      expect(stream.rows).toHaveLength(query.timed.length + query.nonComparable.length);
      expect(composeDayStream(query, trip.instant).rows.map((r) => r.key)).toEqual(
        stream.rows.map((r) => r.key),
      );
      keys.push(...stream.rows.map((r) => r.key));
    }
  }
  expect(new Set(keys).size).toBe(keys.length);
  expect(JSON.stringify(fixtureCatalog)).toBe(before);
});
it("bounds date selection, resets a new Trip and accepts future contributed scenarios", () => {
  const a = selectLabContext(fixtureCatalog[0].id, fixtureCatalog[0].dates[1]);
  expect(a.date).toBe("2027-01-16");
  const b = selectLabContext(fixtureCatalog[1].id);
  expect(b.date).toBe("2027-01-15");
  expect(() => selectLabContext(b.trip.id, "2028-01-01")).toThrow("DAY_LAB_CONTEXT");
  expect(() => selectLabContext("unknown")).toThrow("DAY_LAB_CONTEXT");
  const extra = {
    ...b.trip,
    id: "day-lab-contributed",
    projection: { ...b.trip.projection, tripId: "day-lab-contributed" },
  };
  expect(selectLabContext(extra.id, undefined, [...fixtureCatalog, extra]).trip).toBe(
    extra,
  );
});
it("keeps date-only entries TNS and missing arrival/location/services unknown", () => {
  const sparse = fixtureCatalog[4];
  expect(
    composeDayStream(
      itemsForLocalDate(sparse.projection, sparse.dates[0], sparse.zone),
      sparse.instant,
    ).rows,
  ).toHaveLength(0);
  const query = itemsForLocalDate(sparse.projection, sparse.dates[1], sparse.zone);
  expect(query.timed).toHaveLength(0);
  expect(query.nonComparable).toHaveLength(2);
  for (const event of sparse.projection.events) {
    expect(event.authored_address).toBeNull();
    expect(
      event.boundaries.every((b) => b.instant === null && b.local_time === null),
    ).toBe(true);
  }
  const europe = fixtureCatalog[2];
  const flight = flightPresentation(europe.projection.events[2], [])!;
  expect(flight.canonical.boundaries[1].instant).toBeNull();
  expect(flight.supplemental.endpoints.DESTINATION.name).toBeNull();
  expect(flight.services).toEqual([]);
});
it("uses one production composer for deterministic NOW, Focus and Immersive context", () => {
  const trip = fixtureCatalog[0],
    date = trip.dates[0];
  const query = itemsForLocalDate(trip.projection, date, trip.zone);
  const focus = trip.projection.events[0].id;
  const stream = composeDayStream(query, trip.instant, { focus, immersive: focus });
  expect(stream.focus).toBe(focus);
  expect(stream.immersive).toBe(focus);
  expect(stream.context).toBe("TODAY");
  expect(stream.now.mode).toBe("WITHIN_EVENT_WINDOW");
  expect(composeDayStream(query, trip.instant, { focus }).rows.map((r) => r.key)).toEqual(
    stream.rows.map((r) => r.key),
  );
});
it("keeps release entry closed and fixture data pure and the shell limited to read-only repository access", () => {
  vi.stubGlobal("__DEV__", false);
  try {
    expect(DayFeedLabRoute().props.href).toBe("/trip");
  } finally {
    vi.unstubAllGlobals();
  }
  const route = readFileSync(
    new URL("../../../app/day-feed-lab.tsx", import.meta.url),
    "utf8",
  );
  expect(route.indexOf("if (!__DEV__) return <Redirect")).toBeLessThan(
    route.indexOf("require("),
  );
  for (const file of ["fixtureCatalog.ts", "DayFeedLabScreen.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source).not.toMatch(
      /@\/data\/(?:api|db|sync)\/|fetch\(|SQLite|composeDayStream|createTripDayFeedReader/,
    );
  }
  const shell = readFileSync(new URL("DayFeedLabScreen.tsx", import.meta.url), "utf8");
  expect(shell).toContain('import { DayFeed } from "@/features/day-feed/DayFeed"');
  expect(shell).toContain("key={`FIXTURE/${fixture.trip.id}/${date}`}");
});

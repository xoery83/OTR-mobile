import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { placeNow } from "@/domain/trip/experience/nowIndicator";
import {
  flightTimeSchema,
  matchFlightV1,
  type FlightOccurrenceAnchor,
} from "@/domain/trip/flightAdmission";
import { ledgerMoneySchema } from "@/data/api/ledgerReadContracts";
import { interpretFlightBatch } from "@/data/interpretation/flightInterpretation";
import { admittedFlightBatch } from "@/data/interpretation/__fixtures__/flightInterpretation";
import {
  boundaryZone,
  durationMinutes,
  flightPresentation,
  viewContext,
} from "./presentation";
import { faroeNegativeFixtures, syntheticDate } from "./faroeNegative.test.fixtures";

const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const leg = "NZ901 AKL→CHC 2027-02-03 dep=10:00";
const interpret = async (texts: string[]) => {
  const batch = await admittedFlightBatch(texts);
  return interpretFlightBatch(batch, {
    sha256: hash,
    getAccountId: async () => batch.catalog.actor_account_id,
    now: () => "2026-10-06T00:00:00Z",
  });
};

describe("F1 synthetic negatives; no raw corpus or domain writes", () => {
  it("TC02/TC07: four distinct synthetic legs keep identity without assuming one party", async () => {
    const result = await interpret([
      `${leg}\nNZ902 CHC→AKL 2027-02-03 dep=15:00`,
      "NZ903 CHC→AKL 2027-02-11 dep=09:00\nNZ904 AKL→CHC 2027-02-11 dep=13:00",
    ]);
    expect(result.candidates).toHaveLength(4);
    expect(new Set(result.candidates.map((c) => c.id)).size).toBe(4);
    expect(result).not.toHaveProperty("command");
    expect(JSON.stringify(result)).not.toMatch(/person_id|participant_scope|WHOLE_GROUP/);
  });
  it("TC03 subcase/B4: duplicate inputs add evidence without duplicate Candidates or mutations", async () => {
    const batch = await admittedFlightBatch([leg, leg]);
    const original = JSON.stringify(batch);
    const deps = {
      sha256: hash,
      getAccountId: async () => batch.catalog.actor_account_id,
      now: () => "2026-10-06T00:00:00Z",
    };
    const result = await interpretFlightBatch(batch, deps);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].occurrence.service.observations).toHaveLength(2);
    expect(await interpretFlightBatch(batch, deps)).toEqual(result);
    expect(JSON.stringify(batch)).toBe(original);
    expect(result).not.toHaveProperty("command");
  });
  it("TC08/B4: differing service and incomplete scope remain unresolved, not silently merged", () => {
    const candidate: FlightOccurrenceAnchor = {
      eventId: "test-candidate",
      semanticRevision: 1,
      namespace: "IATA_AIRLINE",
      issuer: "IATA",
      operator: "NZ",
      serviceNumber: "901",
      originDate: syntheticDate,
      originAirportId: "test:AKL",
      destinationAirportId: "test:CHC",
      departureClock: "10:00",
      qualified: true,
    };
    const scope = {
      complete: true,
      current: true,
      proposalsComplete: true,
      lineageComplete: true,
      servicesAtEventBaselines: true,
      occurrences: [{ ...candidate, eventId: "test-existing", serviceNumber: "902" }],
    };
    const original = JSON.stringify(scope);
    expect(matchFlightV1(candidate, scope)).toMatchObject({
      assessment: "UNRESOLVED_MATCH",
      reason: "CODESHARE_OR_SUPERSESSION_UNRESOLVED",
    });
    expect(matchFlightV1(candidate, { ...scope, complete: false }).assessment).toBe(
      "UNRESOLVED_MATCH",
    );
    expect(JSON.stringify(scope)).toBe(original);
  });
  it("TC15/B1: minute clocks retain civil evidence without inventing zones, instants or duration", async () => {
    const result = await interpret([leg]);
    const time = result.candidates[0].proposal.fields.origin!.proposed_value.time;
    expect(time).toMatchObject({
      local_date: syntheticDate,
      local_time: "10:00",
      clock_precision: -1,
      zone_id: null,
      source_instant: null,
    });
    expect(flightTimeSchema.safeParse(time).success).toBe(false);
    const { civil, day } = faroeNegativeFixtures();
    expect(durationMinutes(flightPresentation(civil, [])!)).toBeNull();
    expect(boundaryZone({ ...day, events: [civil] })).toBeNull();
    expect(() => viewContext(syntheticDate, "")).toThrow();
    expect(civil.boundaries.every((b) => b.zone_id === null && b.instant === null)).toBe(
      true,
    );
  });
  it("TC15/B1: missing departure and arrival remain unknown rather than midnight", async () => {
    const result = await interpret(["NZ901 AKL→CHC 2027-02-03"]);
    for (const field of ["origin", "destination"] as const) {
      expect(
        result.candidates[0].proposal.fields[field]!.proposed_value.time,
      ).toMatchObject({ local_time: null, source_instant: null, quality: "UNKNOWN" });
    }
    const { incomplete } = faroeNegativeFixtures();
    expect(durationMinutes(flightPresentation(incomplete, [])!)).toBeNull();
  });
  it("TC12/B6: private synthetic party/ticket markers stay opaque and do not reach logs", async () => {
    const spies = ["log", "info", "warn", "error", "debug"].map((method) =>
      vi.spyOn(console, method as "log"),
    );
    try {
      const result = await interpret([
        `${leg} passenger=F1_PRIVATE_PERSON_CANARY pnr=F1_PRIVATE_BOOKING_CANARY ticket=F1_PRIVATE_TICKET_CANARY`,
      ]);
      expect(result.candidates[0].deferred_dimensions).toHaveLength(3);
      expect(JSON.stringify(result)).not.toMatch(
        /F1_PRIVATE_.*_CANARY|person_id|participant_scope/,
      );
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
  it("TC22/B1: obscured and string amounts are rejected at the existing typed Money boundary", () => {
    for (const minor of ["", null, undefined, "1266.87"]) {
      expect(
        ledgerMoneySchema.safeParse({ minor, currency: "CNY", scale: 2 }).success,
      ).toBe(false);
    }
    const f = faroeNegativeFixtures();
    expect(f.untrusted.amount).toBe("");
    expect(f.untrusted.bookingStatus).toBeNull();
    expect(f.untrusted.travelerIds).toBeNull();
  });
  it("A1/A3/B5: duplicate titles keep distinct identities and mixed order without retiming", () => {
    const f = faroeNegativeFixtures(),
      original = JSON.stringify(f.day);
    expect(f.before.title).toBe(f.after.title);
    const query = itemsForLocalDate(
      { ...f.day, events: [f.after, f.segment, f.before] },
      syntheticDate,
      "UTC",
    );
    expect(query.timed.map((r) => r.event.id)).toEqual([
      f.before.id,
      f.segment.id,
      f.after.id,
    ]);
    expect(new Set(query.timed[1].roles)).toEqual(new Set(["ORIGIN", "DESTINATION"]));
    expect(JSON.stringify(f.day)).toBe(original);
  });
  it("TC15/NOW: unknown timing cannot create an exact NOW position or mutate order", () => {
    const f = faroeNegativeFixtures();
    const query = itemsForLocalDate(
      { ...f.day, events: [f.incomplete] },
      syntheticDate,
      "UTC",
    );
    const rows = [...query.timed, ...query.nonComparable],
      original = JSON.stringify(rows);
    expect(placeNow(query, rows, `${syntheticDate}T11:00:00Z`)).toMatchObject({
      mode: "HIDDEN",
      reason: "TIMING",
    });
    expect(placeNow(query, rows, "2027-02-10T11:00:00Z")).toMatchObject({
      mode: "HIDDEN",
      reason: "OTHER_DAY",
    });
    expect(JSON.stringify(rows)).toBe(original);
  });
});

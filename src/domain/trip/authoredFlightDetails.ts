import { z } from "zod";
import * as f from "./tripCoreV2";
import { coreBoundarySchema } from "./tripCoreV2Temporal";

const authoredFlightEndpoint = z.strictObject({
  airportCode: f.coreText(8).nullable(),
  name: f.coreText(255).nullable(),
  terminal: f.coreText(128).nullable(),
  time: coreBoundarySchema
    .refine(
      (t) =>
        t.instant === null &&
        t.source_instant === null &&
        t.source_instant_precision === null &&
        t.interpretation_key === null &&
        t.interpretation_input_sha256 === null &&
        t.provenance_refs === null &&
        t.civil_resolution === "PENDING" &&
        t.resolution_offset_seconds === null &&
        t.supplied_offset_seconds === null &&
        t.basis === "DERIVED_CIVIL",
    )
    .refine((t) => {
      if (!t.zone_id) return true;
      if (/^[+-]/.test(t.zone_id)) return false;
      try {
        new Intl.DateTimeFormat("en", { timeZone: t.zone_id }).format(0);
        return true;
      } catch {
        return false;
      }
    }),
});
export const authoredFlightDetailsSchema = z.strictObject({
  flightNumberLiteral: f.coreText(255).refine((v) => !!v.trim()),
  origin: authoredFlightEndpoint.refine((v) => v.time.local_date !== null),
  destination: authoredFlightEndpoint,
});

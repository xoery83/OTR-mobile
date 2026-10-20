// Trusted internal producer only. No HTTP registration or runtime capability enablement.
import { z } from "zod";
import { coreUuid, coreRevision } from "../../src/domain/trip/tripCoreV2";
import {
  coreBoundarySchema,
  coreStoredBoundary,
  type CoreBoundary,
} from "../../src/domain/trip/tripCoreV2Temporal";
import { validateCalendarDate } from "../../src/domain/trip/dayReadModel";
import {
  coreCanManage,
  type CoreActor,
  type CoreGraph,
} from "../../src/domain/trip/tripCoreV2Mutation";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import type { CoreCommand } from "../../src/domain/trip/tripCoreV2Commands";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
const inputSchema = z.strictObject({
  actorAccountId: coreUuid,
  tripId: coreUuid,
  personId: coreUuid,
  epoch: coreUuid,
  accessRevision: coreRevision,
  itemId: coreUuid,
  itemRevision: coreRevision,
  operationId: coreUuid,
  localDate: z.string(),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),
  zone: z.string().min(1).max(128),
  precision: z.literal(0),
  role: z.enum(["START", "END"]).optional(),
});
export type TemporalInput = z.infer<typeof inputSchema>;
export type TemporalEvidence = {
  issuer: "otr-core-civil-seconds/1";
  runtime: { icu: string; tz: string };
  input: TemporalInput;
  inputSha256: string;
  key: string;
  boundary: CoreBoundary;
};
const json = (v: unknown) => canonicalCoreJson(v as Json);
// Enumerate every allowed integer-second offset. This proves uniqueness rather than
// guessing an offset or silently choosing a side of a fold. Fractional clocks are
// deliberately not supported by this first owning producer.
function resolve(input: TemporalInput) {
  validateCalendarDate(input.localDate);
  if (input.localDate < "1900-01-01" || input.localDate > "2100-12-31")
    throw Error("TEMPORAL_RESOLVER_UNAVAILABLE");
  if (!input.zone.trim() || input.zone !== input.zone.trim() || /^[+-]/.test(input.zone))
    throw Error("TEMPORAL_ZONE_INVALID");
  const options: Intl.DateTimeFormatOptions = {
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  };
  const formatter = new Intl.DateTimeFormat("en-CA", {
    ...options,
    timeZone: input.zone,
  });
  const utc = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "UTC" });
  const scalar = Date.parse(`${input.localDate}T${input.localTime}Z`);
  const wanted = utc.format(scalar);
  let match: { instant: string; offset: number } | undefined;
  for (let offset = -64800; offset <= 64800; offset++) {
    const candidate = scalar - offset * 1000;
    if (formatter.format(candidate) !== wanted) continue;
    if (match) throw Error("TEMPORAL_FOLD_REQUIRES_REVIEW");
    match = { instant: new Date(candidate).toISOString().replace(".000Z", "Z"), offset };
  }
  if (!match) throw Error("TEMPORAL_GAP");
  return match;
}
export function createCoreTemporalAuthority(
  actor: CoreActor,
  scope: { epoch: string; accessRevision: number },
  hash: ImportHash,
) {
  const runtime = { icu: process.versions.icu, tz: process.versions.tz };
  if (!runtime.icu || !runtime.tz) throw Error("TEMPORAL_RESOLVER_UNAVAILABLE");
  const issued = new Map<string, string>();
  const check = (input: TemporalInput, graph: CoreGraph) => {
    const row = graph.itinerary_events.find((r) => r.id === input.itemId);
    if (
      !actor.active ||
      !actor.personId ||
      !actor.personIds.includes(actor.personId) ||
      input.actorAccountId !== actor.accountId ||
      input.tripId !== actor.tripId ||
      input.personId !== actor.personId ||
      input.epoch !== scope.epoch ||
      input.accessRevision !== scope.accessRevision ||
      !row ||
      row.semantic_revision !== input.itemRevision ||
      !["P1", "P4", "P6"].includes(String(row.experience_family)) ||
      !coreCanManage(graph, actor, "ITEM", row)
    )
      throw Error("TEMPORAL_SCOPE_DENIED");
  };
  async function issue(raw: TemporalInput, graph: CoreGraph): Promise<TemporalEvidence> {
    const input = inputSchema.parse(raw);
    check(input, graph);
    const resolved = resolve(input);
    const material = { issuer: "otr-core-civil-seconds/1" as const, runtime, input };
    const inputSha256 = await coreHashValue(
      "otr-core-civil-interpretation-input-v1",
      material,
      hash,
    );
    const key = "otr-core-civil-seconds/1:" + inputSha256;
    const boundary = coreBoundarySchema.parse({
      instant: resolved.instant,
      local_date: input.localDate,
      local_time: input.localTime,
      clock_precision: 0,
      quality: "EXACT",
      basis: "DERIVED_CIVIL",
      zone_id: input.zone,
      supplied_offset_seconds: null,
      source_instant: null,
      source_instant_precision: null,
      civil_resolution: "UNIQUE",
      resolution_offset_seconds: resolved.offset,
      interpretation_key: key,
      interpretation_input_sha256: inputSha256,
      provenance_refs: {
        interpretation: key,
        interpretation_input: json(input),
        interpretation_runtime: json(runtime),
        interpretation_issuer: material.issuer,
      },
    });
    const evidence = { ...material, inputSha256, key, boundary };
    const stored = json(evidence),
      prior = issued.get(key);
    if (prior && prior !== stored) throw Error("TEMPORAL_IMMUTABLE_CONFLICT");
    issued.set(key, stored);
    return JSON.parse(stored) as TemporalEvidence;
  }
  async function verify(command: CoreCommand, intentSha256: string, graph: CoreGraph) {
    if (
      command.command !== "SET_ITEM_SCHEDULE" ||
      command.target.kind !== "ITEM" ||
      command.tripId !== actor.tripId ||
      command.admission.mode !== "MANUAL"
    )
      throw Error("OWNING_CAPABILITY_REQUIRED");
    const payload = command.payload as {
      schedule: { start: CoreBoundary; end?: CoreBoundary };
    };
    const evidenceList: TemporalEvidence[] = [];
    for (const [role, boundary] of Object.entries(payload.schedule)) {
      const key = boundary.interpretation_key,
        stored = key && issued.get(key);
      if (!stored) throw Error("OWNING_CAPABILITY_REQUIRED");
      const evidence = JSON.parse(stored) as TemporalEvidence;
      check(evidence.input, graph);
      if (
        (evidence.input.role ?? "START") !== (role === "start" ? "START" : "END") ||
        command.operationId !== evidence.input.operationId ||
        command.target.id !== evidence.input.itemId ||
        command.baseVector.length !== 1 ||
        json(command.baseVector[0]) !==
          json({
            kind: "ITEM",
            id: evidence.input.itemId,
            revision: evidence.input.itemRevision,
          }) ||
        json(boundary) !== json(evidence.boundary) ||
        intentSha256 !== (await coreHashValue("otr-trip-core-intent-v2", command, hash))
      )
        throw Error("TEMPORAL_EVIDENCE_MISMATCH");
      evidenceList.push(evidence);
    }
    const row = graph.itinerary_events.find((r) => r.id === command.target.id)!;
    const oldEnd = row.end_local_date ? coreStoredBoundary(row, "end") : null;
    if (oldEnd?.local_date && !payload.schedule.end) throw Error("TEMPORAL_END_REQUIRED");
    return evidenceList;
  }
  return { issue, verify };
}

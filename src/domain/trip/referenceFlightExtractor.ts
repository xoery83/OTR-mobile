import { z } from "zod";
import {
  interpretationRequestSchema,
  interpretationResponseSchema,
  type InterpretationRequest,
  type InterpretationResponse,
  type InterpretationItem,
  type InterpretationFragment,
} from "../intelligence/interpretation";
import { flightTimeInputSchema, type FlightService } from "./flightAdmission";
import { importDigest, type ImportHash } from "./flightImportReview";
import { canonicalEventJson, type Json } from "./eventIntentJson";

export const REFERENCE_FLIGHT_DESCRIPTOR = {
  plugin_id: "otr-reference-flight",
  boundary_version: "otr-intelligence-v1",
  adapter_version: "1",
  model_version: "NO_MODEL",
  execution_location: "DETERMINISTIC_LOCAL",
  capabilities: ["STRUCTURED_EXTRACTION", "BATCH_N_TO_M_EXTRACTION", "EVIDENCE_MAPPING"],
  modalities: ["TEXT"],
  replay: "SUPPORTED",
  network_required: false,
  limits: { inputs: 64, items: 64, fields: 64, payload_bytes: 4194304 },
  timeout: "CALLER_FENCED",
  cancellation: "UNSUPPORTED",
  privacy_requirement: "LOCAL_ONLY",
} as const;
export const UNKNOWN_FLIGHT_TIME: z.infer<typeof flightTimeInputSchema> = {
  local_date: null,
  local_time: null,
  clock_precision: null,
  quality: "UNKNOWN",
  basis: "DERIVED_CIVIL",
  zone_id: null,
  supplied_offset_seconds: null,
  source_instant: null,
  source_instant_precision: null,
  fold_choice: null,
};
const designator = /^([A-Z0-9]{2})([0-9]{1,4}[A-Z]?)$/;
function service(raw: string, operating = false): FlightService {
  const literal = raw.replace(/^(?:flight\s*[:=]\s*|operating\s*[:=]\s*)/i, "").trim();
  const match = designator.exec(literal);
  if (!match) throw new Error("INPUT_INVALID");
  return {
    service_key: operating ? "operating" : "service",
    transport_subtype: "FLIGHT",
    attribution: operating ? "OPERATING" : "UNSPECIFIED",
    operator_namespace: "IATA_AIRLINE",
    operator_issuer: "IATA",
    operator_value: match[1],
    operator_literal: match[1],
    service_number: match[2],
    service_literal: literal,
    codeshare_operating_key: null,
  };
}
export const FLIGHT_OBSERVATION_PATHS = [
  "transport_subtype",
  "service",
  "operating_service",
  "origin.airport",
  "destination.airport",
  ...["origin", "destination"].flatMap((role) =>
    [
      "local_date",
      "local_time",
      "zone_id",
      "supplied_offset_seconds",
      "source_instant",
    ].map((k) => `${role}.${k}`),
  ),
  "supplier_occurrence",
  "change_notice",
];
// Deterministic, loss-aware normalization shared by extraction and Import validation.
export function normalizeFlightObservation(
  path: string,
  raw: string,
): { value: Json; uncertainty: string[] } {
  if (!FLIGHT_OBSERVATION_PATHS.includes(path)) throw new Error("UNSUPPORTED_FIELD");
  const label = /^([A-Za-z]+)\s*[:=]/.exec(raw.trim())?.[1].toLowerCase();
  const role = path.startsWith("origin.") ? "dep" : "arr";
  const labels: Record<string, string[]> = {
    local_date: role === "dep" ? ["date", "depdate"] : ["arrdate"],
    local_time: role === "dep" ? ["dep", "departure"] : ["arr", "arrival"],
    zone_id: [`${role}zone`],
    supplied_offset_seconds: [`${role}offset`],
    source_instant: [`${role}instant`],
  };
  const suffix = path.split(".")[1];
  if (
    (label && labels[suffix] && !labels[suffix].includes(label)) ||
    (path === "operating_service" && label !== "operating") ||
    (path === "change_notice" && label !== "change") ||
    (path === "supplier_occurrence" && label !== "occurrence")
  )
    throw new Error("EVIDENCE_INVALID");
  let value: Json;
  const literal = raw.replace(/^[A-Za-z]+\s*[:=]\s*/, "").trim();
  if (["service", "transport_subtype"].includes(path) && label && label !== "flight")
    throw new Error("EVIDENCE_INVALID");
  if (path === "transport_subtype") {
    service(raw);
    value = "FLIGHT";
  } else if (path === "service" || path === "operating_service")
    value = service(raw, path === "operating_service");
  else if (path.endsWith(".airport")) {
    const route = /^(?:route\s*[:=]\s*)?([A-Z]{3})\s*(?:→|->)\s*([A-Z]{3})$/i.exec(
      raw.trim(),
    );
    if (!route) throw new Error("INPUT_INVALID");
    value = {
      namespace: "IATA_AIRPORT",
      value: route[path.startsWith("origin") ? 1 : 2].toUpperCase(),
    };
  } else if (path.endsWith(".local_date")) {
    const parsed = flightTimeInputSchema.safeParse({
      ...UNKNOWN_FLIGHT_TIME,
      local_date: literal,
    });
    if (!parsed.success) return { value: null, uncertainty: ["UNRESOLVED_DATE"] };
    value = literal;
  } else if (path.endsWith(".local_time")) {
    const clock = literal.replace(/^~/, "");
    const precision =
      clock.length === 5 ? -1 : clock.includes(".") ? clock.split(".")[1].length : 0;
    const quality = literal.startsWith("~") ? "ESTIMATED" : "EXACT";
    const parsed = flightTimeInputSchema.safeParse({
      ...UNKNOWN_FLIGHT_TIME,
      local_time: clock,
      clock_precision: precision,
      quality,
    });
    if (!parsed.success) return { value: null, uncertainty: ["UNRESOLVED_CLOCK"] };
    value = { value: clock, precision, quality };
  } else if (path.endsWith(".zone_id")) {
    if (literal !== "UTC" && !literal.includes("/"))
      return { value: null, uncertainty: ["UNRESOLVED_ZONE"] };
    try {
      new Intl.DateTimeFormat("en", { timeZone: literal });
    } catch {
      return { value: null, uncertainty: ["UNRESOLVED_ZONE"] };
    }
    value = literal;
  } else if (path.endsWith(".supplied_offset_seconds")) {
    const m = /^([+-])(\d{2}):(\d{2})$/.exec(literal);
    if (
      !m ||
      Number(m[3]) > 59 ||
      Number(m[2]) > 18 ||
      (Number(m[2]) === 18 && m[3] !== "00")
    )
      return { value: null, uncertainty: ["UNRESOLVED_OFFSET"] };
    value = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60);
    if (Object.is(value, -0)) value = 0;
  } else if (path.endsWith(".source_instant")) {
    if (!label) throw new Error("EVIDENCE_INVALID");
    // Explicit source timestamp only. Civil clock + separate offset never enters here.
    const m =
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/.exec(
        literal,
      );
    if (!m) return { value: null, uncertainty: ["UNRESOLVED_INSTANT"] };
    const precision = m[2] === undefined ? -1 : m[3] ? m[3].length - 1 : 0;
    const civil = `${m[1]}:${m[2] ?? "00"}${m[3] ?? ""}`;
    if (
      !flightTimeInputSchema.safeParse({
        ...UNKNOWN_FLIGHT_TIME,
        local_date: civil.slice(0, 10),
        local_time: civil.slice(11),
        clock_precision: precision === -1 ? 0 : precision,
      }).success
    )
      return { value: null, uncertainty: ["UNRESOLVED_INSTANT"] };
    const offset =
      m[4] === "Z"
        ? 0
        : normalizeFlightObservation("origin.supplied_offset_seconds", m[4]).value;
    if (typeof offset !== "number")
      return { value: null, uncertainty: ["UNRESOLVED_INSTANT"] };
    const utc = new Date(Date.parse(`${civil.slice(0, 19)}Z`) - offset * 1000)
      .toISOString()
      .slice(0, 19);
    value = { value: `${utc}${m[3] ?? ""}Z`, precision, supplied_offset_seconds: offset };
  } else if (path === "supplier_occurrence") {
    const m =
      /^occurrence\s*[:=]\s*([A-Za-z0-9._-]{1,128}):([A-Za-z0-9._-]{1,128}):([A-Za-z0-9._-]{1,128})$/i.exec(
        raw,
      );
    if (!m) throw new Error("INPUT_INVALID");
    value = { issuer: m[1], scopeId: m[2], value: m[3] };
  } else value = { literal: raw, continuity: "REVIEW_REQUIRED" };
  return { value, uncertainty: [] };
}
export function textSpan(
  material: InterpretationRequest["materials"][number],
  start: number,
  end: number,
) {
  return {
    input_id: material.pin.id,
    kind: "TEXT_SPAN" as const,
    page: null,
    start: new TextEncoder().encode(material.text.slice(0, start)).length,
    end: new TextEncoder().encode(material.text.slice(0, end)).length,
    region: null,
  };
}
export async function referenceFlightExtract(
  rawRequest: InterpretationRequest,
  sha256: ImportHash,
): Promise<InterpretationResponse> {
  const request = interpretationRequestSchema.parse(rawRequest);
  if (
    canonicalEventJson(request.binding.descriptor as unknown as Json) !==
    canonicalEventJson({
      ...REFERENCE_FLIGHT_DESCRIPTOR,
      configuration_sha256: request.binding.descriptor.configuration_sha256,
    } as unknown as Json)
  )
    throw new Error("VERSION_MISMATCH");
  const items: InterpretationItem[] = [],
    fragments: InterpretationFragment[] = [],
    coverage: InterpretationResponse["coverage"] = [];
  for (const material of [...request.materials].sort((a, b) =>
    a.pin.id.localeCompare(b.pin.id),
  )) {
    const localItems: InterpretationItem[] = [],
      localFragments: InterpretationFragment[] = [];
    const ignored: InterpretationResponse["coverage"][number]["ignored"] = [];
    try {
      // Reference grammar: a leg starts a line/row; following labelled lines belong
      // to it until the next leg or unrelated row. No OCR/transport is performed.
      const lines = [...material.text.matchAll(/[^\n]+/g)];
      let current: InterpretationItem | undefined;
      for (const line of lines) {
        const body = line[0].replace(/\r$/, "");
        const head =
          /^\s*(?:Flight\s*[:=]\s*)?([A-Z0-9]{2}[0-9]{1,4}[A-Z]?)(?=\s|[;|]|$)/.exec(
            body,
          );
        const labelled =
          /^\s*(?:date|depDate|arrDate|departure|arrival|dep|arr|route|depZone|arrZone|depOffset|arrOffset|depInstant|arrInstant|passenger|pnr|seat|ticket|baggage|fare|cabin|occurrence|change)\s*[:=]/i.test(
            body,
          );
        if (!head && (!current || !labelled)) {
          if (body.trim())
            ignored.push(textSpan(material, line.index!, line.index! + body.length));
          if (ignored.length > 64) throw new Error("LIMIT_EXCEEDED");
          current = undefined;
          continue;
        }
        const covered: [number, number][] = [];
        const add = (path: string, raw: string, at: number) => {
          if (raw.length > 5000) throw new Error("LIMIT_EXCEEDED");
          covered.push([at - line.index!, at - line.index! + raw.length]);
          const id = `f:${material.pin.id}:${new TextEncoder().encode(material.text.slice(0, at)).length}:${new TextEncoder().encode(raw).length}`;
          if (!localFragments.some((f) => f.id === id))
            localFragments.push({
              id,
              source_id: material.pin.source_id,
              representation_id: material.pin.representation_id,
              material_revision: material.pin.material_revision,
              locator: textSpan(material, at, at + raw.length),
            });
          const normalized = normalizeFlightObservation(path, raw);
          if (current!.fields.length >= 64) throw new Error("LIMIT_EXCEEDED");
          current!.fields.push({
            path,
            raw,
            normalized: normalized.value,
            fragment_ids: [id],
            uncertainty: normalized.uncertainty,
          });
        };
        if (head) {
          current = {
            token: `item:${material.pin.id}:${line.index}`,
            schema_id: "otr.import.flight",
            fields: [],
            deferred: [],
          };
          localItems.push(current);
          const raw = head[0].trim(),
            at = line.index! + head[0].indexOf(raw);
          add("transport_subtype", raw, at);
          add("service", raw, at);
        }
        for (const route of body.matchAll(
          /(?:route\s*[:=]\s*)?[A-Z]{3}\s*(?:→|->)\s*[A-Z]{3}/gi,
        )) {
          add("origin.airport", route[0], line.index! + route.index!);
          add("destination.airport", route[0], line.index! + route.index!);
        }
        for (const entry of body.matchAll(
          /\b(date|depDate|arrDate|departure|arrival|dep|arr|depZone|arrZone|depOffset|arrOffset|depInstant|arrInstant|operating|occurrence|change)\s*[:=]\s*([^;|\n]+?)(?=\s+[A-Za-z]+\s*[:=]|[;|]|$)/gi,
        )) {
          const name = entry[1].toLowerCase();
          const role = name.startsWith("arr") ? "destination" : "origin";
          const suffix = name.endsWith("date")
            ? "local_date"
            : name.endsWith("zone")
              ? "zone_id"
              : name.endsWith("offset")
                ? "supplied_offset_seconds"
                : name.endsWith("instant")
                  ? "source_instant"
                  : "local_time";
          const path =
            name === "operating"
              ? "operating_service"
              : name === "occurrence"
                ? "supplier_occurrence"
                : name === "change"
                  ? "change_notice"
                  : `${role}.${suffix}`;
          add(path, entry[0].trimEnd(), line.index! + entry.index!);
        }
        // A bare ISO date on a compact itinerary row is its departure-local date.
        if (head && !/\b(?:date|depDate)\s*[:=]/i.test(body)) {
          const date = /\b\d{4}-\d{2}-\d{2}\b/.exec(body);
          if (date && !body.slice(0, date.index).endsWith("Instant="))
            add("origin.local_date", date[0], line.index! + date.index);
        }
        const dimensions: Record<
          string,
          InterpretationItem["deferred"][number]["dimension"]
        > = {
          passenger: "passengers",
          pnr: "bookings",
          seat: "seats",
          ticket: "tickets",
          baggage: "baggage",
          fare: "fare",
          cabin: "cabin",
        };
        for (const marker of body.matchAll(
          /\b(passenger|pnr|seat|ticket|baggage|fare|cabin)\s*[:=]\s*([^;|\n]+?)(?=\s+[A-Za-z]+\s*[:=]|[;|]|$)/gi,
        )) {
          const at = line.index! + marker.index!;
          covered.push([marker.index!, marker.index! + marker[0].length]);
          const id = `f:${material.pin.id}:${new TextEncoder().encode(material.text.slice(0, at)).length}:${new TextEncoder().encode(marker[0]).length}`;
          localFragments.push({
            id,
            source_id: material.pin.source_id,
            representation_id: material.pin.representation_id,
            material_revision: material.pin.material_revision,
            locator: textSpan(material, at, at + marker[0].length),
          });
          if (current!.deferred.length >= 64) throw new Error("LIMIT_EXCEEDED");
          current!.deferred.push({
            dimension: dimensions[marker[1].toLowerCase()],
            fragment_id: id,
            reason: "UNSUPPORTED_DIMENSION",
          });
        }
        let cursor = 0;
        const ignoreGap = (start: number, end: number) => {
          if (body.slice(start, end).replace(/[\s;|/]+/g, "").length)
            ignored.push(textSpan(material, line.index! + start, line.index! + end));
        };
        for (const [start, end] of covered.sort((a, b) => a[0] - b[0])) {
          if (start > cursor) ignoreGap(cursor, start);
          cursor = Math.max(cursor, end);
        }
        if (cursor < body.length) ignoreGap(cursor, body.length);
        if (
          localItems.length > 64 ||
          current!.fields.length > 64 ||
          current!.deferred.length > 64 ||
          ignored.length > 64
        )
          throw new Error("LIMIT_EXCEEDED");
      }
      if (ignored.length > 64) throw new Error("LIMIT_EXCEEDED");
      if (items.length + localItems.length > 64) throw new Error("LIMIT_EXCEEDED");
      items.push(...localItems);
      fragments.push(...localFragments);
      coverage.push({
        input_id: material.pin.id,
        status: "PROCESSED",
        item_tokens: localItems.map((i) => i.token),
        ignored,
        code: null,
      });
    } catch (error) {
      const code =
        error instanceof Error && error.message === "LIMIT_EXCEEDED"
          ? "LIMIT_EXCEEDED"
          : "INPUT_INVALID";
      coverage.push({
        input_id: material.pin.id,
        status: code === "LIMIT_EXCEEDED" ? "DEFERRED" : "FAILED",
        item_tokens: [],
        ignored: [],
        code,
      });
    }
  }
  const status = coverage.every((c) => c.status === "PROCESSED")
    ? "SUCCEEDED"
    : coverage.some((c) => c.status === "PROCESSED")
      ? "PARTIAL"
      : "FAILED";
  const body = {
    binding: request.binding,
    status,
    items,
    fragments,
    coverage,
    unprocessed_input_ids: coverage
      .filter((c) => c.status !== "PROCESSED")
      .map((c) => c.input_id)
      .sort(),
    failures: coverage
      .filter((c) => c.code === "INPUT_INVALID" || c.code === "LIMIT_EXCEEDED")
      .map((c) => ({
        category: c.code as "INPUT_INVALID" | "LIMIT_EXCEEDED",
        code: c.code as "INPUT_INVALID" | "LIMIT_EXCEEDED",
        phase: "EXTRACTION" as const,
        retryability: "PERMANENT" as const,
        execution_certainty: "TERMINAL" as const,
        input_ids: [c.input_id],
        request_id: request.binding.request_id,
      })),
  };
  if (
    new TextEncoder().encode(canonicalEventJson(body as unknown as Json)).length >
    request.binding.limits.payload_bytes
  )
    throw new Error("LIMIT_EXCEEDED");
  return interpretationResponseSchema.parse({
    ...body,
    response_sha256: await importDigest(
      "otr-intelligence-response-v1",
      body as unknown as Json,
      sha256,
    ),
  });
}

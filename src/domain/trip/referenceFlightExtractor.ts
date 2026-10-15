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
  adapter_version: "2",
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
const designator = /^([A-Z][A-Z0-9]|[0-9][A-Z])([0-9]{1,4}[A-Z]?)$/;
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
  "origin.place_label",
  "destination.place_label",
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
    if (!/^Flight$/i.test(raw.trim())) service(raw);
    value = "FLIGHT";
  } else if (path === "service" || path === "operating_service")
    value = service(raw, path === "operating_service");
  else if (path.endsWith(".place_label")) {
    const route = /^([A-Za-z][A-Za-z .'-]{0,127}) to ([A-Za-z][A-Za-z .'-]{0,127})$/.exec(
      raw.trim(),
    );
    if (!route && !/^[A-Za-z][A-Za-z .'-]{0,127}$/.test(raw.trim()))
      throw new Error("INPUT_INVALID");
    value = route ? route[path.startsWith("origin") ? 1 : 2] : raw.trim();
  } else if (path.endsWith(".airport")) {
    const route = /^(?:route\s*[:=]\s*)?([A-Z]{3})\s*(?:→|->)\s*([A-Z]{3})$/i.exec(
      raw.trim(),
    );
    if (!route) throw new Error("INPUT_INVALID");
    value = {
      namespace: "IATA_AIRPORT",
      value: route[path.startsWith("origin") ? 1 : 2].toUpperCase(),
    };
  } else if (path.endsWith(".local_date")) {
    const english =
      /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i.exec(
        literal,
      );
    const normalized = english
      ? `${english[3]}-${String("jan feb mar apr may jun jul aug sep oct nov dec".split(" ").indexOf(english[2].toLowerCase()) + 1).padStart(2, "0")}-${english[1].padStart(2, "0")}`
      : literal;
    const parsed = flightTimeInputSchema.safeParse({
      ...UNKNOWN_FLIGHT_TIME,
      local_date: normalized,
    });
    if (!parsed.success) return { value: null, uncertainty: ["UNRESOLVED_DATE"] };
    value = normalized;
  } else if (path.endsWith(".local_time")) {
    const ampm = /^(\d{1,2}):(\d{2})\s+(AM|PM)$/i.exec(literal);
    if (ampm && (Number(ampm[1]) < 1 || Number(ampm[1]) > 12))
      return { value: null, uncertainty: ["UNRESOLVED_CLOCK"] };
    const clock = ampm
      ? `${String((Number(ampm[1]) % 12) + (ampm[3].toUpperCase() === "PM" ? 12 : 0)).padStart(2, "0")}:${ampm[2]}`
      : literal.replace(/^~/, "");
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
type LocalFlightFragment = Pick<InterpretationFragment, "id" | "locator">;
function localSpan(text: string, inputId: string, start: number, end: number) {
  return {
    input_id: inputId,
    kind: "TEXT_SPAN" as const,
    page: null,
    start: new TextEncoder().encode(text.slice(0, start)).length,
    end: new TextEncoder().encode(text.slice(0, end)).length,
    region: null,
  };
}
// Pure document grammar. No Trip, Source or representation identity is inferred here.
export function parseReferenceFlightText(inputId: string, text: string) {
  const localItems: InterpretationItem[] = [];
  const localFragments: LocalFlightFragment[] = [];
  const ignored: InterpretationResponse["coverage"][number]["ignored"] = [];
  // Reference grammar: a leg starts a line/row; following labelled lines belong
  // to it until the next leg or unrelated row. No OCR/transport is performed.
  const lines = [...text.matchAll(/[^\n]+/g)];
  let current: InterpretationItem | undefined;
  let tableMarker: { raw: string; at: number } | undefined;
  const consumed = new Set<number>();
  let ignoredCharEnd = 0,
    ignoredByteEnd = 0;
  const ignore = (start: number, end: number) => {
    const gap = text.slice(ignoredCharEnd, start);
    const startByte = ignoredByteEnd + new TextEncoder().encode(gap).length;
    const endByte = startByte + new TextEncoder().encode(text.slice(start, end)).length;
    const locator = {
      input_id: inputId,
      kind: "TEXT_SPAN" as const,
      page: null,
      start: startByte,
      end: endByte,
      region: null,
    };
    const previous = ignored.at(-1);
    if (previous && /^\s*$/.test(gap)) previous.end = endByte;
    else ignored.push(locator);
    ignoredCharEnd = end;
    ignoredByteEnd = endByte;
  };
  for (const [lineNumber, line] of lines.entries()) {
    if (consumed.has(lineNumber)) continue;
    const body = line[0].replace(/\r$/, "");
    if (/^(?:Your flights|Flight details)$/i.test(body.trim())) {
      const at = body.toLowerCase().indexOf("flight");
      tableMarker = { raw: body.slice(at, at + 6), at: line.index! + at };
      current = undefined;
      ignore(line.index!, line.index! + body.length);
      continue;
    }
    const placeRoute =
      tableMarker &&
      /^([A-Za-z][A-Za-z .'-]{0,127}) to ([A-Za-z][A-Za-z .'-]{0,127})$/.test(
        body.trim(),
      );
    const table = placeRoute && lines.slice(lineNumber + 1, lineNumber + 11);
    const tableLeg =
      table &&
      table.length === 10 &&
      [table[3], table[8]].every((l) =>
        /^[A-Za-z][A-Za-z .'-]{0,127}$/.test(l[0].trim()),
      ) &&
      /^Departure$/i.test(table[0][0].trim()) &&
      /^Arrival$/i.test(table[5][0].trim()) &&
      [table[1], table[6]].every((l) => /^\d{1,2}:\d{2}\s+(AM|PM)$/i.test(l[0].trim())) &&
      [table[2], table[7]].every((l) =>
        /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+)?\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i.test(
          l[0].trim(),
        ),
      );
    if (!tableLeg) tableMarker = undefined;
    const head =
      /^\s*(?:Flight\s*[:=]\s*)?((?:[A-Z][A-Z0-9]|[0-9][A-Z])[0-9]{1,4}[A-Z]?)(?=\s|[;|]|$)/.exec(
        body,
      );
    // Only an explicit Flight marker starts a numberless leg; route prose is not enough.
    const sparseHead =
      /^\s*(Flight)(?=\s+(?:route\s*[:=]\s*)?[A-Z]{3}\s*(?:→|->)\s*[A-Z]{3})/i.exec(body);
    const labelled =
      /^\s*(?:date|depDate|arrDate|departure|arrival|dep|arr|route|depZone|arrZone|depOffset|arrOffset|depInstant|arrInstant|passenger|pnr|seat|ticket|baggage|fare|cabin|occurrence|change)\s*[:=]/i.test(
        body,
      );
    if (!head && !sparseHead && !tableLeg && (!current || !labelled)) {
      if (body.trim()) ignore(line.index!, line.index! + body.length);
      if (ignored.length > 64) throw new Error("LIMIT_EXCEEDED");
      current = undefined;
      continue;
    }
    const covered: [number, number][] = [];
    const add = (path: string, raw: string, at: number) => {
      if (raw.length > 5000) throw new Error("LIMIT_EXCEEDED");
      if (at >= line.index! && at + raw.length <= line.index! + body.length)
        covered.push([at - line.index!, at - line.index! + raw.length]);
      const id = `f:${inputId}:${new TextEncoder().encode(text.slice(0, at)).length}:${new TextEncoder().encode(raw).length}`;
      if (!localFragments.some((f) => f.id === id))
        localFragments.push({
          id,
          locator: localSpan(text, inputId, at, at + raw.length),
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
    if (head || sparseHead || tableLeg) {
      current = {
        token: `item:${inputId}:${line.index}`,
        schema_id: "otr.import.flight",
        fields: [],
        deferred: [],
      };
      localItems.push(current);
      const marker = head ?? sparseHead;
      const raw = marker ? marker[0].trim() : tableMarker!.raw,
        at = marker ? line.index! + marker[0].indexOf(raw) : tableMarker!.at;
      add("transport_subtype", raw, at);
      if (head) add("service", raw, at);
    }
    if (tableLeg && table) {
      const route = body.trim();
      add("origin.place_label", route, line.index! + body.indexOf(route));
      add("destination.place_label", route, line.index! + body.indexOf(route));
      for (const [role, index] of [
        ["origin", 3],
        ["destination", 8],
      ] as const) {
        const entry = table[index],
          raw = entry[0].trim();
        add(`${role}.place_label`, raw, entry.index! + entry[0].indexOf(raw));
      }
      for (let index = 0; index < table.length; index++) {
        consumed.add(lineNumber + 1 + index);
        if ([0, 4, 5, 9].includes(index))
          ignore(table[index].index!, table[index].index! + table[index][0].length);
      }
      for (const [role, clockIndex, dateIndex] of [
        ["origin", 1, 2],
        ["destination", 6, 7],
      ] as const) {
        for (const [index, path] of [
          [clockIndex, `${role}.local_time`],
          [dateIndex, `${role}.local_date`],
        ] as const) {
          const entry = table[index];
          const raw = entry[0].trim();
          add(path, raw, entry.index! + entry[0].indexOf(raw));
          consumed.add(lineNumber + 1 + index);
        }
      }
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
      const id = `f:${inputId}:${new TextEncoder().encode(text.slice(0, at)).length}:${new TextEncoder().encode(marker[0]).length}`;
      localFragments.push({
        id,
        locator: localSpan(text, inputId, at, at + marker[0].length),
      });
      if (current!.deferred.length >= 64) throw new Error("LIMIT_EXCEEDED");
      current!.deferred.push({
        dimension: dimensions[marker[1].toLowerCase()],
        fragment_id: id,
        reason: "UNSUPPORTED_DIMENSION",
      });
    }
    for (const route of body.matchAll(
      /(?:route\s*[:=]\s*)?[A-Z]{3}(?:\s*(?:→|->)\s*[A-Z]{3})+/gi,
    )) {
      const at = route.index!;
      if (covered.some(([start, end]) => at < end && at + route[0].length > start))
        continue;
      // An itinerary chain does not establish a service-to-leg pairing.
      if (route[0].split(/→|->/).length !== 2) continue;
      add("origin.airport", route[0], line.index! + route.index!);
      add("destination.airport", route[0], line.index! + route.index!);
    }
    // A bare ISO date on a compact itinerary row is its departure-local date.
    if ((head || sparseHead) && !/\b(?:date|depDate)\s*[:=]/i.test(body)) {
      for (const date of body.matchAll(/(?:^|[\s;|])(\d{4}-\d{2}-\d{2})(?=$|[\s;|])/g)) {
        const at = date.index! + date[0].indexOf(date[1]);
        if (covered.some(([start, end]) => at < end && at + date[1].length > start))
          continue;
        add("origin.local_date", date[1], line.index! + at);
      }
    }
    let cursor = 0;
    const ignoreGap = (start: number, end: number) => {
      if (body.slice(start, end).replace(/[\s;|/]+/g, "").length)
        ignore(line.index! + start, line.index! + end);
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
  return { items: localItems, fragments: localFragments, ignored };
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
    try {
      const local = parseReferenceFlightText(material.pin.id, material.text);
      if (items.length + local.items.length > 64) throw new Error("LIMIT_EXCEEDED");
      items.push(...local.items);
      fragments.push(
        ...local.fragments.map((fragment) => ({
          ...fragment,
          source_id: material.pin.source_id,
          representation_id: material.pin.representation_id,
          material_revision: material.pin.material_revision,
        })),
      );
      coverage.push({
        input_id: material.pin.id,
        status: "PROCESSED",
        item_tokens: local.items.map((i) => i.token),
        ignored: local.ignored,
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

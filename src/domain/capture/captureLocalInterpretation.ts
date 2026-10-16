import { z } from "zod";
import type { FlightSemanticAssemblyDiagnostic } from "@/domain/trip/flightSemanticAssembly";
import { assembleFlightDocuments } from "@/domain/trip/flightAssembly";
import { interpretationResponseSchema } from "@/domain/intelligence/interpretation";
import {
  normalizeFlightObservation,
  parseReferenceFlightText,
} from "@/domain/trip/referenceFlightExtractor";

const box = z.strictObject({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().min(0).max(1),
  height: z.number().finite().min(0).max(1),
});
const extracted = z.strictObject({
  engine: z.enum(["apple-pdfkit", "apple-vision", "utf8-text"]),
  version: z.literal(1).optional(),
  textSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  textByteCount: z.number().int().min(1).max(262144).optional(),
  text: z
    .string()
    .min(1)
    .max(262144)
    .refine((value) => !value.includes("\0")),
  pages: z
    .array(
      z.strictObject({
        pageIndex: z.number().int().min(0).max(31),
        start: z.number().int().min(0).max(262144),
        end: z.number().int().min(1).max(262144),
      }),
    )
    .optional(),
  observations: z
    .array(
      z.strictObject({
        text: z.string().min(1),
        confidence: z.number().finite().min(0).max(1),
        boundingBox: box,
      }),
    )
    .optional(),
  originalSha256: z.string().regex(/^[0-9a-f]{64}$/),
  originalByteCount: z.number().int().min(1).max(10485760),
});

type RawExtraction = z.infer<typeof extracted>;
export type CaptureLocalResult = ReturnType<typeof buildCaptureLocalResult>;
type LocalModelObservation = { literal: string; start: number; end: number };

// Only original bytes, derived local text, and exact local locators are represented.
// A parsed field is an observation, never a Source or canonical Flight.
export function buildCaptureLocalResult(
  inputId: string,
  raw: unknown,
  original: { sha256: string; byteCount: number },
  textSha256: string,
  modelCapability: "AVAILABLE" | "UNAVAILABLE",
) {
  const value: RawExtraction = extracted.parse(raw);
  if (
    value.originalSha256 !== original.sha256 ||
    value.originalByteCount !== original.byteCount
  )
    throw new Error("CAPTURE_LOCAL_ORIGINAL_MISMATCH");
  const bytes = new TextEncoder().encode(value.text);
  if (bytes.length > 262144 || bytes.length === 0)
    throw new Error("CAPTURE_LOCAL_TEXT_LIMIT");
  if (
    (value.textSha256 && value.textSha256 !== textSha256) ||
    (value.textByteCount && value.textByteCount !== bytes.length)
  )
    throw new Error("CAPTURE_LOCAL_TEXT_MISMATCH");
  if (value.engine === "apple-pdfkit") {
    if (!value.pages?.length || value.observations !== undefined)
      throw new Error("CAPTURE_LOCAL_PDF_MAPPING");
    let end = 0;
    for (const [index, page] of value.pages.entries()) {
      if (
        page.pageIndex !== index ||
        page.start !== end ||
        page.end <= page.start ||
        page.end > bytes.length
      )
        throw new Error("CAPTURE_LOCAL_PDF_MAPPING");
      if (
        !new TextDecoder("utf-8", { fatal: true })
          .decode(bytes.slice(page.start, page.end))
          .trim()
      )
        throw new Error("CAPTURE_LOCAL_PDF_MAPPING");
      end = page.end;
      if (index + 1 < value.pages.length) {
        if (bytes[end] !== 10) throw new Error("CAPTURE_LOCAL_PDF_MAPPING");
        end++;
      }
    }
    if (end !== bytes.length) throw new Error("CAPTURE_LOCAL_PDF_MAPPING");
  } else if (value.engine === "apple-vision") {
    if (
      value.pages !== undefined ||
      !value.observations?.length ||
      value.observations.map((observation) => observation.text).join("\n") !==
        value.text ||
      value.observations.some(
        ({ boundingBox: b }) => b.x + b.width > 1 || b.y + b.height > 1,
      )
    )
      throw new Error("CAPTURE_LOCAL_OCR_MAPPING");
  } else if (value.pages !== undefined || value.observations !== undefined) {
    throw new Error("CAPTURE_LOCAL_TEXT_MAPPING");
  }
  let parsed: ReturnType<typeof parseReferenceFlightText>;
  let parserStatus: "SUCCEEDED" | "FAILED" = "SUCCEEDED";
  try {
    parsed = parseReferenceFlightText(inputId, value.text);
  } catch {
    // Extraction evidence remains useful when this narrow deterministic grammar cannot read it.
    parsed = { items: [], fragments: [], ignored: [] };
    parserStatus = "FAILED";
  }
  const fragments = new Map(
    parsed.fragments.map((fragment) => [fragment.id, fragment.locator]),
  );
  const regions = value.observations?.map((observation, index, all) => {
    const start =
      new TextEncoder().encode(
        all
          .slice(0, index)
          .map((item) => item.text)
          .join("\n"),
      ).length + (index ? 1 : 0);
    return {
      start,
      end: start + new TextEncoder().encode(observation.text).length,
      box: observation.boundingBox,
    };
  });
  const fields = parsed.items.flatMap((item) =>
    item.fields.map((field) => {
      const spans = field.fragment_ids.map((id) => fragments.get(id));
      if (spans.some((span) => !span || span.start === null || span.end === null))
        throw new Error("CAPTURE_LOCAL_SPAN_INVALID");
      return {
        itemToken: item.token,
        path: field.path,
        raw: field.raw,
        normalized: field.normalized,
        uncertainty: field.uncertainty,
        evidence: spans.map((span) => {
          const start = span!.start!,
            end = span!.end!;
          if (
            start < 0 ||
            end <= start ||
            end > bytes.length ||
            new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(start, end)) !==
              field.raw
          )
            throw new Error("CAPTURE_LOCAL_SPAN_INVALID");
          return {
            inputId,
            start,
            end,
            pages:
              value.pages
                ?.filter((page) => page.start < end && page.end > start)
                .map((page) => page.pageIndex) ?? [],
            boxes:
              regions
                ?.filter((region) => region.start < end && region.end > start)
                .map((region) => region.box) ?? [],
          };
        }),
      };
    }),
  );
  return {
    version: 1 as const,
    inputId,
    engine: value.engine,
    originalSha256: original.sha256,
    originalByteCount: original.byteCount,
    text: value.text,
    textSha256,
    pages: value.pages ?? [],
    observations: value.observations ?? [],
    fields,
    ignored: parsed.ignored,
    parserStatus,
    status: fields.length
      ? ("PARTIAL_FLIGHT_OBSERVATIONS" as const)
      : ("TEXT_ONLY" as const),
    modelCapability,
    modelExecution: "NOT_RUN" as "NOT_RUN" | "SUCCEEDED" | "UNAVAILABLE" | "FAILED",
    modelReason: null as string | null,
    assemblyDiagnostics: null as FlightSemanticAssemblyDiagnostic | null,
    supplementalServiceObservations: [] as {
      literal: string;
      normalized: ReturnType<typeof normalizeFlightObservation>["value"];
      start: number;
      end: number;
      pages: number[];
      boxes: z.infer<typeof box>[];
      evidenceKind: "LOCAL_MODEL_INFERRED";
    }[],
    sourceAuthority: "NONE" as const,
    reviewAvailable: false as const,
  };
}

export function needsCaptureLocalEnrichment(result: CaptureLocalResult) {
  if (
    result.parserStatus === "FAILED" ||
    result.fields.length === 0 ||
    result.ignored.length
  )
    return true;
  const byItem = new Map<string, Set<string>>();
  for (const field of result.fields) {
    const paths = byItem.get(field.itemToken) ?? new Set<string>();
    paths.add(field.path);
    byItem.set(field.itemToken, paths);
  }
  return [...byItem.values()].some((paths) =>
    ["service", "origin.airport", "destination.airport"].some((path) => !paths.has(path)),
  );
}

export function attachCaptureLocalModelEvidence(
  result: CaptureLocalResult,
  response: {
    status: "SUCCEEDED" | "UNAVAILABLE" | "FAILED";
    reason: string;
    observations: LocalModelObservation[];
  },
): CaptureLocalResult {
  if (response.reason.length > 128 || response.observations.length > 64)
    throw new Error("CAPTURE_LOCAL_MODEL_INVALID");
  if (response.status !== "SUCCEEDED")
    return { ...result, modelExecution: response.status, modelReason: response.reason };
  const bytes = new TextEncoder().encode(result.text);
  const observations = response.observations.map(({ literal, start, end }) => {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end <= start ||
      end > bytes.length ||
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(start, end)) !==
        literal
    )
      throw new Error("CAPTURE_LOCAL_MODEL_SPAN_INVALID");
    const normalized = normalizeFlightObservation("service", literal).value;
    let cursor = 0;
    const boxes = result.observations.flatMap((observation, index) => {
      if (index) cursor++;
      const begin = cursor;
      cursor += new TextEncoder().encode(observation.text).length;
      return begin < end && cursor > start ? [observation.boundingBox] : [];
    });
    return {
      literal,
      normalized,
      start,
      end,
      pages: result.pages
        .filter((page) => page.start < end && page.end > start)
        .map((page) => page.pageIndex),
      boxes,
      evidenceKind: "LOCAL_MODEL_INFERRED" as const,
    };
  });
  return {
    ...result,
    modelExecution: "SUCCEEDED",
    modelReason: response.reason,
    supplementalServiceObservations: observations,
  };
}

// Read projection also serves retained schema67 results; no Source-bound response is fabricated.
export function projectCaptureLocalFlightInterpretation(
  result: Pick<CaptureLocalResult, "inputId" | "text"> &
    Partial<Pick<CaptureLocalResult, "originalSha256" | "originalByteCount">>,
) {
  try {
    const parsed = parseReferenceFlightText(result.inputId, result.text);
    const bytes = new TextEncoder().encode(result.text);
    const fragments = interpretationResponseSchema.shape.fragments.element
      .pick({ id: true, locator: true })
      .array()
      .parse(parsed.fragments);
    const evidence = new Map(
      fragments.map((fragment) => {
        const { input_id, start, end } = fragment.locator;
        if (
          input_id !== result.inputId ||
          start === null ||
          end === null ||
          start < 0 ||
          end <= start ||
          end > bytes.length
        )
          throw new Error("CAPTURE_LOCAL_SPAN_INVALID");
        return [
          fragment.id,
          new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(start, end)),
        ];
      }),
    );
    const items = interpretationResponseSchema.shape.items.parse(parsed.items);
    for (const item of items) {
      if (
        item.fields.some((field) =>
          field.fragment_ids.some((id) => evidence.get(id) !== field.raw),
        ) ||
        item.deferred.some((field) => !evidence.has(field.fragment_id))
      )
        throw new Error("CAPTURE_LOCAL_SPAN_INVALID");
    }
    const assembly = assembleFlightDocuments([
      {
        inputId: result.inputId,
        text: result.text,
        originalSha256: result.originalSha256,
        originalByteCount: result.originalByteCount,
        parsed: { items, fragments },
      },
    ]);
    return {
      status: "PARTIAL" as const,
      projectionKind: "CURRENT_PARSER_READ" as const,
      assembly,
      items: assembly.segments.map((segment) => ({
        token: segment.id,
        schema_id: "otr.import.flight",
        fields: segment.fields,
        deferred: segment.deferred,
      })),
      fragments,
      ignored: parsed.ignored,
    };
  } catch {
    return {
      status: "FAILED" as const,
      projectionKind: "CURRENT_PARSER_READ" as const,
      items: [],
      fragments: [],
      ignored: [],
    };
  }
}

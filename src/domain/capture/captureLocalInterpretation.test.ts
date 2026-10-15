import { expect, it } from "vitest";
import { parseReferenceFlightText } from "@/domain/trip/referenceFlightExtractor";
import {
  attachCaptureLocalModelEvidence,
  buildCaptureLocalResult,
  needsCaptureLocalEnrichment,
} from "./captureLocalInterpretation";

it("parses local Flight spans without inventing Trip or Source identities", () => {
  const inputId = "9ba9d148-c0cc-4dbd-a57c-fdb5146c663d";
  const text = "Flight: NZ123 route: AKL -> WLG date: 2026-10-16";
  const parsed = parseReferenceFlightText(inputId, text);
  expect(parsed.items[0].fields.some((field) => field.path === "service")).toBe(true);
  expect(parsed.fragments[0]).not.toHaveProperty("source_id");
  expect(parsed.fragments[0].locator.input_id).toBe(inputId);
  const result = buildCaptureLocalResult(
    inputId,
    {
      engine: "apple-pdfkit",
      text,
      pages: [{ pageIndex: 0, start: 0, end: new TextEncoder().encode(text).length }],
      originalSha256: "a".repeat(64),
      originalByteCount: 10,
    },
    { sha256: "a".repeat(64), byteCount: 10 },
    "b".repeat(64),
    "UNAVAILABLE",
  );
  expect(
    result.fields.some(
      (field) => field.path === "service" && field.evidence[0].pages[0] === 0,
    ),
  ).toBe(true);
  expect(result.sourceAuthority).toBe("NONE");
  expect(result.reviewAvailable).toBe(false);
});

it("rejects a page or OCR box that does not map to exact extracted text", () => {
  const basis = { sha256: "a".repeat(64), byteCount: 10 };
  expect(() =>
    buildCaptureLocalResult(
      "input",
      {
        engine: "apple-pdfkit",
        text: "Flight: NZ123",
        pages: [{ pageIndex: 0, start: 1, end: 13 }],
        originalSha256: basis.sha256,
        originalByteCount: basis.byteCount,
      },
      basis,
      "b".repeat(64),
      "UNAVAILABLE",
    ),
  ).toThrow("CAPTURE_LOCAL_PDF_MAPPING");
  expect(() =>
    buildCaptureLocalResult(
      "input",
      {
        engine: "apple-vision",
        text: "Flight: NZ123",
        observations: [
          {
            text: "different",
            confidence: 1,
            boundingBox: { x: 0.8, y: 0, width: 0.3, height: 0.1 },
          },
        ],
        originalSha256: basis.sha256,
        originalByteCount: basis.byteCount,
      },
      basis,
      "b".repeat(64),
      "UNAVAILABLE",
    ),
  ).toThrow();
});

it("keeps a local-model service literal as separate advisory evidence", () => {
  const text = "Flight: NZ123";
  const basis = { sha256: "a".repeat(64), byteCount: 10 };
  const local = buildCaptureLocalResult(
    "input",
    {
      engine: "apple-pdfkit",
      text,
      pages: [{ pageIndex: 0, start: 0, end: new TextEncoder().encode(text).length }],
      originalSha256: basis.sha256,
      originalByteCount: basis.byteCount,
    },
    basis,
    "b".repeat(64),
    "AVAILABLE",
  );
  expect(needsCaptureLocalEnrichment(local)).toBe(true);
  const enriched = attachCaptureLocalModelEvidence(local, {
    status: "SUCCEEDED",
    reason: "MODEL_RETURNED",
    observations: [{ literal: "NZ123", start: 8, end: 13 }],
  });
  expect(enriched.supplementalServiceObservations[0]).toMatchObject({
    literal: "NZ123",
    pages: [0],
    evidenceKind: "LOCAL_MODEL_INFERRED",
  });
  expect(enriched.fields).toEqual(local.fields);
  expect(enriched.sourceAuthority).toBe("NONE");
});

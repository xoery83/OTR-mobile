import { normalizeFlightObservation } from "@/domain/trip/referenceFlightExtractor";
import { validateFlightPdfExtraction } from "@/data/interpretation/flightPdfExtraction";
import { z } from "zod";

export type CaptureLocalBridge = {
  extractCaptureLocal(bytes: Uint8Array, mediaType: string): Promise<unknown>;
  captureLocalModelCapability(): Promise<unknown>;
  enrichCaptureFlightLocal?(text: string): Promise<unknown>;
};
export type CaptureLocalExtraction = {
  engine: "apple-pdfkit" | "apple-vision" | "utf8-text";
  text: string;
  pages?: { pageIndex: number; start: number; end: number }[];
  observations?: {
    text: string;
    confidence: number;
    boundingBox: { x: number; y: number; width: number; height: number };
  }[];
  originalSha256: string;
  originalByteCount: number;
};
const capabilitySchema = z.object({
  status: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  reason: z.enum([
    "SYSTEM_MODEL_AVAILABLE",
    "DEVICE_NOT_ELIGIBLE",
    "APPLE_INTELLIGENCE_NOT_ENABLED",
    "MODEL_NOT_READY",
    "UNKNOWN_MODEL_UNAVAILABILITY",
    "FOUNDATION_MODELS_UNSUPPORTED",
  ]),
});
const imageSchema = z.object({
  engine: z.literal("apple-vision"),
  text: z.string().min(1).max(262144),
  originalSha256: z.string().regex(/^[0-9a-f]{64}$/),
  originalByteCount: z.number().int().positive().max(10485760),
  observations: z
    .array(
      z.object({
        text: z.string().min(1),
        confidence: z.number().finite().min(0).max(1),
        boundingBox: z
          .object({
            x: z.number().finite().min(0).max(1),
            y: z.number().finite().min(0).max(1),
            width: z.number().finite().min(0).max(1),
            height: z.number().finite().min(0).max(1),
          })
          .refine((b) => b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001),
      }),
    )
    .min(1)
    .max(4096),
});
export function createCaptureLocalExtractorCore(dependencies: {
  getBridge: () => CaptureLocalBridge;
  hash: (bytes: Uint8Array) => Promise<string>;
}) {
  return {
    async extract(bytes: Uint8Array, mediaType: string): Promise<CaptureLocalExtraction> {
      if (!bytes.length || bytes.length > 10485760)
        throw new Error("CAPTURE_EXTRACTION_LIMIT");
      if (
        !["application/pdf", "image/jpeg", "image/png", "text/plain"].includes(mediaType)
      )
        throw new Error("CAPTURE_EXTRACTION_MEDIA_UNSUPPORTED");
      if (mediaType === "text/plain") {
        if (bytes.length > 262144) throw new Error("CAPTURE_EXTRACTION_LIMIT");
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        } catch {
          throw new Error("CAPTURE_LOCAL_TEXT_INVALID");
        }
        if (!text.length || text.includes("\0"))
          throw new Error("CAPTURE_LOCAL_TEXT_INVALID");
        return {
          engine: "utf8-text",
          text,
          originalSha256: await dependencies.hash(bytes),
          originalByteCount: bytes.length,
        };
      }
      const bridge = dependencies.getBridge();
      if (typeof bridge.extractCaptureLocal !== "function")
        throw new Error("CAPTURE_LOCAL_CAPABILITY_UNAVAILABLE");
      const hash = dependencies.hash;
      const expected = { sha256: await hash(bytes), byteCount: bytes.length };
      const raw = await bridge.extractCaptureLocal(new Uint8Array(bytes), mediaType);
      if (typeof raw === "object" && raw !== null && "error" in raw)
        throw new Error("CAPTURE_LOCAL_EXTRACTION_FAILED");
      if (mediaType === "application/pdf")
        return validateFlightPdfExtraction(raw, expected, hash);
      const result = imageSchema.parse(raw);
      if (
        result.originalSha256 !== expected.sha256 ||
        result.originalByteCount !== expected.byteCount
      )
        throw new Error("CAPTURE_ORIGINAL_MISMATCH");
      if (
        result.text !== result.observations.map((o) => o.text).join("\n") ||
        new TextEncoder().encode(result.text).length > 262144 ||
        result.text.includes("\0")
      )
        throw new Error("CAPTURE_OCR_MAPPING_INVALID");
      return result;
    },
    async enrich(text: string): Promise<{
      status: "SUCCEEDED" | "UNAVAILABLE" | "FAILED";
      reason: string;
      observations: { literal: string; start: number; end: number }[];
    }> {
      if (!text.trim() || new TextEncoder().encode(text).length > 16384)
        return { status: "FAILED", reason: "LOCAL_MODEL_INPUT_LIMIT", observations: [] };
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const bridge = dependencies.getBridge();
        if (typeof bridge.enrichCaptureFlightLocal !== "function")
          return {
            status: "UNAVAILABLE",
            reason: "CAPABILITY_NOT_INSTALLED",
            observations: [],
          };
        const raw = await Promise.race([
          bridge.enrichCaptureFlightLocal(text),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("LOCAL_MODEL_TIMEOUT")), 20000);
          }),
        ]);
        if (
          typeof raw === "object" &&
          raw !== null &&
          "error" in raw &&
          [
            "LOCAL_MODEL_FAILED",
            "LOCAL_MODEL_UNAVAILABLE",
            "LOCAL_MODEL_INPUT_LIMIT",
            "LOCAL_MODEL_OUTPUT_LIMIT",
          ].includes(String(raw.error))
        )
          throw new Error(String(raw.error));
        return validateCaptureLocalModelResponse(text, raw);
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        return {
          status: "FAILED",
          reason: [
            "LOCAL_MODEL_TIMEOUT",
            "LOCAL_MODEL_FAILED",
            "LOCAL_MODEL_UNAVAILABLE",
            "LOCAL_MODEL_INPUT_LIMIT",
            "LOCAL_MODEL_OUTPUT_LIMIT",
            "LOCAL_MODEL_EVIDENCE_INVALID",
          ].includes(code)
            ? code
            : "LOCAL_MODEL_OUTPUT_INVALID",
          observations: [],
        };
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
    async modelCapability() {
      try {
        const bridge = dependencies.getBridge();
        if (typeof bridge.captureLocalModelCapability !== "function")
          return { status: "UNAVAILABLE" as const, reason: "CAPABILITY_NOT_INSTALLED" };
        const result = capabilitySchema.parse(await bridge.captureLocalModelCapability());
        if (
          (result.status === "AVAILABLE") !==
          (result.reason === "SYSTEM_MODEL_AVAILABLE")
        )
          throw new Error("CAPABILITY_INVALID");
        return result;
      } catch {
        return { status: "UNAVAILABLE" as const, reason: "CAPABILITY_UNAVAILABLE" };
      }
    },
  };
}

// Shared by Native, Mac and diagnostic Trace validation; exact evidence policy is unchanged.
export function validateCaptureLocalModelResponse(text: string, raw: unknown) {
  const envelope = z.object({ json: z.string().max(8192) }).parse(raw);
  const result = z
    .strictObject({ flightNumbers: z.array(z.string().min(2).max(16)).max(64) })
    .parse(JSON.parse(envelope.json));
  const observations = [...new Set(result.flightNumbers)].map((literal) => {
    normalizeFlightObservation("service", literal);
    const startChar = text.indexOf(literal);
    if (startChar < 0 || text.indexOf(literal, startChar + 1) !== -1)
      throw new Error("LOCAL_MODEL_EVIDENCE_INVALID");
    const start = new TextEncoder().encode(text.slice(0, startChar)).length;
    return {
      literal,
      start,
      end: start + new TextEncoder().encode(literal).length,
    };
  });
  return {
    status: "SUCCEEDED" as const,
    reason: "VERBATIM_SERVICE_EVIDENCE_ONLY",
    observations,
  };
}

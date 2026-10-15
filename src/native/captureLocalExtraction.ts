import { normalizeFlightObservation } from "@/domain/trip/referenceFlightExtractor";
import { requireNativeModule } from "expo";
import { digest, CryptoDigestAlgorithm } from "expo-crypto";
import { Platform } from "react-native";
import { z } from "zod";
import { validateFlightPdfExtraction } from "@/data/interpretation/flightPdfExtraction";
import type { OcrDocument } from "./receiptOcr";

type Bridge = {
  extractCaptureLocal(bytes: Uint8Array, mediaType: string): Promise<unknown>;
  captureLocalModelCapability(): Promise<unknown>;
  enrichCaptureFlightLocal?(text: string): Promise<unknown>;
};
export type CaptureLocalExtraction = {
  engine: "apple-pdfkit" | "apple-vision";
  text: string;
  pages?: { pageIndex: number; start: number; end: number }[];
  observations?: OcrDocument["observations"];
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
async function sha256(bytes: Uint8Array) {
  const result = await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes));
  return Array.from(new Uint8Array(result), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
}
export function createCaptureLocalExtractor(
  dependencies: {
    platform?: string;
    bridge?: Bridge;
    hash?: typeof sha256;
  } = {},
) {
  function native() {
    if ((dependencies.platform ?? Platform.OS) !== "ios")
      throw new Error("CAPTURE_LOCAL_CAPABILITY_UNAVAILABLE");
    try {
      return dependencies.bridge ?? requireNativeModule<Bridge>("ReceiptOcr");
    } catch {
      throw new Error("CAPTURE_LOCAL_CAPABILITY_UNAVAILABLE");
    }
  }
  return {
    async extract(bytes: Uint8Array, mediaType: string): Promise<CaptureLocalExtraction> {
      if (!bytes.length || bytes.length > 10485760)
        throw new Error("CAPTURE_EXTRACTION_LIMIT");
      if (!["application/pdf", "image/jpeg", "image/png"].includes(mediaType))
        throw new Error("CAPTURE_EXTRACTION_MEDIA_UNSUPPORTED");
      const bridge = native();
      if (typeof bridge.extractCaptureLocal !== "function")
        throw new Error("CAPTURE_LOCAL_CAPABILITY_UNAVAILABLE");
      const hash = dependencies.hash ?? sha256;
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
        const bridge = native();
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
          status: "SUCCEEDED",
          reason: "VERBATIM_SERVICE_EVIDENCE_ONLY",
          observations,
        };
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
        const bridge = native();
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
export const extractCaptureLocal = (bytes: Uint8Array, mediaType: string) =>
  createCaptureLocalExtractor().extract(bytes, mediaType);
export const readCaptureLocalModelCapability = () =>
  createCaptureLocalExtractor().modelCapability();

export const enrichCaptureFlightLocal = (text: string) =>
  createCaptureLocalExtractor().enrich(text);

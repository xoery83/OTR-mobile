import { requireNativeModule } from "expo";
import { Platform } from "react-native";
import { z } from "zod";

const boxSchema = z
  .object({
    x: z.number().finite().min(-0.000001).max(1.000001),
    y: z.number().finite().min(-0.000001).max(1.000001),
    width: z.number().finite().min(0).max(1.000001),
    height: z.number().finite().min(0).max(1.000001),
  })
  .refine(({ x, y, width, height }) => x + width <= 1.000001 && y + height <= 1.000001);

const documentSchema = z.object({
  engine: z.literal("apple-vision"),
  engineRevision: z.number().int().positive(),
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  durationMs: z.number().int().nonnegative(),
  supportedLanguages: z.array(z.string()),
  observations: z.array(
    z.object({
      text: z.string().min(1),
      confidence: z.number().finite().min(0).max(1),
      boundingBox: boxSchema,
    }),
  ),
});

export type OcrDocument = z.infer<typeof documentSchema>;
export type OcrObservation = OcrDocument["observations"][number];
export type ReceiptOcrErrorCode =
  | "UNSUPPORTED_PLATFORM"
  | "INVALID_FILE"
  | "UNSUPPORTED_IMAGE"
  | "VISION_FAILURE"
  | "CANCELLED"
  | "MALFORMED_RESULT";

export class ReceiptOcrError extends Error {
  constructor(readonly code: ReceiptOcrErrorCode) {
    super(`Receipt OCR ${code.toLowerCase().replaceAll("_", " ")}.`);
    this.name = "ReceiptOcrError";
  }
}

type NativeReceiptOcr = {
  recognize(uri: string, requestId: string): Promise<unknown>;
  cancel(requestId: string): void;
  capabilities(): Promise<unknown>;
};

const capabilitiesSchema = documentSchema.pick({
  engineRevision: true,
  supportedLanguages: true,
});
let nextRequestId = 0;

export function parseOcrDocument(value: unknown): OcrDocument {
  const parsed = documentSchema.safeParse(value);
  if (!parsed.success) throw new ReceiptOcrError("MALFORMED_RESULT");
  return {
    ...parsed.data,
    observations: parsed.data.observations.map((observation) => {
      const x = Math.max(0, Math.min(1, observation.boundingBox.x));
      const y = Math.max(0, Math.min(1, observation.boundingBox.y));
      return {
        ...observation,
        boundingBox: {
          x,
          y,
          width: Math.max(0, Math.min(1 - x, observation.boundingBox.width)),
          height: Math.max(0, Math.min(1 - y, observation.boundingBox.height)),
        },
      };
    }),
  };
}

export function createReceiptOcrProvider(
  platform: string = Platform.OS,
  native: NativeReceiptOcr | null = null,
) {
  function module(): NativeReceiptOcr {
    if (platform !== "ios") throw new ReceiptOcrError("UNSUPPORTED_PLATFORM");
    try {
      return native ?? requireNativeModule<NativeReceiptOcr>("ReceiptOcr");
    } catch {
      throw new ReceiptOcrError("UNSUPPORTED_PLATFORM");
    }
  }

  return {
    async capabilities() {
      const result = capabilitiesSchema.safeParse(await module().capabilities());
      if (!result.success) throw new ReceiptOcrError("MALFORMED_RESULT");
      return result.data;
    },
    async recognize(input: { uri: string; signal?: AbortSignal }): Promise<OcrDocument> {
      if (input.signal?.aborted) throw new ReceiptOcrError("CANCELLED");
      if (!input.uri.startsWith("file://")) throw new ReceiptOcrError("INVALID_FILE");
      const bridge = module();
      const requestId = `ocr-${Date.now()}-${++nextRequestId}`;
      const cancel = () => bridge.cancel(requestId);
      input.signal?.addEventListener("abort", cancel, { once: true });
      try {
        const result = await bridge.recognize(input.uri, requestId);
        if (input.signal?.aborted) throw new ReceiptOcrError("CANCELLED");
        if (typeof result === "object" && result !== null && "error" in result) {
          const code = result.error;
          if (
            ["INVALID_FILE", "UNSUPPORTED_IMAGE", "VISION_FAILURE", "CANCELLED"].includes(
              String(code),
            )
          )
            throw new ReceiptOcrError(code as ReceiptOcrErrorCode);
        }
        return parseOcrDocument(result);
      } catch (error) {
        if (error instanceof ReceiptOcrError) throw error;
        throw new ReceiptOcrError(input.signal?.aborted ? "CANCELLED" : "VISION_FAILURE");
      } finally {
        input.signal?.removeEventListener("abort", cancel);
      }
    },
  };
}

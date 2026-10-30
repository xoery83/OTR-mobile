import { z } from "zod";
import {
  CAPTURE_LIMITS,
  captureIdSchema,
  captureRevisionSchema,
  sha256Schema,
} from "./localCapture";

export const photoImportPinSchema = z.strictObject({
  accountId: captureIdSchema,
  batchId: z.uuid(),
  inputId: z.uuid(),
  ordinal: z.number().int().nonnegative(),
  captureId: captureIdSchema,
  captureRevision: captureRevisionSchema,
  payloadId: captureIdSchema,
  sha256: sha256Schema,
  byteCount: z.number().int().positive().max(CAPTURE_LIMITS.binaryBytes),
  mediaType: z.enum(["image/jpeg", "image/png"]),
});
export type PhotoImportPin = z.infer<typeof photoImportPinSchema>;
const relevanceSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("RELEVANT"),
    reason: z.literal("TRAVEL_TEXT_CLUE"),
  }),
  z.strictObject({
    status: z.literal("IRRELEVANT"),
    reason: z.literal("CONFIRMED_UNRELATED_CONTENT"),
  }),
  z.strictObject({
    status: z.literal("UNCERTAIN"),
    reason: z.enum(["OCR_UNAVAILABLE", "OCR_INSUFFICIENT", "NO_CLEAR_RELEVANCE"]),
  }),
]);
export type PhotoImportRelevance = z.infer<typeof relevanceSchema>;
const observationsSchema = z
  .array(
    z.object({
      text: z.string().min(1).max(262144),
      confidence: z.number().finite().min(0).max(1),
    }),
  )
  .max(4096);

// Hints only: no field extraction, Item kind, Source proof or paid-call authority.
export function screenPhotoImportRelevance(
  raw: unknown,
): Exclude<PhotoImportRelevance, { status: "IRRELEVANT" }> {
  const parsed = observationsSchema.safeParse(raw);
  if (!parsed.success) return { status: "UNCERTAIN", reason: "OCR_INSUFFICIENT" };
  const observations = parsed.data;
  let textBytes = Math.max(0, observations.length - 1);
  for (const observation of observations) {
    textBytes += new TextEncoder().encode(observation.text).length;
    if (textBytes > 262144) return { status: "UNCERTAIN", reason: "OCR_INSUFFICIENT" };
  }
  const text = observations.map((o) => o.text).join("\n");
  if (!text.trim()) return { status: "UNCERTAIN", reason: "OCR_INSUFFICIENT" };
  const readable = observations
    .filter((o) => o.confidence >= 0.8)
    .map((o) => o.text)
    .join("\n");
  const travel =
    /\b(?:boarding pass|flight|airport|hotel|check[ -]?in|check[ -]?out|car rental|rental car|train ticket|bus ticket|itinerary|booking|reservation|ticket|tour)\b|航班|机场|機場|酒店|入住|退房|租车|租車|车票|車票|搭乗|宿泊|予約/iu;
  if (travel.test(readable) || /\b[A-Z][A-Z0-9]\s?\d{2,4}\b/u.test(readable))
    return { status: "RELEVANT", reason: "TRAVEL_TEXT_CLUE" };
  if (
    observations.length < 3 ||
    text.trim().length < 80 ||
    observations.some((o) => o.confidence < 0.9)
  )
    return { status: "UNCERTAIN", reason: "OCR_INSUFFICIENT" };
  // OCR alone cannot rule out useful visual content; absence of clues is not irrelevance.
  return { status: "UNCERTAIN", reason: "NO_CLEAR_RELEVANCE" };
}

export const photoImportDecisionSchema = z.strictObject({
  version: z.literal(1),
  pin: photoImportPinSchema,
  relevance: relevanceSchema,
  choice: z.enum(["UNDECIDED", "CONTINUE_WITH_AI", "SKIP"]),
});
export type PhotoImportDecision = z.infer<typeof photoImportDecisionSchema>;

// Owning Capture must persist this value and compare current original pins before dispatch.
// This pure value is not a separate lifecycle, durable store or execution receipt.
export function resolvePhotoImportDecision(raw: unknown, currentPin: PhotoImportPin) {
  const decision = photoImportDecisionSchema.parse(raw);
  const pin = photoImportPinSchema.parse(currentPin);
  if (
    Object.keys(pin).some(
      (key) =>
        pin[key as keyof PhotoImportPin] !== decision.pin[key as keyof PhotoImportPin],
    )
  )
    throw new Error("PHOTO_IMPORT_ORIGINAL_CHANGED");
  if (decision.choice === "SKIP") return "KEEP_ORIGINAL" as const;
  if (decision.choice === "CONTINUE_WITH_AI" || decision.relevance.status === "RELEVANT")
    return "QUALIFY_ORIGINAL_IMAGE" as const;
  return decision.relevance.status === "IRRELEVANT"
    ? ("KEEP_ORIGINAL" as const)
    : ("WAIT_FOR_USER" as const);
}

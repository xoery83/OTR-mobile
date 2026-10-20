import { z } from "zod";
import { submissionId } from "@/domain/capture/captureSubmission";

export const updatesFilterSchema = z.strictObject({
  category: z.enum(["ALL", "NEEDS_ATTENTION", "ACTIVITY", "MESSAGES"]),
  unreadOnly: z.boolean(),
  query: z.string().max(200),
  currentTripId: submissionId.nullable(),
});
export type UpdatesFilter = z.infer<typeof updatesFilterSchema>;
const actionableFailureSchema = z.enum([
  "EMPTY_PAYLOAD",
  "PAYLOAD_TOO_LARGE",
  "INVALID_UTF8",
  "CONTENT_MISMATCH",
]);
export const captureFailureFactSchema = z.strictObject({
  inputId: submissionId,
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  failureCode: actionableFailureSchema,
});
export const captureFailureFactsSchema = z
  .array(captureFailureFactSchema)
  .min(1)
  .superRefine((facts, ctx) => {
    if (new Set(facts.map((f) => f.inputId)).size !== facts.length)
      ctx.addIssue({ code: "custom", message: "Duplicate failure identity" });
  });
export function isActionableIntakeFailure(
  code: string | null,
): code is z.infer<typeof actionableFailureSchema> {
  return (
    code === "EMPTY_PAYLOAD" ||
    code === "PAYLOAD_TOO_LARGE" ||
    code === "INVALID_UTF8" ||
    code === "CONTENT_MISMATCH"
  );
}
export type CaptureFailureFact = z.infer<typeof captureFailureFactSchema>;
export type CaptureUpdateCard = Readonly<{
  notificationId: string;
  materialVersion: number;
  jobId: string;
  batchId: string;
  source: "CAPTURE_INTAKE";
  scope: "ACCOUNT_PERSONAL";
  tripId: null;
  createdAt: string;
  clock: "DEVICE_WALL";
  unread: boolean;
  sourceState: "ACTION_REQUIRED" | "RECOVERED" | "INACTIVE" | "UNAVAILABLE";
  recoveryInputs: readonly CaptureFailureFact[];
  searchText: string;
}>;
export type UpdatesPresentationText = (
  state: CaptureUpdateCard["sourceState"],
  count: number,
) => string;
export function matchesUpdatesFilter(
  card: CaptureUpdateCard,
  raw: UpdatesFilter,
  presentationText?: UpdatesPresentationText,
) {
  const f = updatesFilterSchema.parse(raw);
  return (
    f.category !== "MESSAGES" &&
    (f.category !== "NEEDS_ATTENTION" || card.sourceState === "ACTION_REQUIRED") &&
    (!f.unreadOnly || card.unread) &&
    [
      card.searchText,
      presentationText?.(card.sourceState, card.recoveryInputs.length) ?? "",
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(f.query.trim().toLocaleLowerCase())
  );
}

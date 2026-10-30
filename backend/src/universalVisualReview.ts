import {
  compactSchema,
  expandCompact,
} from "../frozen-workbench/scripts/import-workbench/real-llm-compact";
import {
  reconcile,
  validate,
} from "../frozen-workbench/scripts/import-workbench/llm-first";
import type { prepareUniversalDispatch } from "./universalImport";

// Proposal adapter only. No OCR corroboration, lifecycle issuer or Save authority.
export function projectUniversalVisualReview(
  raw: unknown,
  dispatch: ReturnType<typeof prepareUniversalDispatch>,
) {
  const { ready, prepared, base } = dispatch;
  if (
    ready.length !== 1 ||
    ready[0].mime !== "image/png" ||
    ready[0].modality !== "IMAGE" ||
    ready[0].operations.length
  )
    return null;
  const parsed = compactSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.issues.length ||
    parsed.data.bookings.length ||
    parsed.data.tickets.length ||
    parsed.data.links.length
  )
    return null;
  const wire = parsed.data;
  if (new Set(wire.items.map((i) => i.id)).size !== wire.items.length) return null;
  const objects = wire.items.flatMap((item) => {
    if (
      item.kind !== "P1" ||
      item.subtype !== "ACTIVITY" ||
      new Set(item.f.map((f) => f[1])).size !== item.f.length ||
      !item.f.every((f) => f[0] === 0 && f.length === 4 && typeof f[3] === "object") ||
      !item.f.some((f) => f[1] === "activity.name") ||
      !item.f.some((f) => f[1] === "activity.date")
    )
      return [];
    const value = validate(expandCompact({ ...wire, items: [item] }, ready), prepared);
    return value.status === "ACCEPTED" ? value.value!.objects : [];
  });
  if (!objects.length) return null;
  const proposals = reconcile(
    {
      schema: "otr-workbench-llm-interpretation/1",
      objects,
      bookings: [],
      tickets: [],
      unresolved: [],
    },
    base.taskId,
  );
  const decisions = proposals.objects.map((o) => ({
    token: o.token,
    kind: o.kind,
    tier: "REVIEWABLE" as const,
    reasons: ["IMAGE_ORIGINAL_REVIEW_REQUIRED"],
    sourceIds: [ready[0].sourceId],
    fieldCount: o.fields.length,
  }));
  return {
    proposals,
    quality: {
      decisions,
      acceptedTokens: [] as string[],
      reviewableTokens: decisions.map((d) => d.token),
      abstainedTokens: [] as string[],
      formalQualification: "NOT_SCORABLE" as const,
    },
  };
}

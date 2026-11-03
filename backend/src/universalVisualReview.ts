import type { inspectCompactEvidence } from "../frozen-workbench/scripts/import-workbench/real-llm-evidence";
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
  inspection: ReturnType<typeof inspectCompactEvidence>,
) {
  const { ready, prepared, base } = dispatch;
  const imageIndex = ready.findIndex((r) => r.modality === "IMAGE");
  const image = ready[imageIndex];
  if (
    ready.filter((r) => r.modality === "IMAGE").length !== 1 ||
    !image ||
    image.mime !== "image/png" ||
    image.operations.length
  )
    return null;
  const parsed = compactSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.bookings.length ||
    parsed.data.tickets.length ||
    parsed.data.links.length
  )
    return null;
  const wire = parsed.data;
  // shortcut: isolate exact existing local vetoes only; broader reasons need an owning issue-scope contract.
  const localVetoes = new Set([
    "cancellation notice",
    "change pending",
    "trip idea only",
    "inspiration only",
    "no confirmed plan",
    "unbooked travel idea",
    "仅为旅行灵感",
    "尚无确认行程",
  ]);
  if (
    wire.issues.length &&
    (wire.items.some((item) => new Set(item.f.map((field) => field[0])).size !== 1) ||
      wire.issues.some(([index, reason]) => {
        const source = ready[index];
        return (
          !source ||
          source.modality !== "TEXT" ||
          !localVetoes.has(reason) ||
          !inspection.proposals?.objects.some(
            (item) =>
              item.fields.length > 0 &&
              item.fields.every((field) => field.sourceId === source.sourceId),
          )
        );
      }))
  )
    return null;
  if (new Set(wire.items.map((i) => i.id)).size !== wire.items.length) return null;
  const objects = wire.items.flatMap((item) => {
    if (
      item.kind !== "P1" ||
      item.subtype !== "ACTIVITY" ||
      new Set(item.f.map((f) => f[1])).size !== item.f.length ||
      !item.f.every(
        (f) => f[0] === imageIndex && f.length === 4 && typeof f[3] === "object",
      ) ||
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
    sourceIds: [image.sourceId],
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

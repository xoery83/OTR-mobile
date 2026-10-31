import {
  previewChangesInput,
  applyChangesInput,
  type MutationResult,
} from "./mutationContract";
import {
  contentDigest,
  mutationIdentity,
  type PreparedMutation,
  type createMutationTools,
  type ApprovalRequest,
  type ConfirmChanges,
} from "./mutation";
import type { createReadTools } from "./read";
export function createBatchTools(
  context: {
    accountId: string;
    clientId: string;
    resource: string;
    signal?: AbortSignal;
    confirm?: ConfirmChanges;
  },
  mutations: ReturnType<typeof createMutationTools>,
  reads: ReturnType<typeof createReadTools>,
) {
  async function preview(raw: unknown) {
    const q = previewChangesInput.parse(raw);
    const operations = q.changes.map(({ kind, ...c }) =>
      kind === "CREATE"
        ? mutations.prepareCreate({ ...c, trip_id: q.trip_id })
        : mutations.prepareUpdate({ ...c, trip_id: q.trip_id }),
    );
    const prepared: PreparedMutation[] = operations;
    const operationPreviews = await Promise.all(
      operations.map((p) => mutations.execute(p, "PREVIEW")),
    );
    const warnings: string[] = operationPreviews
      .filter((r) => r.error_code)
      .map((r) => `${r.error_code}:${r.operation_id}`);
    for (const c of q.changes)
      if (c.kind === "CREATE")
        warnings.push(`DATE_ONLY_NO_CLOCK_OR_BOOKING:${c.request_id}`);
    for (const c of q.changes) {
      if (c.kind === "UPDATE") {
        const result = await reads.get_trip_item({
          trip_id: q.trip_id,
          item_id: c.item_id,
        });
        if (result.item.itemRevision !== c.expected_revision)
          warnings.push(`STALE_REVISION:${c.item_id}`);
      }
    }
    let cursor: string | undefined;
    // Bounded complete duplicate scan. Never infer absence from an incomplete first page.
    for (let page = 0; page < 40; page++) {
      const found = await reads.list_trip_items({
        trip_id: q.trip_id,
        limit: 25,
        ...(cursor ? { cursor } : {}),
      });
      for (const item of found.items)
        for (const c of q.changes)
          if (
            c.kind === "CREATE" &&
            item.itemId !==
              mutationIdentity(context.accountId, operations[q.changes.indexOf(c)])
                .item_id &&
            item.family === c.item.family &&
            item.title.normalize("NFKC").trim().toLocaleLowerCase("en") ===
              c.item.title.normalize("NFKC").trim().toLocaleLowerCase("en")
          )
            warnings.push(`POSSIBLE_DUPLICATE:${c.request_id}:${item.itemId}`);
      if (!found.next_cursor) break;
      if (page === 39) throw Error("DUPLICATE_SCAN_INCOMPLETE");
      cursor = found.next_cursor;
    }
    if (new Set(warnings).size > 24) throw Error("PREVIEW_TOO_MANY_WARNINGS_REFINE_PLAN");
    const digest = contentDigest({
      accountId: context.accountId,
      clientId: context.clientId,
      resource: context.resource,
      operations: prepared,
      duplicateWarnings: [
        ...new Set(warnings.filter((w) => w.startsWith("POSSIBLE_DUPLICATE:"))),
      ].sort(),
    });
    return {
      prepared,
      output: {
        version: "otr.mcp.batch/1" as const,
        trip_id: q.trip_id,
        preview_digest: digest,
        outcome: "PREVIEW" as const,
        operations: operationPreviews,
        warnings: [...new Set(warnings)],
      },
    };
  }
  return {
    async preview_trip_changes(raw: unknown) {
      return (await preview(raw)).output;
    },
    async apply_trip_changes(raw: unknown) {
      const q = applyChangesInput.parse(raw),
        { preview_digest: expected, ...input } = q;
      const current = await preview(input);
      if (expected !== current.output.preview_digest)
        return {
          ...current.output,
          outcome: "REJECTED" as const,
          warnings: [...current.output.warnings, "PREVIEW_MISMATCH"],
        };
      // Recover the exact operation before CAS freshness: an accepted UPDATE advances its own revision.
      const approval: ApprovalRequest = {
        accountId: context.accountId,
        clientId: context.clientId,
        resource: context.resource,
        digest: expected,
        summary:
          current.output.operations.map((o) => o.summary).join("\n") +
          "\n" +
          current.output.warnings.join("\n"),
        operationIds: current.output.operations.map((o) => o.operation_id),
      };
      if (
        !context.confirm ||
        !(await context.confirm(approval, context.signal ?? new AbortController().signal))
      )
        return { ...current.output, outcome: "NEEDS_CONFIRMATION" as const };
      const results: MutationResult[] = [];
      let stopped = false;
      for (const p of current.prepared) {
        if (stopped) {
          results.push({
            ...mutationIdentity(context.accountId, p),
            outcome: "PREVIEW",
            error_code: "NOT_SUBMITTED_AFTER_STOP",
          });
          continue;
        }
        const r = await mutations.execute(
          p,
          "APPLY",
          mutationIdentity(context.accountId, p).preview_digest,
          true,
        );
        results.push(r);
        if (!["APPLIED", "NO_CHANGE"].includes(r.outcome)) stopped = true;
      }
      return {
        ...current.output,
        operations: results,
        outcome: results.every((r) => ["APPLIED", "NO_CHANGE"].includes(r.outcome))
          ? ("APPLIED" as const)
          : ("PARTIAL" as const),
      };
    },
  };
}

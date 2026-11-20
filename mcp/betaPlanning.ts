import { createHash } from "node:crypto";
import { validatePlan } from "../docs/mcp/beta-layer2/schema/validate";
import { responseSchemas } from "../docs/mcp/beta-layer2/schema/responses";
import { ledgerHistoryPageSchema } from "../backend/src/ledgerBetaRead";
import { ledgerOperationStatusSchema } from "../backend/src/ledgerOperationRead";

export function validateBetaPlan(
  plan: unknown,
  results: Record<string, unknown> = {},
  identities: Record<string, string> = {},
) {
  const original = {
    LedgerHistoryPage: responseSchemas.LedgerHistoryPage,
    LedgerOperationStatus: responseSchemas.LedgerOperationStatus,
  };
  // The frozen validator is synchronous; scope its two owning-schema deltas to this call.
  try {
    responseSchemas.LedgerHistoryPage = ledgerHistoryPageSchema;
    responseSchemas.LedgerOperationStatus = ledgerOperationStatusSchema;
    const result = validatePlan(plan, results, identities);
    const steps = (
      plan as {
        steps: {
          id: string;
          stage: string;
          confirmation: { boundStepIds: string[] } | null;
        }[];
      }
    ).steps;
    for (const step of steps.filter((s) => s.stage === "CONFIRM")) {
      const bound = step.confirmation?.boundStepIds;
      if (
        !bound?.length ||
        bound.some(
          (id) => id === step.id || steps.find((s) => s.id === id)?.stage !== "APPLY",
        )
      )
        throw Error("CONFIRM_MUST_BIND_DOWNSTREAM_APPLY");
    }
    return result;
  } finally {
    Object.assign(responseSchemas, original);
  }
}

export function resolveBetaPlanIdentities(plan: unknown, accountId: string) {
  validateBetaPlan(plan);
  const parsed = plan as { intentId: string };
  const identities: Record<string, string> = {};
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    if ("$identity" in value) {
      const ref = value.$identity as { stepId: string; kind: string };
      const key = `${parsed.intentId}:${ref.stepId}:${ref.kind}`;
      const hash = createHash("sha256")
        .update(JSON.stringify(["otr.mcp-beta.identity/1", accountId, key]))
        .digest("hex");
      identities[key] =
        `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    } else for (const child of Object.values(value)) visit(child);
  }
  visit(plan);
  return {
    namespace: "otr.mcp-beta.identity/1",
    accountId,
    intentId: parsed.intentId,
    identities,
    executed: false,
  };
}

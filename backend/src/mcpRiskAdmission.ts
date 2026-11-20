import { z } from "zod";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import type { ApprovalRequest } from "../../mcp/mutation";
const resultSchema = z.object({
  risk: z.enum(["L2_SENSITIVE_WRITE", "L3_HIGH_IMPACT_WRITE"]),
  reserved: z.boolean(),
});
export type RiskAdmission = (
  mode: "ASSESS" | "RESERVE" | "REGISTER_PLAN",
  approval: ApprovalRequest,
  call: unknown,
  signal: AbortSignal,
) => Promise<z.infer<typeof resultSchema>>;
export function createMcpRiskAdmission(connection: CorePgConnection, managed = false): RiskAdmission {
  const prefix = managed ? "mcp_managed" : "mcp";
  return async (mode, approval, call, signal) => {
    signal.throwIfAborted();
    const context = {
      accountId: approval.accountId,
      clientId: approval.clientId,
      resource: approval.resource,
      operationIds: approval.operationIds,
      digest: approval.digest,
      ...(approval.managedConsent ? { managedConsent: approval.managedConsent } : {}),
      call,
    };
    const result = await connection.withLease(async (lease) => {
      await lease.query("BEGIN");
      try {
        const response = await lease.query(
          mode === "REGISTER_PLAN"
            ? `SELECT public.${prefix}_risk_plan_fence($1::uuid,$2::jsonb) AS result`
            : `SELECT public.${prefix}_risk_admission($1::text,$2::uuid,$3::jsonb) AS result`,
          mode === "REGISTER_PLAN"
            ? [approval.accountId, JSON.stringify(context)]
            : [mode, approval.accountId, JSON.stringify(context)],
        );
        const checked = resultSchema.parse(response.rows[0]?.result);
        await lease.query("COMMIT");
        return checked;
      } catch (error) {
        await lease.query("ROLLBACK").catch(() => lease.retire());
        throw error;
      }
    });
    signal.throwIfAborted();
    return result;
  };
}

import { appendFileSync, statSync, existsSync, writeFileSync } from "node:fs";
import { z } from "zod";
export type BetaEvidence = {
  event: string;
  accountId: string;
  clientId: string;
  resource: string;
  capabilityId?: string;
  data: Record<string, unknown>;
};
const configSchema = z.strictObject({
  accountId: z.uuid(),
  clientId: z.uuid(),
  resource: z.url(),
  tripId: z.uuid(),
  operationId: z.uuid(),
  expiresAt: z.number().int().positive(),
  riskScope: z
    .strictObject({
      tripIds: z.array(z.uuid()).min(1).max(4),
      operationIds: z.array(z.uuid()).min(1).max(32),
    })
    .optional(),
});
// Task-private observation only; never an approval callback or business audit authority.
export function createBetaEvidenceRecorder(raw: unknown, file: string) {
  const config = configSchema.parse(raw);
  if (config.expiresAt <= Date.now() || config.expiresAt > Date.now() + 7200000)
    throw Error("CAPTURE_LIFETIME_REQUIRED");
  let failed = false;
  const matches = (event: BetaEvidence) => {
    if (
      event.accountId !== config.accountId ||
      event.clientId !== config.clientId ||
      event.resource !== config.resource
    )
      return false;
    const call = event.data.call as
      | {
          pathParams?: { tripId?: string; operationId?: string };
          request?: { tripId?: string };
        }
      | undefined;
    const scopedTrip = call?.pathParams?.tripId ?? call?.request?.tripId;
    const scopedOperation = call?.pathParams?.operationId;
    if (
      event.capabilityId &&
      !(config.riskScope
        ? (scopedTrip && config.riskScope.tripIds.includes(scopedTrip)) ||
          (scopedOperation && config.riskScope.operationIds.includes(scopedOperation))
        : event.capabilityId === "otr.metadata.operation.get"
          ? scopedOperation === config.operationId
          : ["otr.trip.get", "otr.trip.update"].includes(event.capabilityId) &&
            scopedTrip === config.tripId)
    )
      return false;
    return true;
  };
  const ready = (event: BetaEvidence) => {
    try {
      return (
        !failed &&
        Date.now() < config.expiresAt &&
        matches(event) &&
        !existsSync(file + ".error") &&
        (existsSync(file) ? statSync(file).size : 0) < 1048576 - 262144
      );
    } catch {
      return false;
    }
  };
  return Object.assign(
    (event: BetaEvidence) => {
      if (failed || Date.now() >= config.expiresAt || !matches(event)) return;
      if (
        ![
          "CLIENT_CAPABILITIES",
          "GUIDE_READ",
          "ACCOUNT_READ",
          "PLAN_VALIDATED",
          "PLAN_EXECUTION_BLOCKED",
          "RISK_ADMISSION_BLOCKED",
          "AUTH_GRANT_REJECTED",
          "TOOL_CALL",
          "PREVIEW",
          "RISK_WRITE_AUTHORIZED",
          "CONFIRM_REQUESTED",
          "CONFIRM_BOUND_ACCEPTED",
          "APPLY_DISPATCHED",
          "SERVER_RESPONSE",
        ].includes(event.event)
      )
        return;
      try {
        const line = JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n";
        if (
          Buffer.byteLength(line) > 131072 ||
          (existsSync(file) ? statSync(file).size : 0) + Buffer.byteLength(line) > 1048576
        )
          throw Error("CAPTURE_LIMIT");
        appendFileSync(file, line, { mode: 0o600 });
      } catch {
        failed = true;
        try {
          writeFileSync(file + ".error", "CAPTURE_LIMIT_OR_IO_ERROR\n", { mode: 0o600 });
        } catch {
          /* evidence is invalid, domain behavior is unchanged */
        }
      }
    },
    { ready },
  );
}

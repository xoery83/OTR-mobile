import { File, Paths } from "expo-file-system";
import { ApiClientError } from "../api/client";
import { createCoreV2Transport } from "../api/tripCoreV2Transport";
import { requireActiveUserId } from "../auth/authRepository";
import {
  assertAccountRequestContext,
  captureAccountScope,
  type AccountScope,
} from "../auth/accountRequestContext";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";

const accountId = "1f3d7935-1bdc-4952-8d7f-0f72077368c1";
const tripId = "a0bcf637-4d71-4d8b-ba17-a998d8917fe0";
const operationId = "5f7d0785-d519-44da-8852-342af47b806d";
const outcomes = ["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED"] as const;

// Temporary synthetic QA read: STARTED deliberately survives interruption without retry.
export async function runP3ReceiptQaProbe(account: AccountScope): Promise<void> {
  if (account.accountId !== accountId) throw Error("P3_PROBE_ACCOUNT_MISMATCH");
  await assertAccountRequestContext(account, requireActiveUserId);
  const current = await captureAccountScope(requireActiveUserId);
  if (
    current.accountId !== account.accountId ||
    current.generation !== account.generation
  )
    throw Error("P3_PROBE_ACCOUNT_MISMATCH");
  const file = new File(Paths.document, "p3-receipt-read-only-probe.json");
  if (file.exists) return;
  const started = Date.now();
  file.create({ overwrite: false });
  file.write(JSON.stringify({ synthetic: true, status: "STARTED" }));
  let result: Record<string, string | number | boolean | null>;
  try {
    await assertAccountRequestContext(account, requireActiveUserId);
    const receipt = await createCoreV2Transport(
      requireActiveUserId,
      tripCoreSha256Hex,
    ).receipt({ ...account, tripId }, operationId);
    const outcome =
      receipt?.projection === "FULL" ? receipt.receipt.outcome : receipt?.outcome;
    result = {
      synthetic: true,
      status: receipt === null ? "NOT_FOUND" : "FOUND",
      outcome: outcomes.find((value) => value === outcome) ?? null,
    };
  } catch (error) {
    const api = error instanceof ApiClientError ? error : null;
    result = {
      synthetic: true,
      status: "ERROR",
      httpStatus:
        api?.status &&
        [400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504].includes(api.status)
          ? api.status
          : null,
      code:
        api?.code === "CORE_CAPABILITY_CLOSED"
          ? "CORE_CAPABILITY_CLOSED"
          : "PROBE_FAILED",
      requestId:
        api?.requestId &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          api.requestId,
        )
          ? api.requestId
          : null,
    };
  }
  await assertAccountRequestContext(account, requireActiveUserId);
  file.write(JSON.stringify({ ...result, elapsedMs: Math.max(0, Date.now() - started) }));
}

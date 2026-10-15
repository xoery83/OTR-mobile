import { ApiClientError } from "../api/client";
import { ZodError } from "zod";
import { SupabaseDevAuthError } from "../auth/devSupabaseAuth";
import { RequestBoundaryError } from "../api/requestBoundary";
import { getAccountGeneration } from "../auth/accountGeneration";
import { assertAccountRequestGeneration } from "../auth/accountRequestContext";
import { captureCustodyBatchSchema } from "@/domain/capture/captureCustody";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { CaptureCustodyDevConfiguration } from "./captureCustodyDevConfig";
export type CaptureCustodyDevMode = "PUT_GET" | "GET_ONLY";
export function captureCustodyDevQualified(
  config: CaptureCustodyDevConfiguration | null,
  job: CaptureJobReadModel,
) {
  if (
    typeof __DEV__ === "undefined" ||
    !__DEV__ ||
    !config ||
    !Number.isFinite(Date.parse(config.expiresAt)) ||
    Date.now() >= Date.parse(config.expiresAt)
  )
    return false;
  const parsed = captureCustodyBatchSchema.safeParse(config.batch);
  if (!parsed.success) return false;
  const batch = parsed.data;
  return (
    job.batch.accountId === batch.inputs[0].accountId &&
    job.batch.batchId === batch.batchId &&
    job.batch.jobId === batch.jobId &&
    job.inputs.length === 2 &&
    batch.inputs.every((pin) =>
      job.inputs.some(
        (i) =>
          i.id === pin.inputId &&
          i.state === "ACCEPTED" &&
          i.revision === pin.inputRevision &&
          i.captureId === pin.captureId &&
          i.payloadId === pin.payloadId &&
          i.captureRevision === pin.captureRevision &&
          i.contentSha256 === pin.sha256 &&
          i.contentByteCount === pin.byteCount,
      ),
    )
  );
}
// In-memory execution guard only; no receipt store, queue or automatic call.
export function createCaptureCustodyDevAction(
  config: CaptureCustodyDevConfiguration,
  job: CaptureJobReadModel,
  isCurrent: () => boolean,
) {
  const generation = getAccountGeneration();
  const check = () => {
    if (Date.now() >= Date.parse(config.expiresAt))
      throw new Error("CAPTURE_CUSTODY_DEV_EXPIRED");
    if (!isCurrent()) throw new Error("CAPTURE_CUSTODY_DEV_RETIRED");
    if (!captureCustodyDevQualified(config, job))
      throw new Error("CAPTURE_CUSTODY_DEV_UNAVAILABLE");
    assertAccountRequestGeneration({
      accountId: config.batch.inputs[0].accountId,
      generation,
    });
  };
  return async (mode: CaptureCustodyDevMode) => {
    check();
    const api = await import("./defaultCaptureCustody");
    check();
    const receipt = await (mode === "GET_ONLY"
      ? api.verifyDefaultCaptureCustodyBatch(config.batch, check)
      : api.runDefaultCaptureCustodyBatch(config.batch, check));
    check();
    return receipt;
  };
}
export type CaptureCustodyDevFailure = Readonly<{
  stage:
    | "AUTH"
    | "NETWORK"
    | "HTTP"
    | "IDENTITY"
    | "HASH"
    | "LIFECYCLE"
    | "RESPONSE"
    | "UNKNOWN";
  code: string;
  status: number | null;
}>;
export function captureCustodyDevFailure(
  error: unknown,
): CaptureCustodyDevFailure {
  const result = (
    stage: CaptureCustodyDevFailure["stage"],
    code: string,
    status: number | null = null,
  ) => ({ stage, code, status });
  if (error instanceof ApiClientError) {
    const status =
      Number.isInteger(error.status) &&
      error.status! >= 100 &&
      error.status! <= 599
        ? error.status!
        : null;
    if (error.code === "AUTH_REFRESH_UNAVAILABLE") {
      const detail = error.details;
      if (detail instanceof ZodError)
        return result("AUTH", "AUTH_VALIDATION_FAILED");
      if (detail instanceof SupabaseDevAuthError) {
        const detailStatus =
          Number.isInteger(detail.status) &&
          detail.status! >= 100 &&
          detail.status! <= 599
            ? detail.status!
            : null;
        const kind = ["network", "temporary", "invalid_session"].includes(
          detail.kind,
        )
          ? detail.kind.toUpperCase()
          : "UNKNOWN";
        return result("AUTH", `AUTH_REFRESH_UNAVAILABLE_${kind}`, detailStatus);
      }
      return result("AUTH", "AUTH_REFRESH_UNAVAILABLE");
    }
    if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_CONTEXT_CHANGED")
      return result("AUTH", error.code, status);
    if (error.kind === "network" && error.code === "NATIVE_FETCH_FAILED")
      return result("NETWORK", "NATIVE_FETCH_FAILED", status);
    if (error.kind === "network" || error.kind === "timeout")
      return result(
        "NETWORK",
        error.kind === "timeout" ? "REQUEST_TIMEOUT" : "NETWORK_FAILURE",
        status,
      );
    return result(
      error.kind === "http" ? "HTTP" : "RESPONSE",
      error.kind === "http" ? "HTTP_REJECTED" : "RESPONSE_INVALID",
      status,
    );
  }
  if (error instanceof RequestBoundaryError)
    return result(
      error.code === "REQUEST_TIMEOUT" || error.code === "REQUEST_CANCELED"
        ? "NETWORK"
        : "RESPONSE",
      error.code,
    );
  const code = error instanceof Error ? error.message : "";
  if (code === "Account changed during Ledger request.")
    return result("IDENTITY", "ACCOUNT_CHANGED");
  if (
    [
      "CAPTURE_CUSTODY_INPUT_STALE",
      "CAPTURE_CUSTODY_SCOPE_INVALID",
      "CAPTURE_CUSTODY_INPUT_UNAVAILABLE",
    ].includes(code)
  )
    return result("IDENTITY", code);
  if (
    ["CAPTURE_CUSTODY_BYTES_INVALID", "CAPTURE_CUSTODY_MEDIA_INVALID"].includes(
      code,
    )
  )
    return result("HASH", code);
  if (
    [
      "CAPTURE_CUSTODY_DEV_UNAVAILABLE",
      "CAPTURE_CUSTODY_DEV_EXPIRED",
      "CAPTURE_CUSTODY_DEV_RETIRED",
    ].includes(code)
  )
    return result("LIFECYCLE", code);
  if (code === "CAPTURE_CUSTODY_NOT_FOUND") return result("HTTP", code, 404);
  if (code === "CAPTURE_CUSTODY_RESPONSE_INVALID")
    return result("RESPONSE", code);
  return result("UNKNOWN", "CAPTURE_CUSTODY_UNAVAILABLE");
}

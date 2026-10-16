import { createAuthenticatedApiClient } from "./authenticatedClient";
import type { ApiClientOptions } from "./client";
import type { sessionAccessToken } from "../auth/sessionAccessToken";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  captureCustodyBindingJson,
  captureCustodyBindingSchema,
} from "../../domain/capture/captureCustody";
import {
  assertCaptureRemoteResult,
  captureRemoteResultSchema,
  validateCaptureRemoteRequest,
  type CaptureRemoteRequest,
} from "../../domain/capture/captureRemoteProcessing";
import { z } from "zod";
export function createCaptureRemoteProcessingTransport(
  getAccountId: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: typeof sessionAccessToken,
) {
  async function scope(
    context: AccountRequestContext,
    binding: CaptureRemoteRequest["binding"],
  ) {
    captureCustodyBindingSchema.parse(binding);
    await assertAccountRequestContext(context, getAccountId);
    if (context.tripId !== "" || context.accountId !== binding.accountId)
      throw new Error("CAPTURE_REMOTE_SCOPE");
  }
  function path(binding: CaptureRemoteRequest["binding"], taskId: string) {
    return `/v2/capture-jobs/${binding.jobId}/inputs/${binding.inputId}/processing/${z.uuid().parse(taskId)}`;
  }
  const client = (context: AccountRequestContext) =>
    createAuthenticatedApiClient(
      { ...options, timeoutMs: 35000, maxResponseBytes: 1048576 },
      tokenProvider,
      context,
    );
  return {
    async run(context: AccountRequestContext, raw: CaptureRemoteRequest) {
      const request = validateCaptureRemoteRequest(raw);
      await scope(context, request.binding);
      const result = await client(context).post(
        path(request.binding, request.task.task_id),
        request,
        captureRemoteResultSchema,
        { "X-OTR-Capture-Binding": captureCustodyBindingJson(request.binding) },
      );
      await scope(context, request.binding);
      return assertCaptureRemoteResult(
        result,
        request.binding,
        request.task.task_id,
        request.task.logical_request_id,
      );
    },
    async read(
      context: AccountRequestContext,
      binding: CaptureRemoteRequest["binding"],
      taskId: string,
    ) {
      await scope(context, binding);
      const result = await client(context).get(
        path(binding, taskId),
        captureRemoteResultSchema,
        { "X-OTR-Capture-Binding": captureCustodyBindingJson(binding) },
      );
      await scope(context, binding);
      return assertCaptureRemoteResult(result, binding, taskId);
    },
  };
}
export type CaptureRemoteProcessingTransport = ReturnType<
  typeof createCaptureRemoteProcessingTransport
>;

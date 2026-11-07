import { createHash } from "node:crypto";
import { z } from "zod";
import { DEEPSEEK_FLIGHT_DESTINATION } from "../deepSeekFlight";
import {
  DEEPSEEK_FLIGHT_SEARCH_DESTINATION,
  type createFlightHttpsSend,
} from "../flightHttpsTransport";
import { observationSchema } from "./contracts";
import { enrichmentPriceSchema, measureFlightEnrichmentResponse } from "./metering";
import { ProviderStepFailure, type TrustedContext } from "./ports";
import type { HostRun } from "./provider";
import { registeredFlightEnrichmentProfile as profile } from "./registeredProfile";

type Call = Parameters<HostRun>[0];
export type EnrichmentStepAdmission = {
  callId: string;
  receiptId: string;
  accountId: string;
  actorId: string;
  tripId: string;
  stepId: string;
  requestSha256: string;
  prices: z.input<typeof enrichmentPriceSchema>;
  credential: string;
  assertCurrent(): Promise<void>;
  // Durable CAS permission, never a boolean derived from a local flag or cache result.
  markDispatch(): Promise<void>;
  retainResponse(
    bytes: Uint8Array,
    httpStatus: number,
    responseSha256: string,
  ): Promise<void>;
};

// Owning admission/custody is mandatory; this factory cannot provision or enable it.
export function createFlightEnrichmentHostRun(deps: {
  reserve(
    call: Call,
    context: TrustedContext,
    requestSha256: string,
  ): Promise<EnrichmentStepAdmission>;
  send: ReturnType<typeof createFlightHttpsSend>;
}): HostRun {
  return async (input, context) => {
    const call = {
      ...input,
      profile: { ...input.profile },
      step: {
        ...input.step,
        request: structuredClone(input.step.request),
        ...(input.step.evidence
          ? { evidence: structuredClone(input.step.evidence) }
          : {}),
      },
    };
    const requestSha256 = createHash("sha256").update(call.body).digest("hex");
    let admission: EnrichmentStepAdmission | null = null;
    let dispatchPossible = false;
    let measured:
      ReturnType<typeof measureFlightEnrichmentResponse>["observation"] | null = null;
    const observation = () =>
      measured ??
      observationSchema.parse({
        providerId: "deepseek",
        modelId: call.step.kind === "EXTRACTION" ? "deepseek-flash" : null,
        providerRequestId: null,
        input_tokens: dispatchPossible ? null : 0,
        output_tokens: dispatchPossible ? null : 0,
        cached_input_tokens: dispatchPossible ? null : 0,
        total_tokens: dispatchPossible ? null : 0,
        usage_quality: dispatchPossible ? "UNKNOWN" : "ACTUAL_REPORTED",
        cost_nanos: dispatchPossible ? null : "0",
        cost_quality: dispatchPossible ? "UNKNOWN" : "ACTUAL",
        billing_status: dispatchPossible ? "UNKNOWN" : "NOT_BILLED",
        execution: dispatchPossible ? "MAY_HAVE_STARTED" : "NOT_STARTED",
      });
    try {
      const expectedUrl =
        call.step.kind === "SEARCH"
          ? DEEPSEEK_FLIGHT_SEARCH_DESTINATION
          : DEEPSEEK_FLIGHT_DESTINATION;
      if (
        call.url !== expectedUrl ||
        call.method !== "POST" ||
        call.max_response_bytes !== 131072 ||
        call.profile.consumer !== "flight-enrichment" ||
        call.profile.execution_scope !== "FLIGHT_ENRICHMENT_V1" ||
        Buffer.byteLength(call.body) > profile.max_request_bytes ||
        !context.tripId
      )
        throw new ProviderStepFailure("POLICY_CLOSED", observation());
      call.signal.throwIfAborted();
      await context.assertCurrent();
      admission = await deps.reserve(call, context, requestSha256);
      if (
        !z.uuid().safeParse(admission.callId).success ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(admission.receiptId) ||
        admission.accountId !== context.accountId ||
        admission.actorId !== context.actorId ||
        admission.tripId !== context.tripId ||
        admission.stepId !== call.step.stepId ||
        admission.requestSha256 !== requestSha256 ||
        !/^[\x21-\x7e]{1,4096}$/.test(admission.credential)
      )
        throw new ProviderStepFailure("POLICY_CLOSED", observation());
      const prices = enrichmentPriceSchema.parse(admission.prices);
      if (
        prices.acceptedReturnedModels.some(
          (model) => !profile.accepted_returned_models.includes(model),
        )
      )
        throw new ProviderStepFailure("POLICY_CLOSED", observation());
      await admission.assertCurrent();
      await context.assertCurrent();
      call.signal.throwIfAborted();
      // A lost mark acknowledgement must remain uncertain; never resend on this path.
      dispatchPossible = true;
      await admission.markDispatch();
      await admission.assertCurrent();
      await context.assertCurrent();
      call.signal.throwIfAborted();
      if (call.step.kind === "EXTRACTION" && prices.inputNanosPerMillion === null)
        console.info(JSON.stringify({
          event: "ai_provider_cost_guard_disabled",
          internalBudgetControl: "OFF",
          providerChargesMayApply: true,
          callId: admission.callId,
          requestSha256,
        }));
      const result = await deps.send({
        url: expectedUrl,
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${admission.credential}`,
          "Content-Type": "application/json",
        },
        body: call.body,
        signal: call.signal,
        max_response_bytes: 131072,
      });
      if (
        result.redirected ||
        !Number.isInteger(result.status) ||
        result.status < 100 ||
        result.status > 599
      )
        throw Error("ENRICHMENT_RESPONSE_REJECTED");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of result.body) {
        size += chunk.byteLength;
        if (size > 131072) throw new ProviderStepFailure("RESPONSE_BOUND", observation());
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const measurement = measureFlightEnrichmentResponse(
        call.step.kind,
        body,
        result.status,
        prices,
      );
      measured = measurement.observation;
      await admission.retainResponse(
        body,
        result.status,
        createHash("sha256").update(body).digest("hex"),
      );
      if (
        result.status === 200 &&
        call.step.kind === "EXTRACTION" &&
        !measurement.modelAccepted
      )
        throw new ProviderStepFailure("MALFORMED_OUTPUT", measured);
      return {
        body,
        observation: measured,
        receiptId: admission.receiptId,
        httpStatus: result.status,
      };
    } catch (error) {
      if (error instanceof ProviderStepFailure) throw error;
      throw new ProviderStepFailure(
        call.signal.aborted ? "CANCELED" : dispatchPossible ? "UNKNOWN" : "POLICY_CLOSED",
        observation(),
      );
    }
  };
}

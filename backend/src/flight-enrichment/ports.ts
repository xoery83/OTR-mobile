import type {
  FlightEnrichmentRequest,
  FlightEnrichmentResponse,
  ProviderObservation,
  RawResult,
  UsageSummary,
} from "./contracts";
export type TrustedContext = Readonly<{
  accountId: string;
  actorId: string;
  tripId: string | null;
  authFence: string;
  assertCurrent(): Promise<void>;
}>;
export type Step = "SEARCH" | "EXTRACTION";
export type BudgetPlan = Readonly<{
  currency: "USD";
  targetNanos: string;
  searchEstimateNanos: string;
  extractionEstimateNanos: string;
  maxSearchCalls: 1;
  maxLlmCalls: 1;
}>;
export const DEFAULT_PLAN: BudgetPlan = Object.freeze({
  currency: "USD",
  targetNanos: "10000000",
  searchEstimateNanos: "750000",
  extractionEstimateNanos: "9000000",
  maxSearchCalls: 1,
  maxLlmCalls: 1,
});
export type StepInput = {
  kind: Step;
  stepId: string;
  receiptId: string;
  signal: AbortSignal;
  maxResponseBytes: 131072;
  maxRequestBytes: 24000;
  request: FlightEnrichmentRequest;
  evidence?: RawResult["evidence"];
};
export type StepResult = {
  body: Uint8Array;
  observation: ProviderObservation;
  receiptId: string;
  httpStatus: number;
};
export interface FlightLookupProvider {
  readonly providerId: string;
  readonly modelId: string;
  execute(input: StepInput, context: TrustedContext): Promise<StepResult>;
}
export type UsageIdentity = {
  feature: "FLIGHT_ENRICHMENT";
  accountId: string;
  actorId: string;
  tripId: string | null;
  requestId: string;
  idempotencyKey: string;
  requestDigest: string;
};
export interface UsagePort {
  admit(
    identity: UsageIdentity,
    plan: BudgetPlan & { estimatedNanos: string; cacheHit: boolean },
    signal: AbortSignal,
  ): Promise<{ allowed: boolean; receiptId: string }>;
  observeStep(
    event: UsageIdentity & {
      usageReceiptId: string;
      stepId: string;
      kind: Step;
      stepReceiptId: string;
      observation: ProviderObservation;
      late: boolean;
    },
  ): Promise<void>;
  finish(
    event: UsageIdentity & {
      usage: UsageSummary;
      status: FlightEnrichmentResponse["status"];
      summaryOnly: true;
    },
  ): Promise<void>;
}
export interface EntitlementPort {
  // Same future Account AI pool as Import. No prices, numeric credits or debit are defined here.
  check(
    identity: UsageIdentity,
    signal: AbortSignal,
  ): Promise<"POLICY_UNFROZEN" | "ALLOWED" | "DENIED">;
}
export interface IdempotencyPort {
  // Host must claim durably before action, retain UNKNOWN/failed results, and reject changed digests.
  execute(
    scope: { accountId: string; actorId: string; key: string; digest: string },
    action: () => Promise<FlightEnrichmentResponse>,
  ): Promise<FlightEnrichmentResponse>;
}
export type InstanceIdentity = {
  instanceId: string;
  flightNumber: string;
  departureLocalDate: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTimezone: string;
  departureInstant: string;
  uniqueDesignatorOnDate: boolean;
};
export type CacheGrant = {
  licenseReference: string;
  licenseUntil: string;
  maxRetentionMs: number;
  identity: InstanceIdentity;
};
export type CacheEntry = {
  version: "otr-flight-enrichment/1";
  providerId: string;
  modelId: string;
  observedAt: string;
  expiresAt: string;
  grant: CacheGrant;
  result: RawResult;
};
export interface CachePort {
  lookup(
    query: Pick<
      FlightEnrichmentRequest,
      "flightNumber" | "departureLocalDate" | "knownFields"
    >,
    signal: AbortSignal,
  ): Promise<readonly CacheEntry[]>;
  put(entry: CacheEntry, signal: AbortSignal): Promise<void>;
}
export type CacheWriteAuthorization = (
  query: FlightEnrichmentRequest,
  result: RawResult,
  signal: AbortSignal,
) => Promise<CacheGrant | null>;
export type ProviderFailureReason = NonNullable<
  FlightEnrichmentResponse["failureReason"]
>;
export class ProviderStepFailure extends Error {
  readonly reason: ProviderFailureReason;
  readonly observation: ProviderObservation | null;
  constructor(
    reason: ProviderFailureReason,
    observation: ProviderObservation | null = null,
  ) {
    super(reason);
    this.reason = reason;
    this.observation = observation;
  }
}

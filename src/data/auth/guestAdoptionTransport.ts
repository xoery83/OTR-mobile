import { z } from "zod";
import { createApiClient, type ApiClientOptions } from "@/data/api/client";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import {
  guestAdoptionPreflightRequestSchema,
  guestAdoptionPreflightGrantSchema,
  type GuestAdoptionPreflightRequest,
} from "@/domain/auth/guestAdoptionPreflight";
import {
  guestAdoptionStatusRequestSchema,
  guestAdoptionStatusResultSchema,
  type GuestAdoptionStatusRequest,
} from "@/domain/auth/guestAdoptionStatus";
import {
  guestAdoptionReceiptSchema,
  guestAdoptionReceiptRequestSchema,
  validateGuestAdoptionReceipt,
  validateGuestAdoptionCancellationReceipt,
  type GuestAdoptionReceiptRequest,
} from "@/domain/auth/guestAdoptionReceipt";
import { tripCoreSha256Hex } from "@/data/repositories/tripCoreSha256";
import {
  guestAdoptionTargetConfirmationHeader,
  guestAdoptionStageRequestSchema,
  guestAdoptionStageResultSchema,
  guestAdoptionPublicationRequestSchema,
} from "@/data/api/guestAdoptionContracts";
import { createAccountProfileRepository } from "./accountProfileRepository";
import { createTripDiscoveryTransport } from "@/data/sync/tripDiscoveryTransport";
import { createCoreV2Transport } from "@/data/api/tripCoreV2Transport";
import { guestAdoptionPreparationSchema } from "./guestAdoptionPreparation";
import type { AccountRequestContext } from "./accountRequestContext";
import type { LocalSession } from "@/domain/auth/localSession";
import { guestVerificationSession, readCommittedLocalPrincipal } from "./authRepository";
import { refreshSupabaseDevSession } from "./devSupabaseAuth";
import { assertAccountRequestGeneration } from "./accountRequestContext";

type Verification = typeof guestVerificationSession;
const refreshing = new WeakMap<Verification, Map<string, Promise<string>>>();
const scopeSchema = z.strictObject({
  kind: z.literal("GUEST"),
  localId: coreUuid,
  generation: z.number().int().nonnegative().safe(),
});
const bindingSchema = guestAdoptionPreflightRequestSchema.pick({
  adoptionId: true,
  sourceGuestLocalId: true,
  targetAccountId: true,
});

// Original Guest + provisional verified Account only. No method installs launch Session
// or releases Guest data; publication and owning reads retain their normal server checks.
export function createGuestAdoptionTransport(
  inputScope: z.input<typeof scopeSchema>,
  inputBinding: z.input<typeof bindingSchema>,
  options: Omit<
    ApiClientOptions,
    "accessToken" | "accessTokenProvider" | "assertRequestCurrent"
  > = {},
  dependencies: {
    verification?: Verification;
    readPrincipal?: typeof readCommittedLocalPrincipal;
    refresh?: (session: LocalSession) => Promise<LocalSession>;
  } = {},
) {
  const scope = Object.freeze(scopeSchema.parse(inputScope)),
    binding = Object.freeze(bindingSchema.parse(inputBinding));
  if (scope.localId !== binding.sourceGuestLocalId)
    throw Error("GUEST_ADOPTION_SCOPE_MISMATCH");
  const verification = dependencies.verification ?? guestVerificationSession;
  const readPrincipal = dependencies.readPrincipal ?? readCommittedLocalPrincipal;
  const assertGeneration = () =>
    assertAccountRequestGeneration({
      accountId: scope.localId,
      generation: scope.generation,
    });
  async function assertGuest() {
    assertGeneration();
    const principal = await readPrincipal();
    if (principal?.kind !== "GUEST" || principal.localId !== scope.localId)
      throw Error("GUEST_ADOPTION_SCOPE_MISMATCH");
    assertGeneration();
  }
  async function stored() {
    await assertGuest();
    const state = await verification.read(binding);
    await assertGuest();
    if (
      state.status !== "SESSION" ||
      !state.session.accessToken ||
      !state.session.refreshToken
    )
      throw Error("GUEST_ADOPTION_VERIFICATION_REQUIRED");
    return {
      ...state.session,
      accessToken: state.session.accessToken,
      refreshToken: state.session.refreshToken,
    };
  }
  const refresh =
    dependencies.refresh ??
    (async (session: LocalSession) => {
      if (!session.refreshToken) throw Error("GUEST_ADOPTION_VERIFICATION_REQUIRED");
      return refreshSupabaseDevSession(
        session.refreshToken,
        {
          persistSession: async () => undefined,
          signal: options.signal,
        },
        session.identity,
      );
    });
  async function token(forceRefresh: boolean, rejectedToken?: string) {
    const session = await stored();
    if (!forceRefresh || session.accessToken !== rejectedToken)
      return session.accessToken;
    let pending = refreshing.get(verification);
    if (!pending) {
      pending = new Map();
      refreshing.set(verification, pending);
    }
    const key = `${binding.sourceGuestLocalId}:${binding.adoptionId}:${binding.targetAccountId}:${scope.generation}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const work = (async () => {
      const updated = await refresh(session);
      await assertGuest();
      await verification.store(binding, updated, session.refreshToken ?? undefined);
      return (await stored()).accessToken;
    })();
    pending.set(key, work);
    try {
      return await work;
    } finally {
      if (pending.get(key) === work) pending.delete(key);
    }
  }
  const wire = options.fetchImplementation ?? fetch;
  const clientFor = (maxResponseBytes: number) =>
    createApiClient({
      ...options,
      maxResponseBytes,
      assertRequestCurrent: assertGeneration,
      accessTokenProvider: token,
      fetchImplementation: async (input, init) => {
        await assertGuest();
        assertGeneration();
        return wire(input, init);
      },
    });
  const client = clientFor(8192);
  const receiptClient = clientFor(1048576);
  function assertBinding(input: z.infer<typeof bindingSchema>) {
    if (
      input.adoptionId !== binding.adoptionId ||
      input.sourceGuestLocalId !== binding.sourceGuestLocalId ||
      input.targetAccountId !== binding.targetAccountId
    )
      throw Error("GUEST_ADOPTION_BINDING_MISMATCH");
  }
  const targetScope = Object.freeze({
    accountId: binding.targetAccountId,
    generation: scope.generation,
  });
  const targetAccount = async () => {
    assertGeneration();
    if (options.signal?.aborted) throw Error("REQUEST_CANCELED");
    const state = await verification.readForLocalCache(binding, scope.generation);
    assertGeneration();
    if (state.status !== "SESSION") throw Error("GUEST_ADOPTION_VERIFICATION_REQUIRED");
    return binding.targetAccountId;
  };
  const targetToken = async (
    request: {
      expectedUserId?: string;
      forceRefresh?: boolean;
      rejectedToken?: string;
    } = {},
  ) => {
    if (request.expectedUserId && request.expectedUserId !== binding.targetAccountId)
      throw Error("GUEST_ADOPTION_TARGET_MISMATCH");
    return {
      userId: binding.targetAccountId,
      token: await token(request.forceRefresh ?? false, request.rejectedToken),
    };
  };
  const owningOptions = {
    ...options,
    fetchImplementation: async (input: RequestInfo | URL, init?: RequestInit) => {
      await assertGuest();
      return wire(input, init);
    },
  };
  const profile = createAccountProfileRepository(
    targetAccount,
    owningOptions,
    targetToken,
  );
  const discovery = createTripDiscoveryTransport(
    targetAccount,
    owningOptions,
    targetToken,
  );
  const core = createCoreV2Transport(
    targetAccount,
    tripCoreSha256Hex,
    owningOptions,
    targetToken,
  );
  const canonical = (value: unknown) => canonicalCoreJson(value as Json);
  return {
    targetReads: {
      scope: targetScope,
      account: targetAccount,
      async ensureProfile() {
        const result = await profile.ensure(targetScope);
        await assertGuest();
        return result;
      },
      discovery,
      core: {
        async collection(context: AccountRequestContext) {
          if (
            context.accountId !== targetScope.accountId ||
            context.generation !== targetScope.generation
          )
            throw Error("GUEST_ADOPTION_TARGET_MISMATCH");
          const result = await core.collection(context, 1);
          await assertGuest();
          return result;
        },
      },
    },
    async preflight(
      raw: GuestAdoptionPreflightRequest,
      confirmedTargetAccountId: string,
    ) {
      if (confirmedTargetAccountId !== binding.targetAccountId)
        throw Error("GUEST_ADOPTION_TARGET_CONFIRMATION_REQUIRED");
      const request = guestAdoptionPreflightRequestSchema.parse(raw);
      assertBinding(request);
      await assertGuest();
      const result = await client.post(
        "/v1/auth/guest-adoptions/preflight",
        request,
        guestAdoptionPreflightGrantSchema,
        {
          "Idempotency-Key": binding.adoptionId,
          [guestAdoptionTargetConfirmationHeader]: confirmedTargetAccountId,
        },
      );
      await assertGuest();
      assertBinding(result);
      if (
        result.inventorySha256 !== request.inventorySha256 ||
        canonical(result.resources) !== canonical(request.resources) ||
        Date.parse(result.expiresAt) <= Date.now()
      )
        throw Error("GUEST_ADOPTION_RESPONSE_MISMATCH");
      return result;
    },
    async stage(raw: z.input<typeof guestAdoptionStageRequestSchema>) {
      const request = guestAdoptionStageRequestSchema.parse(raw);
      assertBinding(request.grant);
      const preparation = guestAdoptionPreparationSchema.parse(
        JSON.parse(request.preparation.canonicalText),
      );
      assertBinding(preparation);
      if (
        preparation.inventorySha256 !== request.grant.inventorySha256 ||
        canonical(preparation) !== request.preparation.canonicalText ||
        (await tripCoreSha256Hex(
          new TextEncoder().encode(request.preparation.canonicalText),
        )) !== request.preparation.sha256 ||
        new TextEncoder().encode(request.preparation.canonicalText).byteLength !==
          request.preparation.bytes
      )
        throw Error("GUEST_ADOPTION_PREPARATION_CORRUPT");
      await assertGuest();
      const result = await client.post(
        "/v1/auth/guest-adoptions/stage",
        request,
        guestAdoptionStageResultSchema,
        { "Idempotency-Key": binding.adoptionId },
      );
      await assertGuest();
      assertBinding(result);
      if (
        result.inventorySha256 !== request.grant.inventorySha256 ||
        result.grantId !== request.grant.grantId ||
        result.preparationSha256 !== request.preparation.sha256
      )
        throw Error("GUEST_ADOPTION_RESPONSE_MISMATCH");
      return result;
    },
    async publish(raw: z.input<typeof guestAdoptionPublicationRequestSchema>) {
      const request = guestAdoptionPublicationRequestSchema.parse(raw);
      assertBinding(request);
      await assertGuest();
      const result = await receiptClient.post(
        "/v1/auth/guest-adoptions/publish",
        request,
        guestAdoptionReceiptSchema,
        { "Idempotency-Key": binding.adoptionId },
      );
      await assertGuest();
      const { planSha256, ...expected } = request;
      const receipt = await validateGuestAdoptionReceipt(
        result,
        expected,
        tripCoreSha256Hex,
      );
      await assertGuest();
      if (receipt.outcome !== "PUBLISHED" || receipt.planSha256 !== planSha256)
        throw Error("GUEST_ADOPTION_RESPONSE_MISMATCH");
      return receipt;
    },
    async cancel(raw: GuestAdoptionStatusRequest) {
      const request = guestAdoptionStatusRequestSchema.parse(raw);
      assertBinding(request);
      await assertGuest();
      const result = await receiptClient.post(
        "/v1/auth/guest-adoptions/cancel",
        request,
        guestAdoptionReceiptSchema,
        { "Idempotency-Key": binding.adoptionId },
      );
      await assertGuest();
      const verified = await validateGuestAdoptionCancellationReceipt(
        result,
        request,
        tripCoreSha256Hex,
      );
      await assertGuest();
      return verified;
    },
    async receipt(raw: GuestAdoptionReceiptRequest) {
      const request = guestAdoptionReceiptRequestSchema.parse(raw);
      assertBinding(request);
      await assertGuest();
      const result = await receiptClient.post(
        "/v1/auth/guest-adoptions/receipt",
        request,
        guestAdoptionReceiptSchema,
      );
      await assertGuest();
      const { receiptId, receiptSha256, ...expected } = request;
      const verified = await validateGuestAdoptionReceipt(
        result,
        expected,
        tripCoreSha256Hex,
      );
      await assertGuest();
      if (verified.receiptId !== receiptId || verified.receiptSha256 !== receiptSha256)
        throw Error("GUEST_ADOPTION_RESPONSE_MISMATCH");
      return verified;
    },
    async status(raw: GuestAdoptionStatusRequest) {
      const request = guestAdoptionStatusRequestSchema.parse(raw);
      assertBinding(request);
      await assertGuest();
      const result = await client.post(
        "/v1/auth/guest-adoptions/status",
        request,
        guestAdoptionStatusResultSchema,
      );
      await assertGuest();
      assertBinding(result);
      if (result.inventorySha256 !== request.inventorySha256)
        throw Error("GUEST_ADOPTION_RESPONSE_MISMATCH");
      return result;
    },
  };
}

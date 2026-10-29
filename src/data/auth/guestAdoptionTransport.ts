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

// Metadata requests only. A grant/status response cannot activate Session or publish data.
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
  const client = createApiClient({
    ...options,
    maxResponseBytes: 8192,
    assertRequestCurrent: assertGeneration,
    accessTokenProvider: token,
    fetchImplementation: async (input, init) => {
      await assertGuest();
      assertGeneration();
      return wire(input, init);
    },
  });
  function assertBinding(input: z.infer<typeof bindingSchema>) {
    if (
      input.adoptionId !== binding.adoptionId ||
      input.sourceGuestLocalId !== binding.sourceGuestLocalId ||
      input.targetAccountId !== binding.targetAccountId
    )
      throw Error("GUEST_ADOPTION_BINDING_MISMATCH");
  }
  const canonical = (value: unknown) => canonicalCoreJson(value as Json);
  return {
    async preflight(raw: GuestAdoptionPreflightRequest) {
      const request = guestAdoptionPreflightRequestSchema.parse(raw);
      assertBinding(request);
      await assertGuest();
      const result = await client.post(
        "/v1/auth/guest-adoptions/preflight",
        request,
        guestAdoptionPreflightGrantSchema,
        { "Idempotency-Key": binding.adoptionId },
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

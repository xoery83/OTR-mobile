import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { identityFromAccessToken, type LocalSession } from "@/domain/auth/localSession";
import type { SecureSessionStorage } from "./authSessionRepository";
import { withAccountApplyGate } from "./accountRequestContext";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import { getAccountGeneration } from "./accountGeneration";

const bindingSchema = z.strictObject({
  sourceGuestLocalId: coreUuid,
  adoptionId: coreUuid,
  targetAccountId: coreUuid,
});
export type GuestVerificationBinding = z.infer<typeof bindingSchema>;
const recordSchema = bindingSchema.extend({
  version: z.literal(1),
  phase: z.enum(["PERSISTING", "READY"]),
  credentialSha256: z.string().regex(/^[0-9a-f]{64}$/),
  previousCredentialSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
});
const sessionSchema = z.strictObject({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.iso.datetime({ offset: true }),
  identity: z.strictObject({
    userId: coreUuid,
    displayName: z.string(),
    email: z.string().nullable(),
  }),
});
const metadataKey = (guestId: string) => `otr.mobile.guest-verification.v1.${guestId}`;

// Credentials use the existing per-Account secure slot; this never installs a launch Account.
export function createGuestVerificationSession(deps: {
  storage: SecureSessionStorage;
  accountSessionKey(accountId: string): string;
  assertGuest(localId: string): Promise<void>;
}) {
  function validateSession(input: unknown, targetAccountId: string) {
    let session: z.infer<typeof sessionSchema>;
    try {
      session = sessionSchema.parse(input);
    } catch {
      // Validation diagnostics must never contain Provider credentials.
      throw Error("GUEST_VERIFICATION_SESSION_INVALID");
    }
    if (
      session.identity.userId !== targetAccountId ||
      identityFromAccessToken(session.accessToken)?.userId !== targetAccountId
    )
      throw Error("GUEST_VERIFICATION_IDENTITY_MISMATCH");
    return session;
  }
  function parseRecord(raw: string, binding: GuestVerificationBinding) {
    let record: z.infer<typeof recordSchema>;
    try {
      record = recordSchema.parse(JSON.parse(raw));
    } catch {
      throw Error("GUEST_VERIFICATION_METADATA_INVALID");
    }
    if (
      record.sourceGuestLocalId !== binding.sourceGuestLocalId ||
      record.adoptionId !== binding.adoptionId ||
      record.targetAccountId !== binding.targetAccountId
    )
      throw Error("GUEST_VERIFICATION_BINDING_MISMATCH");
    return record;
  }
  const fingerprint = (session: LocalSession) =>
    tripCoreSha256Hex(
      new TextEncoder().encode(canonicalCoreJson(session as unknown as Json)),
    );
  async function assertCredential(
    record: z.infer<typeof recordSchema>,
    session: LocalSession,
  ) {
    const sha = await fingerprint(session);
    if (
      sha !== record.credentialSha256 &&
      !(record.phase === "PERSISTING" && sha === record.previousCredentialSha256)
    )
      throw Error("GUEST_VERIFICATION_CREDENTIAL_MISMATCH");
    return sha;
  }
  async function pinned<T>(
    input: GuestVerificationBinding,
    work: (binding: GuestVerificationBinding, check: () => Promise<void>) => Promise<T>,
  ) {
    const binding = Object.freeze(bindingSchema.parse(input));
    const generation = getAccountGeneration();
    try {
      return await withAccountApplyGate(async () => {
        const check = async () => {
          if (generation !== getAccountGeneration())
            throw Error("GUEST_VERIFICATION_STALE");
          await deps.assertGuest(binding.sourceGuestLocalId);
          if (generation !== getAccountGeneration())
            throw Error("GUEST_VERIFICATION_STALE");
        };
        await check();
        const result = await work(binding, check);
        await check();
        return result;
      });
    } catch (error) {
      const safe = new Set([
        "GUEST_VERIFICATION_STALE",
        "GUEST_LOCAL_SCOPE_REQUIRED",
        "LOCAL_PRINCIPAL_RECOVERY_REQUIRED",
        "SESSION_NOT_ADOPTED",
        "GUEST_VERIFICATION_SESSION_INVALID",
        "GUEST_VERIFICATION_IDENTITY_MISMATCH",
        "GUEST_VERIFICATION_METADATA_INVALID",
        "GUEST_VERIFICATION_BINDING_MISMATCH",
        "GUEST_VERIFICATION_CREDENTIAL_MISMATCH",
        "GUEST_VERIFICATION_SLOT_OCCUPIED",
        "GUEST_VERIFICATION_REFRESH_CAS",
        "GUEST_VERIFICATION_SESSION_MISSING",
      ]);
      if (error instanceof Error && safe.has(error.message)) throw Error(error.message);
      throw Error("GUEST_VERIFICATION_STORAGE_UNAVAILABLE");
    }
  }
  return {
    async store(
      input: GuestVerificationBinding,
      inputSession: LocalSession,
      previousRefreshToken?: string,
    ) {
      // Clone before the first await: callers cannot retarget or mutate a verified result mid-write.
      const session = validateSession(
        inputSession,
        bindingSchema.parse(input).targetAccountId,
      );
      return pinned(input, async (binding, check) => {
        const key = metadataKey(binding.sourceGuestLocalId);
        const raw = await deps.storage.getItem(key);
        await check();
        const priorRecord = raw !== null ? parseRecord(raw, binding) : null;
        const slot = deps.accountSessionKey(binding.targetAccountId);
        const existing = await deps.storage.getItem(slot);
        await check();
        if (raw === null && existing !== null)
          throw Error("GUEST_VERIFICATION_SLOT_OCCUPIED");
        let previousCredentialSha256: string | null = null;
        if (existing !== null) {
          let prior: ReturnType<typeof validateSession>;
          try {
            prior = validateSession(JSON.parse(existing), binding.targetAccountId);
          } catch {
            throw Error("GUEST_VERIFICATION_SESSION_INVALID");
          }
          previousCredentialSha256 = await assertCredential(priorRecord!, prior);
          await check();
          const identical = JSON.stringify(prior) === JSON.stringify(session);
          if (
            !identical &&
            (!previousRefreshToken || prior.refreshToken !== previousRefreshToken)
          )
            throw Error("GUEST_VERIFICATION_REFRESH_CAS");
        } else if (previousRefreshToken !== undefined) {
          throw Error("GUEST_VERIFICATION_REFRESH_CAS");
        }
        const credentialSha256 = await fingerprint(session);
        await check();
        if (
          priorRecord &&
          existing === null &&
          (priorRecord.phase === "READY" ||
            priorRecord.previousCredentialSha256 !== null ||
            priorRecord.credentialSha256 !== credentialSha256)
        )
          throw Error("GUEST_VERIFICATION_CREDENTIAL_MISMATCH");
        const record = {
          ...binding,
          version: 1 as const,
          phase: "PERSISTING" as const,
          credentialSha256,
          previousCredentialSha256,
        };
        await check();
        await deps.storage.setItem(key, JSON.stringify(record));
        await check();
        await deps.storage.setItem(slot, JSON.stringify(session));
        await check();
        await deps.storage.setItem(
          key,
          JSON.stringify({ ...record, phase: "READY", previousCredentialSha256: null }),
        );
      });
    },
    async read(
      input: GuestVerificationBinding,
    ): Promise<
      | { status: "ABSENT" | "PENDING_WRITE" }
      | { status: "SESSION"; session: LocalSession }
    > {
      return pinned(input, async (binding, check) => {
        const raw = await deps.storage.getItem(metadataKey(binding.sourceGuestLocalId));
        await check();
        if (raw === null) return { status: "ABSENT" };
        const record = parseRecord(raw, binding);
        const credential = await deps.storage.getItem(
          deps.accountSessionKey(binding.targetAccountId),
        );
        await check();
        if (credential === null) {
          if (record.phase === "READY") throw Error("GUEST_VERIFICATION_SESSION_MISSING");
          return { status: "PENDING_WRITE" };
        }
        let value: unknown;
        try {
          value = JSON.parse(credential);
        } catch {
          throw Error("GUEST_VERIFICATION_SESSION_INVALID");
        }
        const session = validateSession(value, binding.targetAccountId);
        await assertCredential(record, session);
        await check();
        return { status: "SESSION", session };
      });
    },
  };
}

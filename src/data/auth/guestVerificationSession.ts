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
  phase: z.enum(["PERSISTING", "READY", "REVOKING", "REVOKED"]),
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

const revocations = new WeakMap<SecureSessionStorage, Map<string, Promise<void>>>();

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
  function decodeRecord(raw: string) {
    let record: z.infer<typeof recordSchema>;
    try {
      record = recordSchema.parse(JSON.parse(raw));
    } catch {
      throw Error("GUEST_VERIFICATION_METADATA_INVALID");
    }
    return record;
  }
  function parseRecord(raw: string, binding: GuestVerificationBinding) {
    const record = decodeRecord(raw);
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
        "GUEST_VERIFICATION_REVOCATION_PENDING",
        "GUEST_VERIFICATION_REVOKED",
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
        let priorRecord = raw !== null ? decodeRecord(raw) : null;
        if (
          priorRecord?.phase === "REVOKED" &&
          priorRecord.sourceGuestLocalId === binding.sourceGuestLocalId &&
          priorRecord.adoptionId !== binding.adoptionId
        ) {
          const oldSlot = await deps.storage.getItem(
            deps.accountSessionKey(priorRecord.targetAccountId),
          );
          await check();
          if (oldSlot !== null) throw Error("GUEST_VERIFICATION_REVOCATION_PENDING");
          priorRecord = null;
        } else if (raw !== null) {
          parseRecord(raw, binding);
          if (priorRecord?.phase === "REVOKING")
            throw Error("GUEST_VERIFICATION_REVOCATION_PENDING");
          if (priorRecord?.phase === "REVOKED") throw Error("GUEST_VERIFICATION_REVOKED");
        }
        const slot = deps.accountSessionKey(binding.targetAccountId);
        const existing = await deps.storage.getItem(slot);
        await check();
        if (priorRecord === null && existing !== null)
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
      | { status: "ABSENT" | "PENDING_WRITE" | "REVOCATION_PENDING" | "REVOKED" }
      | { status: "SESSION"; session: LocalSession }
    > {
      return pinned(input, async (binding, check) => {
        const raw = await deps.storage.getItem(metadataKey(binding.sourceGuestLocalId));
        await check();
        if (raw === null) return { status: "ABSENT" };
        const record = parseRecord(raw, binding);
        if (record.phase === "REVOKING") return { status: "REVOCATION_PENDING" };
        if (record.phase === "REVOKED") return { status: "REVOKED" };
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
    async revoke(
      input: GuestVerificationBinding,
      revokeSession: (session: LocalSession) => Promise<void>,
    ) {
      const binding = Object.freeze(bindingSchema.parse(input));
      const key = canonicalCoreJson(binding as Json);
      let inflight = revocations.get(deps.storage);
      if (!inflight) {
        inflight = new Map();
        revocations.set(deps.storage, inflight);
      }
      const existing = inflight.get(key);
      if (existing) return existing;
      const run = async () => {
        const generation = getAccountGeneration();
        const sameGeneration = () => {
          if (generation !== getAccountGeneration())
            throw Error("GUEST_VERIFICATION_STALE");
        };
        const staged = await pinned(binding, async (binding, check) => {
          sameGeneration();
          const key = metadataKey(binding.sourceGuestLocalId);
          const raw = await deps.storage.getItem(key);
          await check();
          if (raw === null) return null;
          const record = parseRecord(raw, binding);
          const slot = deps.accountSessionKey(binding.targetAccountId);
          const credential = await deps.storage.getItem(slot);
          await check();
          if (credential === null) {
            if (record.phase === "REVOKED") return null;
            throw Error("GUEST_VERIFICATION_SESSION_MISSING");
          }
          let session: ReturnType<typeof validateSession>;
          try {
            session = validateSession(JSON.parse(credential), binding.targetAccountId);
          } catch {
            throw Error("GUEST_VERIFICATION_SESSION_INVALID");
          }
          const sha = await assertCredential(record, session);
          await check();
          if (record.phase === "REVOKED") {
            await deps.storage.deleteItem(slot);
            return null;
          }
          const revoking = {
            ...record,
            phase: "REVOKING" as const,
            credentialSha256: sha,
            previousCredentialSha256: null,
          };
          await deps.storage.setItem(key, JSON.stringify(revoking));
          return { binding, record: revoking, session };
        });
        if (!staged) return;
        sameGeneration();
        // Network stays outside the apply gate; only this exact login is revoked.
        try {
          await revokeSession(staged.session);
        } catch {
          throw Error("GUEST_VERIFICATION_REVOCATION_PENDING");
        }
        await pinned(staged.binding, async (binding, check) => {
          sameGeneration();
          const key = metadataKey(binding.sourceGuestLocalId);
          const raw = await deps.storage.getItem(key);
          await check();
          if (raw === null) throw Error("GUEST_VERIFICATION_BINDING_MISMATCH");
          const record = parseRecord(raw, binding);
          if (
            record.credentialSha256 !== staged.record.credentialSha256 ||
            !["REVOKING", "REVOKED"].includes(record.phase)
          )
            throw Error("GUEST_VERIFICATION_CREDENTIAL_MISMATCH");
          const slot = deps.accountSessionKey(binding.targetAccountId);
          const credential = await deps.storage.getItem(slot);
          await check();
          if (credential !== null) {
            let session: ReturnType<typeof validateSession>;
            try {
              session = validateSession(JSON.parse(credential), binding.targetAccountId);
            } catch {
              throw Error("GUEST_VERIFICATION_SESSION_INVALID");
            }
            await assertCredential(record, session);
            await check();
          }
          // Persist the server acknowledgment before deletion, so cold cleanup never re-revokes.
          await deps.storage.setItem(
            key,
            JSON.stringify({ ...record, phase: "REVOKED" }),
          );
          await check();
          await deps.storage.deleteItem(slot);
        });
      };
      const pending = run();
      inflight.set(key, pending);
      try {
        await pending;
      } finally {
        if (inflight.get(key) === pending) inflight.delete(key);
      }
    },
  };
}

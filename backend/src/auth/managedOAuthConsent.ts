import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { ManagedConsentQuery } from "../managedWriteAdmission";
const verifiedManagedOAuthSessionSchema = z.strictObject({
  issuer: z.literal("https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1"),
  accountId: z.uuid(),
  clientId: z.uuid(),
  sessionId: z.uuid(),
  expiresAt: z.number().int().positive(),
});
type VerifiedManagedOAuthSession = z.infer<typeof verifiedManagedOAuthSessionSchema>;
const sessionBinding = verifiedManagedOAuthSessionSchema
  .omit({ expiresAt: true })
  .strip();
type ManagedNativeGrantSnapshot = z.infer<typeof sessionBinding>;
type ManagedOAuthReadPort = {
  query(sql: string, parameters: readonly string[]): Promise<{ rows: unknown[] }>;
};

// This private store receives its principals only from the verified Managed Gateway.
export type ManagedConsentConnection = {
  withLease<T>(
    work: (lease: ManagedOAuthReadPort & { retire(): void }) => Promise<T>,
  ): Promise<T>;
};
const policySchema = z.object({
  policyId: z.string().min(1).max(256),
  policyVersion: z.string().min(1).max(256),
  policyHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int().positive(),
  grantTtlSeconds: z.number().int().positive().optional(),
});
export type ManagedConsentPolicy = z.infer<typeof policySchema>;
const originalSchema = z.object({
  id: z.uuid(),
  secret: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ManagedConsentRequest = z.infer<typeof originalSchema>;
export function createManagedConsentRequest(): ManagedConsentRequest {
  return { id: randomUUID(), secret: randomBytes(32).toString("hex") };
}
const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");
const rowSchema = z.object({
  id: z.uuid(),
  secret_hash: z.string().regex(/^[a-f0-9]{64}$/),
  oauth_session: z.unknown(),
  native_snapshot: z.unknown(),
  policy: policySchema,
  state: z.enum(["PENDING", "APPROVED", "DENIED", "REVOKED", "EXPIRED"]),
  challenge_expires_ms: z.coerce.number().int().positive(),
  consent_expires_ms: z.coerce.number().int().positive(),
});
const select = `SELECT id::text, secret_hash, oauth_session, native_snapshot, policy, state,
 (extract(epoch FROM challenge_expires_at)*1000)::bigint::text AS challenge_expires_ms,
 (extract(epoch FROM consent_expires_at)*1000)::bigint::text AS consent_expires_ms
 FROM public.otr_mcp_managed_consents`;
class ManagedConsentRejected extends Error {}
function failure(): never {
  throw new ManagedConsentRejected("MANAGED_CONSENT_UNAVAILABLE");
}
function sameSecret(expected: string, secret: string) {
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hash(secret), "hex"));
}

export function createManagedOAuthConsent(
  connection: ManagedConsentConnection,
  currentPolicy: () => ManagedConsentPolicy,
) {
  const transaction = async <T>(
    signal: AbortSignal,
    work: (lease: ManagedOAuthReadPort & { retire(): void }) => Promise<T>,
    options?: { decisionId?: string; readOnly?: boolean; retryBusyLease?: boolean },
  ): Promise<T> => {
    const decisionId = options?.decisionId;
    let stage = "lease";
    const started = Date.now();
    const recordFailure = (error: unknown) => {
      if (!decisionId) return;
      const code = (error as { code?: unknown } | null)?.code;
      console.info(JSON.stringify({
        event: "mcp_managed_consent_decision_failed",
        decisionId,
        stage,
        aborted: signal.aborted,
        sqlstate: typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined,
        durationMs: Date.now() - started,
      }));
    };
    signal.throwIfAborted();
    try {
      return await connection.withLease(async (lease) => {
        signal.throwIfAborted();
        stage = "begin";
        await lease.query(options?.readOnly ? "BEGIN READ ONLY" : "BEGIN", []);
        try {
          if (!options?.readOnly) {
            await lease.query("SET LOCAL lock_timeout='3s'", []);
            await lease.query("SET LOCAL statement_timeout='10s'", []);
          }
          stage = options?.readOnly ? "read" : "work";
          const result = await work(lease);
          stage = "before_commit";
          signal.throwIfAborted();
          stage = "commit";
          await lease.query("COMMIT", []);
          stage = "committed";
          return result;
        } catch (error) {
          recordFailure(error);
          stage = "rollback";
          await lease.query("ROLLBACK", []).catch(() => lease.retire());
          throw error;
        }
      });
    } catch (error) {
      const leaseBusy =
        stage === "lease" && (error as { code?: string } | null)?.code === "53300";
      if (options?.retryBusyLease && leaseBusy) {
        console.info(JSON.stringify({ event: "mcp_managed_consent_lease_retry", sqlstate: "53300" }));
        await delay(300, undefined, { signal });
        return transaction(signal, work, { ...options, retryBusyLease: false });
      }
      if (stage !== "rollback") recordFailure(error);
      if (leaseBusy && decisionId) throw new Error("MCP_CONSENT_STORE_UNAVAILABLE");
      if (options?.readOnly && !(error instanceof ManagedConsentRejected)) {
        const code = (error as { code?: unknown } | null)?.code;
        console.info(JSON.stringify({
          event: "mcp_managed_consent_read_unavailable",
          stage,
          sqlstate: typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined,
          durationMs: Date.now() - started,
        }));
        throw new Error("MCP_CONSENT_STORE_UNAVAILABLE");
      }
      return failure();
    }
  };
  const read = async (lease: ManagedOAuthReadPort, id: string, lock = false) => {
    const result = await lease.query(
      select + " WHERE id=$1::uuid" + (lock ? " FOR UPDATE" : ""),
      [id],
    );
    if (result.rows.length !== 1) return failure();
    return rowSchema.parse(result.rows[0]);
  };
  const policy = () => {
    const p = policySchema.parse(currentPolicy());
    if (p.expiresAt <= Date.now()) return failure();
    return p;
  };
  const checkSession = (
    row: z.infer<typeof rowSchema>,
    session: VerifiedManagedOAuthSession = verifiedManagedOAuthSessionSchema.parse(
      row.oauth_session,
    ),
  ) => {
    if (session.expiresAt <= Date.now()) return failure();
    const binding = sessionBinding.parse(session);
    if (
      !isDeepStrictEqual(binding, row.native_snapshot) ||
      !isDeepStrictEqual(row.policy, policy())
    )
      return failure();
    return binding;
  };
  // Serialize only this table's session row; never lock the external OAuth authority.
  const lockSession = async (
    lease: ManagedOAuthReadPort,
    accountId: string,
    sessionId: string,
  ) => {
    const key = accountId + ":" + sessionId;
    await lease.query(
      `INSERT INTO public.otr_mcp_managed_consents
      (id,secret_hash,session_key,oauth_session,native_snapshot,policy,state,challenge_expires_at,consent_expires_at)
      VALUES ($1::uuid,$2,$3,$4::jsonb,'{}'::jsonb,'{}'::jsonb,'SESSION_OPEN',clock_timestamp(),clock_timestamp())
      ON CONFLICT (session_key) DO NOTHING`,
      [
        randomUUID(),
        hash(randomBytes(32).toString("hex")),
        key,
        JSON.stringify({ accountId, sessionId }),
      ],
    );
    const locked = await lease.query(
      `SELECT state AS session_state FROM public.otr_mcp_managed_consents WHERE session_key=$1 FOR UPDATE`,
      [key],
    );
    if (locked.rows.length !== 1) return failure();
    return z
      .object({ session_state: z.enum(["SESSION_OPEN", "REVOKED"]) })
      .parse(locked.rows[0]).session_state;
  };
  const insertPending = async (
    lease: ManagedOAuthReadPort,
    session: VerifiedManagedOAuthSession,
    native: ManagedNativeGrantSnapshot,
    p: ManagedConsentPolicy,
    original: ManagedConsentRequest,
  ) => {
    const now = Date.now();
    const consentExpiresAt = p.grantTtlSeconds === undefined
      ? p.expiresAt
      : Math.min(p.expiresAt, session.expiresAt, now + p.grantTtlSeconds * 1000);
    await lease.query(
      `INSERT INTO public.otr_mcp_managed_consents
      (id,secret_hash,oauth_session,native_snapshot,policy,state,challenge_expires_at,consent_expires_at)
      VALUES ($1::uuid,$2,$3::jsonb,$4::jsonb,$5::jsonb,'PENDING',to_timestamp($6::double precision/1000),to_timestamp($7::double precision/1000))
      ON CONFLICT (id) DO NOTHING`,
      [
        original.id,
        hash(original.secret),
        JSON.stringify(session),
        JSON.stringify(native),
        JSON.stringify(p),
        String(Math.min(consentExpiresAt, session.expiresAt, now + 300000)),
        String(consentExpiresAt),
      ],
    );
    return read(lease, original.id);
  };
  const inspect = async (
    principal: Readonly<{ accountId: string; kind: "FIRST_PARTY" }>,
    input: { id: string; secret?: string },
    signal: AbortSignal,
  ) => {
    const original = input;
    const accountId = z.uuid().parse(principal.accountId);
    if (principal.kind !== "FIRST_PARTY") return failure();
    return transaction(signal, async (lease) => {
      const saved = await read(lease, original.id);
      const native = checkSession(saved);
      if (
        (original.secret !== undefined &&
          !sameSecret(saved.secret_hash, original.secret)) ||
        native.accountId !== accountId ||
        saved.state === "EXPIRED" ||
        saved.consent_expires_ms <= Date.now() ||
        (saved.state === "PENDING" && saved.challenge_expires_ms <= Date.now())
      )
        return failure();
      return {
        id: saved.id,
        accountId,
        policy: saved.policy,
        state: saved.state,
        expiresAt: saved.challenge_expires_ms,
      };
    }, { readOnly: true, retryBusyLease: true });
  };
  const decide = async (
    principal: Readonly<{ accountId: string; kind: "FIRST_PARTY" }>,
    input: { id: string; secret?: string },
    allow: boolean,
    signal: AbortSignal,
  ) => {
    const original = input;
    principal = { accountId: principal.accountId, kind: principal.kind };
    if (
      principal.kind !== "FIRST_PARTY" ||
      !z.uuid().safeParse(principal.accountId).success ||
      typeof allow !== "boolean"
    )
      return failure();
    return transaction(signal, async (lease) => {
      const target = await read(lease, original.id);
      const session = verifiedManagedOAuthSessionSchema.parse(target.oauth_session);
      if (
        (await lockSession(lease, session.accountId, session.sessionId)) !==
        "SESSION_OPEN"
      )
        return failure();
      const saved = await read(lease, original.id, true);
      const native = checkSession(saved);
      if (
        (original.secret !== undefined &&
          !sameSecret(saved.secret_hash, original.secret)) ||
        native.accountId !== principal.accountId ||
        saved.state !== "PENDING" ||
        saved.challenge_expires_ms <= Date.now()
      )
        return failure();
      if (allow) {
        // The session lock serializes renewal with other decisions and revocation.
        await lease.query(
          `UPDATE public.otr_mcp_managed_consents SET state='EXPIRED'
          WHERE oauth_session->>'issuer'=$1
            AND oauth_session->>'accountId'=$2 AND oauth_session->>'clientId'=$3
            AND oauth_session->>'sessionId'=$4 AND policy->>'policyHash'=$5
            AND state='APPROVED' AND consent_expires_at<=clock_timestamp()`,
          [
            session.issuer,
            session.accountId,
            session.clientId,
            session.sessionId,
            saved.policy.policyHash,
          ],
        );
      }
      // A current bearer is required on every request. Its expiry bounds the
      // challenge, while the explicit decision sets the same-session consent lifetime.
      const ttlSeconds = allow ? saved.policy.grantTtlSeconds : undefined;
      const consentExpiry = ttlSeconds === undefined
        ? saved.consent_expires_ms
        : Math.min(saved.policy.expiresAt, Date.now() + ttlSeconds * 1000);
      const result = await lease.query(
        `UPDATE public.otr_mcp_managed_consents SET state=$2,decided_at=clock_timestamp(),
           consent_expires_at=to_timestamp($3::double precision/1000)
          WHERE id=$1::uuid AND state='PENDING' AND challenge_expires_at>clock_timestamp() RETURNING id`,
        [original.id, allow ? "APPROVED" : "DENIED", String(consentExpiry)],
      );
      if (result.rows.length !== 1) return failure();
      return {
        id: original.id,
        decision: allow ? ("APPROVED" as const) : ("DENIED" as const),
      };
    }, { decisionId: original.id, retryBusyLease: true });
  };
  return Object.freeze({
    version: "managed-api-v1" as const,
    async getOrCreateChallenge(
      session: VerifiedManagedOAuthSession,
      signal: AbortSignal,
    ) {
      session = verifiedManagedOAuthSessionSchema.parse(session);
      const p = policy();
      return transaction(signal, async (lease) => {
        if (
          (await lockSession(lease, session.accountId, session.sessionId)) !==
          "SESSION_OPEN"
        )
          return failure();
        const result = await lease.query(
          select +
            ` WHERE oauth_session->>'issuer'=$1
          AND oauth_session->>'accountId'=$2 AND oauth_session->>'clientId'=$3
          AND oauth_session->>'sessionId'=$4 AND policy->>'policyHash'=$5
          AND state='PENDING' AND challenge_expires_at>clock_timestamp() LIMIT 2`,
          [
            session.issuer,
            session.accountId,
            session.clientId,
            session.sessionId,
            p.policyHash,
          ],
        );
        if (result.rows.length > 1) return failure();
        let saved;
        if (result.rows.length === 1) {
          saved = rowSchema.parse(result.rows[0]);
          checkSession(saved, session);
        } else {
          const native = sessionBinding.parse(session);
          saved = await insertPending(
            lease,
            session,
            native,
            p,
            createManagedConsentRequest(),
          );
        }
        if (saved.state !== "PENDING" || saved.challenge_expires_ms <= Date.now())
          return failure();
        // Public correlation ID is never a bearer credential. First-party authentication is mandatory.
        return { id: saved.id, expiresAt: saved.challenge_expires_ms };
      }, { retryBusyLease: true });
    },
    async begin(
      session: VerifiedManagedOAuthSession,
      input: ManagedConsentRequest,
      signal: AbortSignal,
    ) {
      const original = originalSchema.parse(input),
        p = policy();
      session = verifiedManagedOAuthSessionSchema.parse(session);
      return transaction(signal, async (lease) => {
        if (
          (await lockSession(lease, session.accountId, session.sessionId)) !==
          "SESSION_OPEN"
        )
          return failure();
        const native = sessionBinding.parse(session);
        const saved = await insertPending(lease, session, native, p, original);
        if (
          !sameSecret(saved.secret_hash, original.secret) ||
          saved.state !== "PENDING" ||
          saved.challenge_expires_ms <= Date.now() ||
          !isDeepStrictEqual(saved.oauth_session, session) ||
          !isDeepStrictEqual(saved.native_snapshot, native) ||
          !isDeepStrictEqual(saved.policy, p)
        )
          return failure();
        // Original retry never changes the challenge, target, policy or deadline.
        return { id: saved.id, expiresAt: saved.challenge_expires_ms };
      });
    },
    inspect(
      principal: Readonly<{ accountId: string; kind: "FIRST_PARTY" }>,
      input: ManagedConsentRequest,
      signal: AbortSignal,
    ) {
      return inspect(principal, originalSchema.parse(input), signal);
    },
    decide(
      principal: Readonly<{ accountId: string; kind: "FIRST_PARTY" }>,
      input: ManagedConsentRequest,
      allow: boolean,
      signal: AbortSignal,
    ) {
      return decide(principal, originalSchema.parse(input), allow, signal);
    },
    inspectById(
      principal: Readonly<{ accountId: string; kind: "FIRST_PARTY" }>,
      id: string,
      signal: AbortSignal,
    ) {
      return inspect(principal, { id: z.uuid().parse(id) }, signal);
    },
    decideById(
      principal: Readonly<{ accountId: string; kind: "FIRST_PARTY" }>,
      id: string,
      allow: boolean,
      signal: AbortSignal,
    ) {
      return decide(principal, { id: z.uuid().parse(id) }, allow, signal);
    },
    async revoke(
      principal: Readonly<{ accountId: string; kind: "FIRST_PARTY" }>,
      oauthSessionId: string,
      signal: AbortSignal,
    ) {
      const accountId = z.uuid().parse(principal.accountId),
        sessionId = z.uuid().parse(oauthSessionId);
      if (principal.kind !== "FIRST_PARTY") return failure();
      return transaction(signal, async (lease) => {
        await lockSession(lease, accountId, sessionId);
        await lease.query(
          `UPDATE public.otr_mcp_managed_consents
          SET state='REVOKED', decided_at=coalesce(decided_at,clock_timestamp()), revoked_at=clock_timestamp()
          WHERE oauth_session->>'accountId'=$1 AND oauth_session->>'sessionId'=$2
            AND state IN ('PENDING','APPROVED','SESSION_OPEN')`,
          [accountId, sessionId],
        );
        return { sessionId, state: "REVOKED" as const };
      });
    },
    async readBinding(
      session: VerifiedManagedOAuthSession,
      signal: AbortSignal,
      consentQuery?: ManagedConsentQuery,
    ) {
      try {
        session = verifiedManagedOAuthSessionSchema.parse(session);
        const current = policy();
        const readApproval = async (lease: ManagedOAuthReadPort) => {
          signal.throwIfAborted();
          const result = await lease.query(
            select +
              ` WHERE oauth_session->>'issuer'=$1
            AND oauth_session->>'accountId'=$2 AND oauth_session->>'clientId'=$3
            AND oauth_session->>'sessionId'=$4 AND policy->>'policyHash'=$5
            AND state='APPROVED' AND consent_expires_at>clock_timestamp()
            AND NOT EXISTS (
              SELECT 1 FROM public.otr_mcp_managed_consents AS revoked
              WHERE revoked.session_key=$2 || ':' || $4 AND revoked.state='REVOKED'
            ) LIMIT 2`,
            [
              session.issuer,
              session.accountId,
              session.clientId,
              session.sessionId,
              current.policyHash,
            ],
          );
          signal.throwIfAborted();
          if (result.rows.length !== 1) return failure();
          const saved = rowSchema.parse(result.rows[0]);
          const native = checkSession(saved, session);
          if (saved.state !== "APPROVED") return failure();
          const binding = {
            ...native,
            ...saved.policy,
            evidenceId: saved.id,
            expiresAt: saved.consent_expires_ms,
          };
          return binding.expiresAt > Date.now() ? binding : null;
        };
        // Core already owns a transaction on this role's sole connection.
        return consentQuery
          ? await readApproval(consentQuery)
          : await transaction(signal, readApproval, { readOnly: true, retryBusyLease: true });
      } catch (error) {
        if (error instanceof ManagedConsentRejected || error instanceof z.ZodError) return null;
        throw error;
      }
    },
  });
}

import { createClient } from "@supabase/supabase-js";
import {
  privateAccountProfileMutationSchema,
  privateAccountProfileReceiptSchema,
  privateAccountProfileSnapshotSchema,
} from "../../src/data/api/privateAccountProfileContracts";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { isOAuthResourceToken } from "./authResourceTokenBoundary";
import { isSupabaseDevPublicKey } from "../../src/data/auth/devSupabasePublicKey";
import {
  PrivateAccountProfileError,
  type PrivateAccountProfilePort,
} from "./privateAccountProfile";

function failure(error: { code?: string }): never {
  if (error.code === "40001")
    throw new PrivateAccountProfileError(409, "PROFILE_CONFLICT");
  if (error.code === "23505")
    throw new PrivateAccountProfileError(409, "PROFILE_OPERATION_COLLISION");
  if (error.code === "42501")
    throw new PrivateAccountProfileError(403, "PROFILE_FORBIDDEN");
  if (["22023", "22P02", "22P05"].includes(error.code ?? ""))
    throw new PrivateAccountProfileError(400, "PROFILE_INVALID");
  throw new PrivateAccountProfileError(503, "PROFILE_UNAVAILABLE");
}

// Candidate adapter only. No Bootstrap mounting or public profiles fallback.
export function createPrivateAccountProfilePort(config: {
  url: string;
  publishableKey: string;
  fetchImplementation?: typeof fetch;
}): PrivateAccountProfilePort {
  const origin = "https://tuqigdxrvrerfewsxqgm.supabase.co";
  if (![origin, origin + "/"].includes(config.url) || !isSupabaseDevPublicKey(config.publishableKey))
    throw Error("PROFILE_DEV_CONFIG_REQUIRED");
  async function client(
    raw: Parameters<PrivateAccountProfilePort["read"]>[0],
    signal: AbortSignal,
  ) {
    const scope = Object.freeze({ ...raw });
    coreUuid.parse(scope.accountId);
    if (!scope.accessToken || signal.aborted)
      throw new PrivateAccountProfileError(503, "PROFILE_UNAVAILABLE");
    if (isOAuthResourceToken(scope.accessToken))
      throw new PrivateAccountProfileError(403, "PROFILE_IDENTITY_REQUIRED");
    const wire = config.fetchImplementation ?? fetch;
    const database = createClient(origin, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: { Authorization: `Bearer ${scope.accessToken}` },
        fetch: (input, init) => wire(input, { ...init, signal, redirect: "error" }),
      },
    });
    const identity = await database.auth.getUser(scope.accessToken);
    if (identity.error || signal.aborted)
      throw new PrivateAccountProfileError(503, "PROFILE_UNAVAILABLE");
    if (
      !identity.data.user ||
      identity.data.user.id !== scope.accountId ||
      identity.data.user.is_anonymous !== false
    )
      throw new PrivateAccountProfileError(403, "PROFILE_IDENTITY_REQUIRED");
    const subject = await database.rpc("account_private_profile_actor");
    if (subject.error) failure(subject.error);
    if (signal.aborted || subject.data !== scope.accountId)
      throw new PrivateAccountProfileError(403, "PROFILE_IDENTITY_REQUIRED");
    return { database, scope };
  }
  return {
    async read(raw, signal) {
      const { database, scope } = await client(raw, signal);
      const { data, error } = await database
        .from("account_private_profiles")
        .select("account_id,revision,fields_json")
        .eq("account_id", scope.accountId)
        .maybeSingle();
      if (error) failure(error);
      if (signal.aborted)
        throw new PrivateAccountProfileError(503, "PROFILE_UNAVAILABLE");
      const result = privateAccountProfileSnapshotSchema.parse(
        data === null
          ? {
              schemaId: "otr.auth.private-profile/1",
              accountId: scope.accountId,
              revision: 0,
              fields: {},
            }
          : {
              schemaId: "otr.auth.private-profile/1",
              accountId: data?.account_id,
              revision: data?.revision,
              fields: data?.fields_json,
            },
      );
      if (result.accountId !== scope.accountId)
        throw new PrivateAccountProfileError(503, "PROFILE_RESULT_BINDING");
      return result;
    },
    async save(raw, value, signal) {
      const input = privateAccountProfileMutationSchema.parse(value);
      const { database, scope } = await client(raw, signal);
      const { data, error } = await database.rpc("account_private_profile_save", {
        p_operation: input.operationId,
        p_expected_revision: input.expectedRevision,
        p_changes: input.changes,
      });
      if (error) failure(error);
      if (signal.aborted)
        throw new PrivateAccountProfileError(503, "PROFILE_UNAVAILABLE");
      const result = privateAccountProfileReceiptSchema.parse(data);
      if (
        result.accountId !== scope.accountId ||
        result.operationId !== input.operationId ||
        result.revision !== input.expectedRevision + 1
      )
        throw new PrivateAccountProfileError(503, "PROFILE_RESULT_BINDING");
      return result;
    },
    async receipt(raw, operationId, signal) {
      coreUuid.parse(operationId);
      const { database, scope } = await client(raw, signal);
      const { data, error } = await database
        .from("account_private_profile_receipts")
        .select("account_id,operation_id,revision,recorded_at")
        .eq("account_id", scope.accountId)
        .eq("operation_id", operationId)
        .maybeSingle();
      if (error) failure(error);
      if (signal.aborted)
        throw new PrivateAccountProfileError(503, "PROFILE_UNAVAILABLE");
      if (data === null) return null;
      const result = privateAccountProfileReceiptSchema.parse({
        schemaId: "otr.auth.private-profile-receipt/1",
        accountId: data.account_id,
        operationId: data.operation_id,
        revision: data.revision,
        recordedAt: data.recorded_at,
      });
      if (result.accountId !== scope.accountId || result.operationId !== operationId)
        throw new PrivateAccountProfileError(503, "PROFILE_RESULT_BINDING");
      return result;
    },
  };
}

import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { assertAccountRequestContext, type AccountScope } from "./accountRequestContext";

// Existing Auth SDK listGrants metadata, not grant liveness or per-session connection status.
const grantSchema = z.object({
  client: z.object({ id: coreUuid, name: z.string().max(512) }),
  scopes: z.array(z.string().min(1).max(128)).max(64),
  granted_at: z.iso.datetime({ offset: true }),
});
const observationSchema = z.strictObject({
  accountId: coreUuid,
  grants: z.array(grantSchema).max(200),
});
export type McpSelfGrantsReader = (scope: AccountScope) => Promise<unknown>;

// The owning Reader must prove normal self Auth. Its absence never means no connections.
export async function readMcpGrantObservation(
  input: AccountScope,
  sources: { account(): Promise<string>; read?: McpSelfGrantsReader },
) {
  const scope = Object.freeze({ ...input });
  coreUuid.parse(scope.accountId);
  await assertAccountRequestContext(scope, sources.account);
  if (!sources.read) return Object.freeze({ kind: "UNAVAILABLE" as const });
  const snapshot = observationSchema.parse(await sources.read(scope));
  await assertAccountRequestContext(scope, sources.account);
  if (snapshot.accountId !== scope.accountId) throw Error("MCP_GRANT_ACCOUNT_MISMATCH");
  const ids = new Set<string>();
  for (const grant of snapshot.grants) {
    if (ids.has(grant.client.id)) throw Error("MCP_GRANT_DUPLICATE_CLIENT");
    ids.add(grant.client.id);
  }
  return Object.freeze({
    kind: "GRANT_LIST_OBSERVED" as const,
    connectionStatus: "UNKNOWN" as const,
    grants: Object.freeze(
      snapshot.grants.map((grant) =>
        Object.freeze({
          clientId: grant.client.id,
          clientName: grant.client.name,
          scopes: Object.freeze([...grant.scopes]),
          grantedAt: grant.granted_at,
        }),
      ),
    ),
  });
}

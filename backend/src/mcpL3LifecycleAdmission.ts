import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { createTripLifecyclePgStorage } from "./tripLifecycle";
import { TripMetadataError } from "./tripMetadata";
export function createMcpL3LifecyclePort(
  connection: CorePgConnection,
  grant: {
    accountId: string; clientId: string; resource: string;
    managedConsent?: { evidenceId: string; sessionId: string; policyHash: string };
  },
) {
  return createTripLifecyclePgStorage(connection, async (lease, actor, input) => {
    if (input.action !== "DELETE") return;
    if (actor !== grant.accountId) throw new TripMetadataError(403, "L3_ACTOR_MISMATCH");
    const parameters = [actor, grant.clientId, grant.resource, input.operationId, JSON.stringify(input)];
    const result = grant.managedConsent
      ? await lease.query(
          "SELECT public.mcp_managed_l3_assert_lifecycle($1::uuid,$2::uuid,$3::text,$4::uuid,$5::jsonb,$6::jsonb) AS allowed",
          [...parameters, JSON.stringify(grant.managedConsent)],
        )
      : await lease.query(
          "SELECT public.mcp_l3_assert_lifecycle($1::uuid,$2::uuid,$3::text,$4::uuid,$5::jsonb) AS allowed",
          parameters,
        );
    if (result.rows[0]?.allowed !== true)
      throw new TripMetadataError(403, "L3_TRUSTED_APPROVAL_REQUIRED");
  });
}

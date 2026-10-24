import type { CoreGateMode } from "./tripSustainedGate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentOriginalReader } from "./tripDocumentOriginalHttp";
import { createTripDocumentPrivateReferenceCustody } from "./tripDocumentPrivateReferenceCustody";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import { createCoreSourcePgAuthority } from "./tripCoreV2SourcePgAuthority";
import {
  createCorePgStorage,
  readCorePgOperation,
  readCorePgGraph,
  type CorePgConnection,
  type CorePgLease,
} from "./tripCoreV2PgStorage";
import { createCorePgReader } from "./tripCoreV2PgRead";
import type { CoreHttpConnection } from "./tripCoreV2Http";

// Explicit dormant composition; no credentials, startup caller or capability activation.
export function createCorePgHttpConnection(
  connection: CorePgConnection,
  hash: ImportHash,
  documentStorage?: SupabaseClient["storage"],
  gateMode?: CoreGateMode,
): CoreHttpConnection & { documentOriginalReader?: DocumentOriginalReader } {
  const authority = createCoreSourcePgAuthority(connection, hash);
  const baseReader = createCorePgReader(connection, hash, undefined, gateMode);
  const custody = documentStorage
    ? createTripDocumentPrivateReferenceCustody(
        connection,
        documentStorage,
        baseReader.currentDocumentAccess,
      )
    : undefined;
  const read = custody
    ? createCorePgReader(
        connection,
        hash,
        {
          authorize: async (lease, actor, graph) => {
            const originalDocumentIds: string[] = [];
            for (const row of graph.trip_operational_documents)
              if (await custody.canReadDocument(lease, actor, graph, row))
                originalDocumentIds.push(row.id as string);
            return { originalDocumentIds, ledgerExpenseIds: [] };
          },
        },
        gateMode,
      )
    : baseReader;
  async function documentGraph(lease: CorePgLease, tripId: string) {
    const role = (await lease.query("SELECT current_user AS role")).rows[0]?.role;
    if (role !== "otr_trip_core_v2_gateway" && role !== "otr_trip_core_v2_writer")
      throw new Error("CORE_PRINCIPAL_UNAVAILABLE");
    if (role === "otr_trip_core_v2_gateway")
      await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
    try {
      return await readCorePgGraph(lease, tripId);
    } finally {
      if (role === "otr_trip_core_v2_gateway")
        await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
    }
  }
  const commands = createCorePgStorage(
    connection,
    hash,
    {
      verify: async (lease, actor, command, intent, graph) => {
        if (command.command === "CREATE_DOCUMENT") {
          if (!custody) throw new Error("OWNING_CAPABILITY_REQUIRED");
          return await custody.verifyCreateDocument(lease, actor, command);
        }
        await authority.verifySourceIntent(lease, actor, command, intent, graph);
      },
      canReadSourceReceipt: authority.canReadSourceReceipt,
      canReadAudit: async (lease, actor, receipt) => {
        if (receipt.command !== "CREATE_DOCUMENT")
          return authority.canReadAudit(lease, actor, receipt);
        if (!custody) return false;
        const graph = await documentGraph(lease, actor.tripId);
        for (const target of receipt.targetVector) {
          const row = graph.trip_operational_documents.find((r) => r.id === target.id);
          if (
            target.kind !== "DOCUMENT" ||
            !row ||
            !(await custody.canReadDocument(lease, actor, graph, row))
          )
            return false;
        }
        return true;
      },
      audit: async (lease, actor, command, intent) =>
        command.command === "CREATE_DOCUMENT"
          ? {
              evidenceRefs: [
                "custody:" +
                  (command.payload as { custodyProofId: string }).custodyProofId,
              ],
              authorizationRefs: [],
            }
          : authority.audit(lease, actor, command, intent),
      canReadOriginal: async (lease, actor, row) =>
        custody
          ? custody.canReadDocument(
              lease,
              actor,
              await documentGraph(lease, actor.tripId),
              row,
            )
          : false,
    },
    gateMode,
  );
  return {
    commands,
    source: authority.source,
    publishSourceCandidates: authority.publish,
    read,
    ...(custody ? { documentOriginalReader: custody.original } : {}),
    hash,
    readOperation: (actor, trip, operation) =>
      readCorePgOperation(commands, actor, trip, operation, hash),
  };
}

import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import { createCoreSourcePgAuthority } from "./tripCoreV2SourcePgAuthority";
import {
  createCorePgStorage,
  readCorePgOperation,
  type CorePgConnection,
} from "./tripCoreV2PgStorage";
import { createCorePgReader } from "./tripCoreV2PgRead";
import type { CoreHttpConnection } from "./tripCoreV2Http";

// Explicit dormant composition; no credentials, startup caller or capability activation.
export function createCorePgHttpConnection(
  connection: CorePgConnection,
  hash: ImportHash,
): CoreHttpConnection {
  const authority = createCoreSourcePgAuthority(connection, hash);
  const commands = createCorePgStorage(connection, hash, {
    verify: authority.verifySourceIntent,
    canReadSourceReceipt: authority.canReadSourceReceipt,
    canReadAudit: authority.canReadAudit,
    audit: authority.audit,
    canReadOriginal: async () => false,
  });
  return {
    commands,
    source: authority.source,
    publishSourceCandidates: authority.publish,
    read: createCorePgReader(connection, hash),
    hash,
    readOperation: (actor, trip, operation) =>
      readCorePgOperation(commands, actor, trip, operation, hash),
  };
}

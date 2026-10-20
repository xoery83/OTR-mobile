import { createHash } from "node:crypto";
import { z } from "zod";
import { coreHash, coreTableSchemas, coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  coreCanRead,
  type CoreActor,
  type CoreGraph,
} from "../../src/domain/trip/tripCoreV2Mutation";

const requestSchema = z.strictObject({
  actorAccountId: coreUuid,
  tripId: coreUuid,
  documentId: coreUuid,
  contentVersion: z.number().int().positive().safe(),
  sha256: coreHash,
});
export type DocumentOriginalRequest = z.infer<typeof requestSchema>;

export type CurrentDocumentAccess = Readonly<{
  actor: CoreActor;
  graph: CoreGraph;
  accessRevision: number;
}>;
export type OriginalCustodyScope = Readonly<{
  actorAccountId: string;
  tripId: string;
  documentId: string;
  custodyReceiptId: string;
  contentVersion: number;
  sha256: string;
  byteSize: number;
  maxBytes: number;
}>;
export type RetainedOriginal = Readonly<{
  actorAccountId: string;
  tripId: string;
  documentId: string;
  custodyReceiptId: string;
  contentVersion: number;
  sha256: string;
  byteSize: number;
  custody: "PRIVATE_SOURCE_REFERENCE" | "AUTHORIZED_COPY";
  state: "BOUND" | "REVOKED" | "UNAVAILABLE";
  right: "CURRENT_SOURCE_RIGHT" | "CURRENT_COPY_GRANT" | "UNAVAILABLE";
  // The owning custody provider must advance this on retention or rights changes.
  generation: string;
}>;
export type OriginalReadPorts = Readonly<{
  // Must use the authenticated actor and current Core graph/read-state, not a Day cache.
  currentAccess(request: DocumentOriginalRequest): Promise<CurrentDocumentAccess | null>;
  // Must resolve private custody internally and bound its byte read to maxBytes.
  readRetained(
    scope: OriginalCustodyScope,
  ): Promise<(RetainedOriginal & { bytes: Uint8Array }) | null>;
  // Must recheck current Source rights or explicit copy grant and retention.
  currentRetention(scope: OriginalCustodyScope): Promise<RetainedOriginal | null>;
}>;

const unavailable = { status: "UNAVAILABLE" } as const;
type Descriptor = Readonly<{
  revision: number;
  custody: RetainedOriginal["custody"];
  mediaType: string;
  scope: OriginalCustodyScope;
}>;
const MAX_BINARY_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_BYTES = 1024 * 1024;

function authorizedDocument(
  current: CurrentDocumentAccess | null,
  request: DocumentOriginalRequest,
): Descriptor | null {
  if (
    !current ||
    !Number.isSafeInteger(current.accessRevision) ||
    current.accessRevision < 1 ||
    current.actor.accountId !== request.actorAccountId ||
    current.actor.tripId !== request.tripId ||
    !current.actor.active
  )
    return null;
  const matching = current.graph.trip_operational_documents.filter(
    (row) => row.id === request.documentId,
  );
  if (matching.length !== 1) return null;
  const parsed = coreTableSchemas.trip_operational_documents.safeParse(matching[0]);
  if (!parsed.success) return null;
  const row = parsed.data;
  if (
    row.trip_id !== request.tripId ||
    row.hidden_at !== null ||
    row.content_version !== request.contentVersion ||
    row.sha256 !== request.sha256 ||
    (row.custody === "PRIVATE_SOURCE_REFERENCE" &&
      (row.source_representation_id === null || row.storage_object_key !== null)) ||
    (row.custody === "AUTHORIZED_COPY" &&
      (row.source_representation_id !== null || !row.storage_object_key)) ||
    !coreCanRead(current.graph, current.actor, "DOCUMENT", row)
  )
    return null;
  const maxBytes = row.media_type === "text/plain" ? MAX_TEXT_BYTES : MAX_BINARY_BYTES;
  if (row.byte_size > maxBytes) return null;
  return {
    revision: row.revision,
    custody: row.custody,
    mediaType: row.media_type,
    scope: {
      actorAccountId: request.actorAccountId,
      tripId: request.tripId,
      documentId: request.documentId,
      custodyReceiptId: row.custody_receipt_id,
      contentVersion: row.content_version,
      sha256: row.sha256,
      byteSize: row.byte_size,
      maxBytes,
    },
  };
}

function validRetention(value: RetainedOriginal | null, expected: Descriptor) {
  if (!value) return false;
  const scope = expected.scope;
  return (
    value.actorAccountId === scope.actorAccountId &&
    value.tripId === scope.tripId &&
    value.documentId === scope.documentId &&
    value.custodyReceiptId === scope.custodyReceiptId &&
    value.contentVersion === scope.contentVersion &&
    value.sha256 === scope.sha256 &&
    value.byteSize === scope.byteSize &&
    value.custody === expected.custody &&
    value.state === "BOUND" &&
    (expected.custody === "PRIVATE_SOURCE_REFERENCE"
      ? value.right === "CURRENT_SOURCE_RIGHT"
      : value.right === "CURRENT_COPY_GRANT") &&
    typeof value.generation === "string" &&
    value.generation.length > 0 &&
    value.generation.length <= 128
  );
}

// Dormant Backend port. An actual Core reader and retained-object provider must be
// injected before any endpoint can call this; metadata or an Item link grants nothing.
export function createTripDocumentOriginalRead(ports: Partial<OriginalReadPorts> = {}) {
  return {
    async read(authenticatedActorAccountId: string, input: unknown) {
      const request = requestSchema.safeParse(input);
      if (
        !coreUuid.safeParse(authenticatedActorAccountId).success ||
        !request.success ||
        request.data.actorAccountId !== authenticatedActorAccountId ||
        !ports.currentAccess ||
        !ports.readRetained ||
        !ports.currentRetention
      )
        return unavailable;
      try {
        const first = await ports.currentAccess(request.data);
        const document = authorizedDocument(first, request.data);
        if (!document) return unavailable;
        const before = await ports.currentRetention(document.scope);
        if (!validRetention(before, document)) return unavailable;
        const original = await ports.readRetained(document.scope);
        if (
          !original ||
          !validRetention(original, document) ||
          original.generation !== before?.generation ||
          !(original.bytes instanceof Uint8Array) ||
          original.bytes.byteLength !== document.scope.byteSize ||
          original.bytes.byteLength > document.scope.maxBytes ||
          createHash("sha256").update(original.bytes).digest("hex") !==
            document.scope.sha256
        )
          return unavailable;
        const retention = await ports.currentRetention(document.scope);
        const last = await ports.currentAccess(request.data);
        const current = authorizedDocument(last, request.data);
        if (
          !current ||
          last?.accessRevision !== first?.accessRevision ||
          current.revision !== document.revision ||
          current.mediaType !== document.mediaType ||
          current.custody !== document.custody ||
          JSON.stringify(current.scope) !== JSON.stringify(document.scope) ||
          !validRetention(retention, document) ||
          retention?.generation !== original.generation
        )
          return unavailable;
        return {
          status: "AVAILABLE" as const,
          documentId: request.data.documentId,
          contentVersion: request.data.contentVersion,
          sha256: request.data.sha256,
          mediaType: document.mediaType,
          byteSize: document.scope.byteSize,
          bytes: Uint8Array.from(original.bytes),
        };
      } catch {
        return unavailable;
      }
    },
  };
}

// Synthetic immutable-seal fixtures only; no Source registration or runtime authority.
import { createHash, randomUUID } from "node:crypto";
import { vi } from "vitest";
import { SOURCE_PDF_V2_LINUX_PROFILE_SHA } from "../sourcePdfV2LinuxVerifier";
import { PDF_V2_OPTIONS_SHA } from "../sourcePdfV2Contracts";
import { coreHashValue } from "../../../src/domain/trip/tripCoreV2Read";
import { canonicalCoreJson } from "../../../src/domain/trip/tripCoreV2Json";
import type { CorePgLease } from "../tripCoreV2PgStorage";
import type { CoreSourceCatalogV2 } from "../tripCoreV2Source";
const sha = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
const hash = async (v: Uint8Array) => sha(v);
export async function sourcePdfV2ProofFixture(scope?: {
  actorAccountId: string;
  tripId: string;
  sourceId: string;
}) {
  const catalog: CoreSourceCatalogV2 = {
    actorAccountId: scope?.actorAccountId ?? randomUUID(),
    tripId: scope?.tripId ?? randomUUID(),
    sourceId: scope?.sourceId ?? randomUUID(),
    sourceRevision: 1,
    inputCatalogSha256: "a".repeat(64),
    source: { row_revision: 2, current_material_revision: 1 },
    inputs: [],
    candidates: [],
  };
  const originalId = randomUUID(),
    derivedId = randomUUID();
  const text = "甲\nβ",
    pages = [{ pageIndex: 0, start: 0, end: 6 }];
  const body = {
    derivativeVersion: 2 as const,
    accountId: catalog.actorAccountId,
    tripId: catalog.tripId,
    request: {
      derivativeVersion: 2 as const,
      operationId: randomUUID(),
      sourceId: catalog.sourceId,
      sourceRevision: 1,
      sourceRowRevision: 2,
      originalRepresentationId: originalId,
      originalRowRevision: 3,
      derivedRepresentationId: derivedId,
    },
    requestSha256: "a".repeat(64),
    profileId: "OTR_PDF_QPDF_POPPLER_V2",
    profileSha256: SOURCE_PDF_V2_LINUX_PROFILE_SHA,
    producer: "otr-source-pdf-qpdf-poppler/2",
    originalSha256: "b".repeat(64),
    originalByteCount: 2943032,
    textSha256: sha(text),
    textByteCount: 6,
    transformOptionsSha256: PDF_V2_OPTIONS_SHA,
    pageMapSha256: sha(canonicalCoreJson(pages)),
    pages,
  };
  const original = {
    id: originalId,
    source_id: catalog.sourceId,
    introduced_revision: 1,
    row_revision: 3,
    role: "ORIGINAL",
    material_kind: "BINARY",
    mime_type: "application/pdf",
    remote_state: "VERIFIED",
    retention_state: "RETAINED",
    payload_sha256: body.originalSha256,
    byte_count: body.originalByteCount,
    storage_provider: "supabase_storage",
    storage_bucket: "trip-source-material",
    object_key: `v1/${catalog.tripId}/${catalog.sourceId}/${originalId}/payload`,
  };
  const derived = {
    id: derivedId,
    source_id: catalog.sourceId,
    introduced_revision: 1,
    role: "DERIVED",
    material_kind: "TEXT",
    retention_state: "RETAINED",
    parent_ids: [originalId],
    transform_key: "otr.pdf.qpdf-poppler",
    transform_version: "2",
    transform_options_sha256: PDF_V2_OPTIONS_SHA,
    payload_sha256: sha(text),
    byte_count: 6,
    text_content: text,
  };
  const sealed = {
    body,
    seal_sha256: await coreHashValue("otr-source-pdf-seal-v2", body, hash),
  };
  let enabled = true,
    scopeAvailable = false,
    scopeAllowed = false;
  const selections = [{ original, derived }];
  const lease: CorePgLease = {
    retire: vi.fn(),
    async query(sql, args = []) {
      if (sql.includes("AS derived")) return { rows: selections };
      if (sql.includes("page_map_sha256"))
        return { rows: [{ page_map_sha256: body.pageMapSha256 }] };
      if (sql.includes("to_regclass")) return { rows: [{ available: true }] };
      if (sql.includes("SELECT s.body")) return { rows: [sealed] };
      if (sql.includes("SELECT enabled")) return { rows: [{ enabled }] };
      if (sql.includes("to_regprocedure"))
        return { rows: [{ available: scopeAvailable }] };
      if (sql.includes("trip_sustained_universal_pdf_allowed"))
        return {
          rows: [
            {
              allowed:
                scopeAllowed &&
                args[0] === catalog.actorAccountId &&
                args[1] === catalog.tripId,
            },
          ],
        };
      if (sql.includes("SELECT to_jsonb"))
        return { rows: [{ row: args[0] === originalId ? original : derived }] };
      throw Error("Unexpected synthetic SQL");
    },
  };
  return {
    catalog,
    selections,
    originalId,
    derivedId,
    original,
    derived,
    body,
    sealed,
    lease,
    close: () => {
      enabled = false;
    },
    continuousScope: (allowed = true) => {
      scopeAvailable = true;
      scopeAllowed = allowed;
    },
    rehash: async () => {
      sealed.seal_sha256 = await coreHashValue("otr-source-pdf-seal-v2", body, hash);
    },
  };
}

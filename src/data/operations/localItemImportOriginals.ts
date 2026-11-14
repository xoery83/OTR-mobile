import { coreCanRead } from "../../domain/trip/tripCoreV2Mutation";
import { localImportDocumentId } from "../../domain/trip/universalImportIdentity";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { hasImportOriginal, readImportOriginal } from "../files/importOriginalFileStore";
import type { CoreAcceptedSnapshot } from "../repositories/tripCoreV2Repository";

function localItemImportDocuments(
  scope: AccountRequestContext,
  snapshot: CoreAcceptedSnapshot | null,
  itemId?: string,
) {
  if (!snapshot) return [];
  const { actor, graph } = snapshot;
  if (actor.accountId !== scope.accountId || actor.tripId !== scope.tripId) return [];
  if (itemId) {
    const item = graph.itinerary_events.find((row) => row.id === itemId);
    if (!item || item.hidden_at || !coreCanRead(graph, actor, "ITEM", item)) return [];
  }
  const linked = itemId
    ? new Set(
        graph.trip_item_document_links
          .filter(
            (link) =>
              link.active === true &&
              link.trip_id === scope.tripId &&
              link.item_id === itemId,
          )
          .map((link) => link.document_id),
      )
    : null;
  return graph.trip_operational_documents.flatMap((row) => {
    const { id, title, sha256, media_type: mediaType, byte_size: byteCount } = row;
    if (
      (linked !== null && !linked.has(id)) ||
      row.trip_id !== scope.tripId ||
      row.custody !== "LOCAL_ONLY" ||
      row.hidden_at ||
      row.owner_account_id !== scope.accountId ||
      !coreCanRead(graph, actor, "DOCUMENT", row) ||
      typeof id !== "string" ||
      typeof title !== "string" ||
      typeof sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(sha256) ||
      typeof byteCount !== "number" ||
      !Number.isSafeInteger(byteCount) ||
      byteCount < 1 ||
      byteCount > 12 * 1024 * 1024 ||
      (mediaType !== "text/plain" &&
        mediaType !== "application/pdf" &&
        mediaType !== "image/png" &&
        mediaType !== "image/jpeg" &&
        mediaType !== "image/webp" &&
        mediaType !== "image/gif") ||
      id !== localImportDocumentId(scope.accountId, scope.tripId, sha256)
    )
      return [];
    return [
      {
        id,
        title,
        sha256,
        mediaType,
        byteCount,
        originalFilename: title,
        recordedAt: typeof row.created_at === "string" ? row.created_at : null,
        visibility:
          row.visibility === "GROUP"
            ? ("GROUP" as const)
            : row.visibility === "SELECTED_PERSONS"
              ? ("SELECTED_PERSONS" as const)
              : ("PRIVATE" as const),
      },
    ];
  });
}

export async function localItemImportOriginals(
  tripId: string,
  itemId: string | undefined,
  generation: number,
) {
  const [
    { requireAdoptedUserId },
    { readInitializedDatabase },
    { createTripCoreV2Repository },
    { tripCoreSha256Hex },
  ] = await Promise.all([
    import("../auth/authRepository"),
    import("../db/database"),
    import("../repositories/tripCoreV2Repository"),
    import("../repositories/tripCoreSha256"),
  ]);
  const repository = createTripCoreV2Repository(
    await readInitializedDatabase(),
    requireAdoptedUserId,
    tripCoreSha256Hex,
  );
  const scope = await repository.captureContext(tripId);
  if (scope.generation !== generation) throw Error("IMPORT_ORIGINAL_SCOPE_CHANGED");
  const documents = async () => {
    await assertAccountRequestContext(scope, requireAdoptedUserId);
    return localItemImportDocuments(
      scope,
      await repository.acceptedSnapshot(scope),
      itemId,
    );
  };
  return {
    async list() {
      const available = (await documents()).filter(({ sha256, byteCount }) =>
        hasImportOriginal(scope.accountId, sha256, byteCount),
      );
      await assertAccountRequestContext(scope, requireAdoptedUserId);
      return available;
    },
    async metadata() {
      const rows = await documents();
      await assertAccountRequestContext(scope, requireAdoptedUserId);
      return rows;
    },
    async original(id: string) {
      const document = (await documents()).find((entry) => entry.id === id);
      if (!document) return null;
      const bytes = await readImportOriginal(
        scope.accountId,
        document.sha256,
        document.byteCount,
      );
      if (!bytes) return null;
      const current = (await documents()).find((entry) => entry.id === id);
      if (current?.sha256 !== document.sha256 || current.byteCount !== document.byteCount)
        return null;
      return { document: current, bytes };
    },
  };
}

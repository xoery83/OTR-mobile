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
  metadataOnly = false,
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
      (!metadataOnly && row.owner_account_id !== scope.accountId) ||
      typeof row.owner_account_id !== "string" ||
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
      id !== localImportDocumentId(row.owner_account_id, scope.tripId, sha256)
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
        canOpenOriginal: row.owner_account_id === scope.accountId,
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
  const documents = async (metadataOnly = false) => {
    await assertAccountRequestContext(scope, requireAdoptedUserId);
    return localItemImportDocuments(
      scope,
      await repository.acceptedSnapshot(scope),
      itemId,
      metadataOnly,
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
      const rows = await documents(true);
      await assertAccountRequestContext(scope, requireAdoptedUserId);
      return rows.map((row) => ({
        ...row,
        localAvailable:
          row.canOpenOriginal &&
          hasImportOriginal(scope.accountId, row.sha256, row.byteCount),
      }));
    },
    async relationships(id: string) {
      if (!(await documents(true)).some((row) => row.id === id)) return [];
      const snapshot = await repository.acceptedSnapshot(scope);
      await assertAccountRequestContext(scope, requireAdoptedUserId);
      if (
        !snapshot ||
        !localItemImportDocuments(scope, snapshot, undefined, true).some(
          (row) => row.id === id,
        ) ||
        snapshot.actor.accountId !== scope.accountId ||
        snapshot.actor.tripId !== scope.tripId
      )
        return [];
      const { graph, actor } = snapshot;
      const links = new Set(
        graph.trip_item_document_links
          .filter(
            (link) =>
              link.active === true &&
              link.trip_id === scope.tripId &&
              link.document_id === id,
          )
          .map((link) => link.item_id),
      );
      return graph.itinerary_events
        .filter(
          (item) =>
            links.has(item.id) &&
            item.trip_id === scope.tripId &&
            !item.hidden_at &&
            coreCanRead(graph, actor, "ITEM", item),
        )
        .map((item) => ({
          id: String(item.id),
          title: typeof item.title === "string" ? item.title : "",
          family:
            typeof item.experience_family === "string" ? item.experience_family : "",
        }));
    },
    async batches(id: string) {
      const document = (await documents()).find((row) => row.id === id);
      if (!document) return [];
      const { getDefaultCaptureSubmissionRepository } =
        await import("./defaultCaptureSubmission");
      const submissions = await getDefaultCaptureSubmissionRepository();
      const jobs = [] as Awaited<ReturnType<typeof submissions.list>>;
      let before: { createdAt: string; batchId: string } | undefined;
      for (;;) {
        const page = await submissions.list({ limit: 100, before }, scope);
        await assertAccountRequestContext(scope, requireAdoptedUserId);
        jobs.push(
          ...page.filter(
            (job) =>
              job.batch.accountId === scope.accountId &&
              job.batch.context.tripPrior?.id === scope.tripId &&
              job.inputs.some(
                (input) =>
                  input.state === "ACCEPTED" &&
                  input.contentSha256 === document.sha256 &&
                  input.contentByteCount === document.byteCount,
              ),
          ),
        );
        if (page.length < 100) break;
        const last = page.at(-1)!;
        before = { createdAt: last.batch.createdAt, batchId: last.batch.batchId };
      }
      const authorized = await documents();
      if (!authorized.some((row) => row.id === id)) return [];
      const result = [];
      for (const job of jobs) {
        const linkedDocuments = authorized.filter((row) =>
          job.inputs.some(
            (input) =>
              input.state === "ACCEPTED" &&
              input.contentSha256 === row.sha256 &&
              input.contentByteCount === row.byteCount,
          ),
        );
        const otherOriginals: import("../repositories/importDocumentsRepository").ImportDocument[] =
          [];
        const remaining = job.inputs.filter(
          (input) =>
            input.state === "ACCEPTED" &&
            input.captureId &&
            !linkedDocuments.some(
              (row) =>
                row.sha256 === input.contentSha256 &&
                row.byteCount === input.contentByteCount,
            ),
        );
        if (remaining.length) {
          const { getDefaultImportDocumentsRepository } =
            await import("./defaultImportDocuments");
          const originals = await getDefaultImportDocumentsRepository();
          for (const input of remaining) {
            for (const directory of ["TRIP", "PERSONAL_INBOX"] as const) {
              try {
                const retained = await originals.read(
                  { ...scope, tripId: directory === "TRIP" ? scope.tripId : "" },
                  directory,
                  input.captureId!,
                );
                await assertAccountRequestContext(scope, requireAdoptedUserId);
                if (
                  retained.payloadId === input.payloadId &&
                  retained.sha256 === input.contentSha256 &&
                  retained.byteCount === input.contentByteCount
                )
                  otherOriginals.push(retained);
                break;
              } catch (error) {
                if (
                  !(error instanceof Error) ||
                  !["DOCUMENTS_NOT_FOUND", "DOCUMENTS_TRIP_ACCESS"].includes(
                    error.message,
                  )
                )
                  throw error;
              }
            }
          }
        }
        result.push({
          jobId: job.batch.jobId,
          batchId: job.batch.batchId,
          createdAt: job.batch.createdAt,
          documents: linkedDocuments,
          otherOriginals,
        });
      }
      return result;
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

import { localImportDocumentId } from "../../domain/trip/universalImportIdentity";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  universalV3Manifest,
  type UniversalV3Manifest,
} from "../api/universalV3Contracts";
import type { createUniversalImportTransport } from "../api/universalImportTransport";
import type { CaptureJobReadModel } from "../../domain/capture/captureSubmission";
import { getDefaultLocalCaptureInboxRepository } from "../repositories/defaultLocalCaptureInboxRepository";
import {
  readImportOriginal,
  retainImportOriginal,
} from "../files/importOriginalFileStore";

export async function stageLocalFirstCapture(
  context: AccountRequestContext,
  model: CaptureJobReadModel,
  deps: {
    accountId(): Promise<string>;
    transport: Pick<
      ReturnType<typeof createUniversalImportTransport>,
      "startLocalFirst" | "uploadLocalFirst" | "readLocalFirst"
    >;
  },
) {
  const current = () => assertAccountRequestContext(context, deps.accountId);
  await current();
  if (
    context.accountId !== model.batch.accountId ||
    context.tripId !== (model.batch.context?.tripPrior?.id ?? model.assignedTripId) ||
    model.inputs.length < 1 ||
    model.inputs.length > 5
  )
    throw Error("UNIVERSAL_V3_CAPTURE_SCOPE");
  const inbox = await getDefaultLocalCaptureInboxRepository();
  const files: UniversalV3Manifest["files"] = [];
  for (const input of model.inputs) {
    if (input.state !== "ACCEPTED" || !input.captureId)
      throw Error("UNIVERSAL_V3_CAPTURE_PENDING");
    const { capture, bytes } = await inbox.getForSourceHandoff(input.captureId);
    if (
      capture.accountId !== context.accountId ||
      capture.tripId !== context.tripId ||
      capture.id !== input.captureId ||
      capture.payloadId !== input.payloadId ||
      capture.sha256 !== input.contentSha256 ||
      capture.byteCount !== input.contentByteCount
    )
      throw Error("UNIVERSAL_V3_CAPTURE_SCOPE");
    const mediaType =
      capture.kind === "TEXT" ? "text/plain" : capture.declaredContentType;
    await current();
    await retainImportOriginal(context.accountId, capture.sha256, bytes);
    files.push(
      universalV3Manifest.shape.files.element.parse({
        fileId: input.id,
        documentId: localImportDocumentId(
          context.accountId,
          context.tripId,
          capture.sha256,
        ),
        sha256: capture.sha256,
        length: capture.byteCount,
        mediaType,
      }),
    );
  }
  const manifest = universalV3Manifest.parse({
    version: "otr.import.local-first/1",
    tripId: context.tripId,
    mode: "UNIVERSAL",
    files: files.filter(
      (file, index) =>
        files.findIndex((entry) => entry.documentId === file.documentId) === index,
    ),
  });
  const analysis = model.batch.batchId;
  const intake = await deps.transport.startLocalFirst(context, analysis, manifest);
  for (const missing of intake.missingFiles) {
    const file = manifest.files.find(({ fileId }) => missing === fileId);
    if (!file) throw Error("UNIVERSAL_V3_CAPTURE_SCOPE");
    await current();
    const bytes = await readImportOriginal(context.accountId, file.sha256, file.length);
    if (!bytes) throw Error("UNIVERSAL_V3_CAPTURE_PENDING");
    await deps.transport.uploadLocalFirst(context, analysis, file.fileId, bytes);
  }
  await current();
  return deps.transport.readLocalFirst(context, analysis);
}

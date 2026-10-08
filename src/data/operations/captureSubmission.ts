import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import type { CaptureSelection } from "@/features/capture/captureStaging";
import type { CapturePayloadInput } from "@/data/files/capturePayloadReader";
import type {
  CaptureJobReadModel,
  SubmissionRequest,
} from "@/domain/capture/captureSubmission";
import type { createCaptureSubmissionRepository } from "@/data/repositories/captureSubmissionRepository";

// A session owns only this explicit Add request, never a scheduler or byte store.
export function createCaptureSubmissionSession(dependencies: {
  repository: ReturnType<typeof createCaptureSubmissionRepository>;
  getActiveUserId: () => Promise<string>;
  newId(): string;
  now(): string;
  context?: AccountRequestContext;
  lineageRevisions?: Readonly<Record<string, number>>;
  open(selection: CaptureSelection): Promise<CapturePayloadInput>;
}) {
  let frozen: Promise<{
    context: AccountRequestContext;
    request: SubmissionRequest;
    sources: ReadonlyMap<string, () => Promise<CapturePayloadInput>>;
  }> | null = null;
  let running: Promise<CaptureJobReadModel> | null = null;
  let registeredJobId: string | null = null;
  return {
    submit(
      selections: readonly CaptureSelection[],
      onProgress: (model: CaptureJobReadModel) => void,
      tripPrior: string | null = null,
      continuesFromInputId: string | null = null,
    ) {
      if (running) return running;
      if (!frozen) {
        // Copy before the first await. The owner/generation is captured at this Add.
        const roster = selections.map((selection) => ({ ...selection }));
        const createdAt = dependencies.now();
        const batchId = dependencies.newId(),
          jobId = dependencies.newId(),
          submissionKey = dependencies.newId(),
          contextId = dependencies.newId();
        const declarations = roster.map((selection, ordinal) => ({
          id: dependencies.newId(),
          itemKey: dependencies.newId(),
          ordinal,
          acquisitionSource: selection.source,
          kind: selection.source === "photos" ? ("IMAGE" as const) : ("FILE" as const),
          originalFilename: selection.name,
          declaredContentType: selection.typeHint,
          continuesFromInputId: ordinal === 0 ? continuesFromInputId : null,
        }));
        frozen = (
          dependencies.context
            ? Promise.resolve(dependencies.context)
            : captureAccountRequestContext("", dependencies.getActiveUserId)
        ).then(async (context) => {
          await assertAccountRequestContext(context, dependencies.getActiveUserId);
          return {
            context,
            request: {
              formatVersion: 1,
              manifestVersion: 1,
              accountId: context.accountId,
              batchId,
              jobId,
              submissionKey,
              createdAt,
              context: {
                id: contextId,
                version: 1,
                accountId: context.accountId,
                batchId,
                observedAt: createdAt,
                clock: "DEVICE_WALL",
                entrySurface: "CAPTURE",
                tripPrior: tripPrior
                  ? { id: tripPrior, origin: "PRIOR", observedAt: createdAt }
                  : null,
              },
              inputs: declarations,
            },
            sources: new Map(
              declarations.map((item, n) => [
                item.id,
                () => dependencies.open(roster[n]),
              ]),
            ),
          };
        });
      }
      running = frozen.then(({ context, request, sources }) =>
        dependencies.repository.submit(
          request,
          sources,
          (model) => {
            registeredJobId = model.batch.jobId;
            onProgress(model);
          },
          context,
          dependencies.lineageRevisions,
        ),
      );
      running
        .finally(() => {
          running = null;
        })
        .catch(() => {});
      return running;
    },
    // Re-read exact registered facts after failure; no implicit new request.
    async recover() {
      if (!frozen) return null;
      const { context, request } = await frozen;
      await assertAccountRequestContext(context, dependencies.getActiveUserId);
      return dependencies.repository.recoverSubmission(request.submissionKey, context);
    },
    getRegisteredJobId: () => registeredJobId,
  };
}

export function createCaptureRecoveryAction(
  dependencies: Parameters<typeof createCaptureSubmissionSession>[0] & {
    pick(source: CaptureSelection["source"]): Promise<readonly CaptureSelection[]>;
  },
  jobId: string,
  inputId: string,
  expectedRevision: number,
) {
  const contextPromise = dependencies.context
    ? Promise.resolve(dependencies.context)
    : captureAccountRequestContext("", dependencies.getActiveUserId);
  let session: ReturnType<typeof createCaptureSubmissionSession> | null = null;
  let retainedSelections: readonly CaptureSelection[] = [];
  let running: Promise<CaptureJobReadModel> | null = null;
  return {
    run(onProgress: (model: CaptureJobReadModel) => void) {
      if (running) return running;
      running = (async () => {
        const context = await contextPromise;
        await assertAccountRequestContext(context, dependencies.getActiveUserId);
        // A recovery submission keeps its original request even when no ACK was received.
        if (session) return session.submit(retainedSelections, onProgress, null, inputId);
        const job = await dependencies.repository.reopen(jobId, context);
        const item = job.inputs.find((i) => i.id === inputId);
        if (!item) throw new Error("Stale recovery action");
        if (item.state === "ACCEPTED") return job;
        if (item.revision !== expectedRevision) throw new Error("Stale recovery action");
        const selections = await dependencies.pick(item.acquisitionSource);
        await assertAccountRequestContext(context, dependencies.getActiveUserId);
        if (!selections.length) return job;
        if (selections.length !== 1)
          throw new Error("Recovery requires exactly one selection");
        const current = (
          await dependencies.repository.reopen(jobId, context)
        ).inputs.find((i) => i.id === inputId);
        if (
          !current ||
          current.revision !== expectedRevision ||
          current.state === "ACCEPTED"
        )
          throw new Error("Stale recovery action");
        if (item.contentSha256)
          return dependencies.repository.resume(
            jobId,
            inputId,
            expectedRevision,
            () => dependencies.open(selections[0]),
            context,
          );
        retainedSelections = selections.map((selection) => ({ ...selection }));
        session = createCaptureSubmissionSession({
          ...dependencies,
          context,
          lineageRevisions: { [inputId]: expectedRevision },
        });
        return session.submit(retainedSelections, onProgress, null, inputId);
      })();
      running
        .finally(() => {
          running = null;
        })
        .catch(() => {});
      return running;
    },
    async recover() {
      const context = await contextPromise;
      await assertAccountRequestContext(context, dependencies.getActiveUserId);
      return session ? session.recover() : dependencies.repository.reopen(jobId, context);
    },
  };
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import type {
  CaptureJobReadModel,
  CaptureSubmissionInput,
} from "@/domain/capture/captureSubmission";
import type { createDefaultUniversalPhotoRelevanceActions } from "@/data/operations/defaultUniversalPhotoRelevance";
import type { PhotoRelevanceScreen } from "@/data/operations/universalPhotoRelevanceActions";
import type { StoredPhotoImportDecision } from "@/data/repositories/capturePhotoImportDecisionRepository";

type Actions = Awaited<ReturnType<typeof createDefaultUniversalPhotoRelevanceActions>>;
type Choice = "CONTINUE_WITH_AI" | "SKIP";
type Phase = "READ" | "SCREEN" | "CHOOSE";
export type PhotoRelevanceValue = PhotoRelevanceScreen & { originalChanged: boolean };
type Scope = {
  key: string;
  generation: number;
  accountId: string;
  jobId: string;
  inputId: string;
  controller: AbortController;
  running: boolean;
  actions?: Promise<Actions>;
};
type View = {
  scope: Scope | null;
  value: PhotoRelevanceValue | null;
  busy: Phase | null;
  unavailable: boolean;
};
const empty: View = { scope: null, value: null, busy: null, unavailable: false };
const fromStored = (
  saved: StoredPhotoImportDecision | null,
): PhotoRelevanceValue | null =>
  saved
    ? {
        revision: saved.revision,
        decision: saved.decision,
        persisted: true,
        originalChanged: saved.status === "ORIGINAL_CHANGED",
      }
    : null;

// One local Photo input/view, not Task/Activity/paid execution ownership.
export function useUniversalPhotoRelevance(
  model: CaptureJobReadModel,
  input: CaptureSubmissionInput,
  isCurrent: () => boolean,
) {
  const accountId = model.batch.accountId,
    jobId = model.batch.jobId,
    inputId = input.id;
  const key = JSON.stringify([
    accountId,
    model.batch.batchId,
    jobId,
    input.id,
    input.ordinal,
    input.revision,
    input.state,
    input.kind,
    input.acquisitionSource,
    input.captureId,
    input.captureRevision,
    input.payloadId,
    input.contentSha256,
    input.contentByteCount,
    input.declaredContentType,
  ]);
  const generation = getAccountGeneration(),
    visible = isCurrent();
  const eligible =
    input.kind === "IMAGE" &&
    input.state === "ACCEPTED" &&
    !!input.captureId &&
    !!input.payloadId &&
    ["image/jpeg", "image/png"].includes(input.declaredContentType ?? "");
  const latest = useRef({ key, view: isCurrent });
  const owner = useRef<Scope | null>(null);
  const [view, setView] = useState<View>(empty);
  useLayoutEffect(() => {
    latest.current = { key, view: isCurrent };
    const scope = owner.current;
    if (
      scope &&
      (scope.key !== key || scope.generation !== generation || !visible || !eligible)
    )
      scope.controller.abort();
  }, [key, generation, visible, eligible, isCurrent]);
  const current = useCallback(
    (scope: Scope) =>
      owner.current === scope &&
      !scope.controller.signal.aborted &&
      scope.key === latest.current.key &&
      scope.generation === getAccountGeneration() &&
      latest.current.view(),
    [],
  );
  const actions = useCallback(
    (scope: Scope) => {
      if (!scope.actions)
        scope.actions = (async () => {
          const [
            { requireActiveUserId },
            { createDefaultUniversalPhotoRelevanceActions },
          ] = await Promise.all([
            import("@/data/auth/authRepository"),
            import("@/data/operations/defaultUniversalPhotoRelevance"),
          ]);
          if (!current(scope)) throw new Error("PHOTO_IMPORT_CANCELLED");
          const context = await captureAccountRequestContext("", requireActiveUserId);
          if (
            !current(scope) ||
            context.accountId !== scope.accountId ||
            context.generation !== scope.generation
          )
            throw new Error("PHOTO_IMPORT_CANCELLED");
          return createDefaultUniversalPhotoRelevanceActions(
            context,
            scope.controller.signal,
          );
        })().catch((error) => {
          scope.actions = undefined;
          throw error;
        });
      return scope.actions;
    },
    [current],
  );
  const run = useCallback(
    async (
      scope: Scope | null,
      busy: Phase,
      work: (api: Actions) => Promise<PhotoRelevanceValue | null>,
    ) => {
      if (!scope || !current(scope) || scope.running) return;
      scope.running = true;
      try {
        const api = await actions(scope);
        if (!current(scope)) {
          scope.controller.abort();
          return;
        }
        setView((previous) =>
          current(scope)
            ? {
                scope,
                value: previous.scope === scope ? previous.value : null,
                busy,
                unavailable: false,
              }
            : previous,
        );
        const value = await work(api);
        if (!current(scope)) {
          scope.controller.abort();
          return;
        }
        setView((previous) =>
          current(scope) ? { scope, value, busy: null, unavailable: false } : previous,
        );
      } catch {
        if (current(scope))
          setView((previous) =>
            current(scope)
              ? {
                  scope,
                  value: previous.scope === scope ? previous.value : null,
                  busy: null,
                  unavailable: true,
                }
              : previous,
          );
        else scope.controller.abort();
      } finally {
        scope.running = false;
      }
    },
    [actions, current],
  );
  useEffect(() => {
    if (!eligible || !visible) return;
    const scope: Scope = {
      key,
      generation,
      accountId,
      jobId,
      inputId,
      controller: new AbortController(),
      running: false,
    };
    owner.current = scope;
    const unsubscribe = subscribeAccountGeneration(() => {
      scope.controller.abort();
      if (owner.current === scope) {
        owner.current = null;
        setView((previous) => (previous.scope === scope ? empty : previous));
      }
    });
    // Reopen is local read only. No OCR, automatic choice, polling or dispatch.
    void run(scope, "READ", async (api) => fromStored(await api.read(jobId, inputId)));
    return () => {
      unsubscribe();
      scope.controller.abort();
      if (owner.current === scope) owner.current = null;
    };
  }, [key, generation, accountId, jobId, inputId, eligible, visible, current, run]);
  const scope = view.scope;
  const owns =
    scope !== null &&
    scope.key === key &&
    scope.generation === generation &&
    !scope.controller.signal.aborted &&
    eligible &&
    visible;
  const shown = owns ? view : empty;
  const value = shown.value;
  return {
    eligible,
    value,
    busy: owns ? shown.busy : eligible && visible ? ("READ" as const) : null,
    unavailable: shown.unavailable,
    canChoose:
      owns &&
      !shown.unavailable &&
      shown.busy === null &&
      value !== null &&
      (!value.originalChanged || !value.persisted),
    read: () =>
      run(owns ? scope : null, "READ", async (api) =>
        fromStored(await api.read(jobId, inputId)),
      ),
    screen: () =>
      run(owns ? scope : null, "SCREEN", async (api) => {
        const screened = await api.screen(jobId, inputId);
        return { ...screened, originalChanged: !screened.persisted };
      }),
    choose: (choice: Choice) => {
      if (!value || shown.unavailable || (value.originalChanged && value.persisted))
        return Promise.resolve();
      // Capture the observation/revision actually shown, never a later value.
      return run(owns ? scope : null, "CHOOSE", async (api) =>
        fromStored(await api.choose(jobId, value.revision, value.decision, choice)),
      );
    },
  };
}

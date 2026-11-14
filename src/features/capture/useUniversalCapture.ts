import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type {
  UniversalTaskActivity,
  UniversalImportResult,
} from "@/data/api/universalImportContracts";

import type { UniversalV3ExecutionStatus } from "@/data/api/universalV3Contracts";
import {
  captureAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { getAccountGeneration } from "@/data/auth/accountGeneration";

import { readLocalSession } from "@/data/auth/authRepository";
import {
  openUniversalCaptureBackend,
  isCaptureRequestError,
  parsePreparedUniversalBatch,
  type UniversalCaptureBackend,
} from "@/data/operations/universalCaptureConsumer";
import { createUniversalCaptureConsumer } from "@/data/operations/universalCaptureConsumer";

export function useUniversalCapture(
  model: CaptureJobReadModel,
  isCurrent: () => boolean,
) {
  const [localFirst, setLocalFirst] = useState<UniversalV3ExecutionStatus | null>(null);
  const [localFirstSelected, setLocalFirstSelected] = useState<boolean | null>(
    process.env.EXPO_PUBLIC_OTR_UNIVERSAL_LOCAL_FIRST_ENABLED === "true" ? null : false,
  );
  const [activity, setActivity] = useState<UniversalTaskActivity | null>(null);
  const [result, setResult] = useState<UniversalImportResult | null>(null);
  const [busy, setBusy] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  const [formatUnavailable, setFormatUnavailable] = useState(false);
  const [photoReviewRequired, setPhotoReviewRequired] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [canStart, setCanStart] = useState(true);
  const [queued, setQueued] = useState(false);
  const [startPending, setStartPending] = useState(false);
  const [reading, setReading] = useState(false);
  const deferredStart = useRef(false),
    executing = useRef(false);
  const generation = useRef(getAccountGeneration());
  const alive = useRef(true),
    running = useRef(false);
  const initialScope = useRef(
    `${model.batch.accountId}:${model.batch.batchId}:${model.batch.context?.tripPrior?.id ?? model.assignedTripId ?? ""}`,
  );
  const scope = useRef(
    `${model.batch.accountId}:${model.batch.batchId}:${model.batch.context?.tripPrior?.id ?? model.assignedTripId ?? ""}`,
  );
  const currentRef = useRef(isCurrent);
  useLayoutEffect(() => {
    const nextScope = `${model.batch.accountId}:${model.batch.batchId}:${model.batch.context?.tripPrior?.id ?? model.assignedTripId ?? ""}`;
    if (
      scope.current !== nextScope ||
      !isCurrent() ||
      generation.current !== getAccountGeneration()
    ) {
      deferredStart.current = false;
      setStartPending(false);
    }
    scope.current = nextScope;
    currentRef.current = isCurrent;
  }, [
    isCurrent,
    model.batch.accountId,
    model.batch.batchId,
    model.batch.context?.tripPrior?.id,
    model.assignedTripId,
  ]);
  const controller = useRef<AbortController | null>(null);
  const localFirstTransport = useRef<
    | {
        context: AccountRequestContext;
        transport: UniversalCaptureBackend;
        accountId(): Promise<string>;
      }
    | false
    | null
  >(null);
  const localFirstState = useRef<UniversalV3ExecutionStatus | null>(null);
  const consumer = useRef<ReturnType<typeof createUniversalCaptureConsumer> | null>(null);
  const scopeCurrent = () =>
    alive.current &&
    initialScope.current === scope.current &&
    generation.current === getAccountGeneration();
  const current = () => scopeCurrent() && currentRef.current();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  const retainedStartEnabled =
    process.env.EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED === "true" &&
    process.env.EXPO_PUBLIC_OTR_UNIVERSAL_PDF_ENABLED === "true" &&
    process.env.EXPO_PUBLIC_OTR_UNIVERSAL_PNG_ENABLED === "true";
  async function run(execute: boolean) {
    if (!current() || (execute && !model.batch.context?.tripPrior?.id)) return;
    if (running.current) {
      if (execute && !executing.current && !deferredStart.current) {
        deferredStart.current = true;
        setStartPending(true);
        if (
          retainedStartEnabled &&
          (process.env.EXPO_PUBLIC_OTR_UNIVERSAL_LOCAL_FIRST_ENABLED !== "true" ||
            localFirstTransport.current === false)
        ) {
          controller.current?.abort();
        }
      }
      return;
    }
    executing.current = execute;
    setReading(!execute);
    running.current = true;
    setBusy(true);
    setUnavailable(false);
    if (execute) setPhotoReviewRequired(false);
    setAttempted(true);
    try {
      const trip = model.batch.context?.tripPrior?.id ?? model.assignedTripId;
      if (
        trip &&
        process.env.EXPO_PUBLIC_OTR_UNIVERSAL_LOCAL_FIRST_ENABLED === "true" &&
        localFirstTransport.current !== false
      ) {
        const analysis = model.batch.batchId;
        if (!localFirstTransport.current) {
          const baseUrl = process.env.EXPO_PUBLIC_OTR_API_BASE_URL;
          if (!baseUrl) throw Error("UNIVERSAL_BACKEND_UNAVAILABLE");
          controller.current = new AbortController();
          const accountId = async () => {
            const id = (await readLocalSession())?.identity?.userId;
            if (!id) throw Error("UNIVERSAL_ACCOUNT_UNAVAILABLE");
            return id;
          };
          const context = await captureAccountRequestContext(trip, accountId);
          if (!current() || context.accountId !== model.batch.accountId)
            throw Error("UNIVERSAL_CAPTURE_STALE");
          const transport = openUniversalCaptureBackend(accountId, {
            signal: controller.current.signal,
            assertCurrent: () => {
              if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
            },
          });
          const capability = await transport
            .localFirstCapability(context, analysis)
            .catch((error) => {
              if (isCaptureRequestError(error) && error.status === 404)
                return { localFirst: false, existing: null };
              throw error;
            });
          if (!current()) return;
          localFirstTransport.current = capability.localFirst
            ? { context, transport, accountId }
            : false;
          setLocalFirstSelected(capability.localFirst);
          if (capability.localFirst) {
            localFirstState.current = capability.existing;
            setLocalFirst(capability.existing);
          }
        }
        const v3 = localFirstTransport.current;
        if (v3) {
          const stage = localFirstState.current?.state;
          if (
            execute &&
            stage !== "PROCESSING" &&
            stage !== "REVIEW_READY" &&
            stage !== "OUTCOME_UNKNOWN"
          ) {
            if (!current()) return;
            const { stageLocalFirstCapture } =
              await import("@/data/operations/universalV3Capture");
            await stageLocalFirstCapture(v3.context, model, {
              ...v3,
              assertCurrent: () => {
                if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
              },
            });
          }
          const state = await v3.transport.readLocalFirstExecution(v3.context, analysis);
          if (current()) {
            localFirstState.current = state;
            setLocalFirst(state);
          }
          return;
        }
      }
      if (!consumer.current) {
        const baseUrl = process.env.EXPO_PUBLIC_OTR_API_BASE_URL;
        if (!baseUrl) throw Error("UNIVERSAL_BACKEND_UNAVAILABLE");
        controller.current = new AbortController();
        const getAccountId = async () => {
          const id = (await readLocalSession())?.identity?.userId;
          if (!id) throw Error("UNIVERSAL_ACCOUNT_UNAVAILABLE");
          return id;
        };
        const transport = openUniversalCaptureBackend(getAccountId, {
          signal: controller.current.signal,
          assertCurrent: () => {
            if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
          },
        });
        consumer.current = createUniversalCaptureConsumer({
          getAccountId,
          transport,
          isCurrent: current,
          continuous: process.env.EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED === "true",
          materialContinuation: {
            transport,
            verifyLocalSubmission: async (context, job) => {
              const [
                { assertDefaultUniversalPhotoConsent },
                { canonicalSubmission },
                { captureStorageDependencies },
              ] = await Promise.all([
                import("@/data/operations/defaultUniversalPhotoConsent"),
                import("@/domain/capture/captureSubmission"),
                import("@/data/repositories/defaultLocalCaptureInboxRepository"),
              ]);
              const assertCurrent = () => {
                if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
              };
              assertCurrent();
              await assertDefaultUniversalPhotoConsent(context, job, {
                getAccountId,
                assertCurrent,
              });
              return captureStorageDependencies.sha256(
                new TextEncoder().encode(canonicalSubmission(job.batch)),
              );
            },
          },
          resumeTask: async (context, binding) => {
            const { assertDefaultUniversalPhotoConsent } =
              await import("@/data/operations/defaultUniversalPhotoConsent");
            await assertDefaultUniversalPhotoConsent(context, model, {
              getAccountId,
              assertCurrent: () => {
                if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
              },
            });
            if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
            await transport.resume(context, binding);
          },
          ...(retainedStartEnabled
            ? {
                startRetained: async (context, job) => {
                  const { prepareDefaultUniversalCaptureSources } =
                    await import("@/data/operations/defaultUniversalOriginalSource");
                  return parsePreparedUniversalBatch(
                    await prepareDefaultUniversalCaptureSources(context, job, {
                      baseUrl,
                      getAccountId,
                      assertCurrent: () => {
                        if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
                      },
                      pendingPdfProfile: "OTR_PDF_CAPTURE_ORIGINAL_V1",
                      pendingPngProfile: "OTR_PNG_CAPTURE_ORIGINAL_V1",
                      startRetained: (input) => transport.prepareRetained(context, input),
                      readMaterialIntake: (batchId) =>
                        transport.materialIntake(context, batchId),
                    }),
                  );
                },
              }
            : {}),
          prepareSources: async (context, job) => {
            if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
            const { prepareDefaultUniversalCaptureSources } =
              await import("@/data/operations/defaultUniversalOriginalSource");
            return prepareDefaultUniversalCaptureSources(context, job, {
              baseUrl,
              ...(process.env.EXPO_PUBLIC_OTR_UNIVERSAL_PDF_ENABLED === "true"
                ? {
                    pendingPdfProfile: "OTR_PDF_CAPTURE_ORIGINAL_V1" as const,
                  }
                : {}),
              ...(process.env.EXPO_PUBLIC_OTR_UNIVERSAL_PNG_ENABLED === "true"
                ? {
                    pendingPngProfile: "OTR_PNG_CAPTURE_ORIGINAL_V1" as const,
                    preparePngOriginal: async (
                      pngContext: import("@/data/auth/accountRequestContext").AccountRequestContext,
                      input: Parameters<
                        NonNullable<
                          Parameters<
                            typeof prepareDefaultUniversalCaptureSources
                          >[2]["preparePngOriginal"]
                        >
                      >[1],
                    ) => {
                      if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
                      const { prepareAdmittedPngOriginal } =
                        await import("@/data/operations/universalPngOriginalPreparation");
                      const { openUniversalPngSourceBackend } =
                        await import("@/data/operations/universalCaptureConsumer");
                      const { captureStorageDependencies } =
                        await import("@/data/repositories/defaultLocalCaptureInboxRepository");
                      const assertCurrent = () => {
                        if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
                      };
                      assertCurrent();
                      await prepareAdmittedPngOriginal(pngContext, input, {
                        getAccountId,
                        hash: captureStorageDependencies.sha256,
                        assertCurrent,
                        signal: controller.current?.signal,
                        port: await openUniversalPngSourceBackend(getAccountId, {
                          signal: controller.current?.signal,
                          assertRequestCurrent: assertCurrent,
                        }),
                      });
                    },
                  }
                : {}),
              ...(process.env.EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED === "true"
                ? {
                    prepareTask: async (
                      input: import("@/data/api/universalImportContracts").UniversalBatchPrepare,
                    ) => {
                      try {
                        return await transport.prepare(context, input);
                      } catch (error) {
                        if (
                          !current() ||
                          (isCaptureRequestError(error) &&
                            error.status !== undefined &&
                            [400, 401, 403, 404, 405, 413, 422].includes(error.status))
                        )
                          throw error;
                        // The owning GET reconciles a prepare whose receipt could not be confirmed.
                        return null;
                      }
                    },
                  }
                : {}),
              getAccountId: async () => {
                if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
                return getAccountId();
              },
              assertCurrent: () => {
                if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
              },
            });
          },
        });
      }
      const next = await consumer.current[execute ? "start" : "recover"](model);
      if (current()) {
        setResult(next);
        if (next !== null) setPhotoReviewRequired(false);
        setUnavailable(next === null && !consumer.current.queued);
      }
    } catch (error) {
      if (current())
        setFormatUnavailable(
          error instanceof Error && error.message === "UNIVERSAL_V3_FILE_FORMAT",
        );
      let code = "";
      try {
        code = isCaptureRequestError(error)
          ? (error.code ?? "")
          : error instanceof Error
            ? error.message
            : "";
      } catch {
        // Error metadata must not interrupt recovery.
      }
      const needsPhotoReview = code === "UNIVERSAL_PHOTO_REVIEW_REQUIRED";
      if (execute && current() && needsPhotoReview) setPhotoReviewRequired(true);
      if (execute && current()) {
        try {
          console.info(
            JSON.stringify({
              event: "universal_capture_failed",
              code: [
                "UNIVERSAL_PHOTO_REVIEW_REQUIRED",
                "UNIVERSAL_SOURCE_PREPARATION_BLOCKED",
                "SOURCE_NOT_ADMITTED",
                "SOURCE_PIN_STALE",
                "CAPTURE_SOURCE_TRIP_ACCESS",
                "UNIVERSAL_PREPARATION_UNAVAILABLE",
                "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
                "TASK_NOT_FOUND",
                "UNIVERSAL_CAPTURE_NOT_QUALIFIED",
                "UNIVERSAL_CAPTURE_ORIGINALS_MISMATCH",
                "UNIVERSAL_CAPTURE_SCOPE_MISMATCH",
                "OWNING_TASK_READER_UNAVAILABLE",
                "INVALID_REQUEST",
              ].includes(code)
                ? code
                : "UNCLASSIFIED",
            }),
          );
        } catch {
          // Diagnostics cannot change the normal failure or recovery path.
        }
      }
      if (current())
        setUnavailable(
          !needsPhotoReview &&
            !(
              isCaptureRequestError(error) &&
              error.status === 404 &&
              error.code === "TASK_NOT_FOUND"
            ),
        );
    } finally {
      const continueExplicitStart = deferredStart.current && current();
      deferredStart.current = false;
      executing.current = false;
      running.current = false;
      if (scopeCurrent()) {
        setBusy(false);
        setReading(false);
        setStartPending(false);
      }
      if (current()) {
        setActivity(consumer.current?.activity ?? null);
        setQueued(consumer.current?.queued ?? false);
        setCanStart(consumer.current?.canDispatch ?? true);
      }
      // Coalesce only a user's click; invalidation above discards it without any retry timer.
      if (continueExplicitStart) {
        if (controller.current?.signal.aborted) consumer.current = null;
        void run(true);
      }
    }
  }
  useEffect(() => {
    if (
      model.allInputsAccepted &&
      (model.batch.context.tripPrior?.id ?? model.assignedTripId)
    )
      void run(false);
    // One read on reopen; only explicit Start may prepare or dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.assignedTripId]);
  useEffect(() => {
    const pending = () => {
      if (localFirstTransport.current)
        return localFirstState.current?.state === "PROCESSING";
      const state = current() ? consumer.current?.activity?.state : activity?.state;
      if (state) return ["PENDING", "WAITING", "PROCESSING"].includes(state);
      // A QUEUED prepare receipt may bind the Task before activity is projected.
      return current() ? consumer.current?.queued : queued;
    };
    // A sealed Result can arrive before the owning Task publishes its terminal activity.
    if (!pending()) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (canceled || !scopeCurrent()) return;
      if (current()) await run(false);
      if (!canceled && scopeCurrent() && pending()) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
    // This timer only schedules an owning GET; it never invents progress or retries a paid call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, activity?.state, queued, localFirst?.state]);
  return {
    formatUnavailable,
    localFirst,
    localFirstSelected,
    activity,
    result,
    busy,
    unavailable,
    photoReviewRequired,
    attempted,
    canStart: canStart && !!model.batch.context?.tripPrior?.id,
    canStartDuringRead:
      !!model.batch.context?.tripPrior?.id && busy && reading && !startPending,
    queued,
    start: () => run(true),
    recover: () => run(false),
  };
}

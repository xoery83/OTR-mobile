import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type {
  UniversalTaskActivity,
  UniversalImportResult,
} from "@/data/api/universalImportContracts";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { ApiClientError } from "@/data/api/client";
import { readLocalSession } from "@/data/auth/authRepository";
import { createUniversalImportTransport } from "@/data/api/universalImportTransport";
import { createUniversalCaptureConsumer } from "@/data/operations/universalCaptureConsumer";

export function useUniversalCapture(
  model: CaptureJobReadModel,
  isCurrent: () => boolean,
) {
  const [activity, setActivity] = useState<UniversalTaskActivity | null>(null);
  const [result, setResult] = useState<UniversalImportResult | null>(null);
  const [busy, setBusy] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [canStart, setCanStart] = useState(true);
  const [queued, setQueued] = useState(false);
  const generation = useRef(getAccountGeneration());
  const alive = useRef(true),
    running = useRef(false);
  const initialScope = useRef(`${model.batch.accountId}:${model.batch.batchId}`);
  const scope = useRef(`${model.batch.accountId}:${model.batch.batchId}`);
  const currentRef = useRef(isCurrent);
  useLayoutEffect(() => {
    scope.current = `${model.batch.accountId}:${model.batch.batchId}`;
    currentRef.current = isCurrent;
  }, [isCurrent, model.batch.accountId, model.batch.batchId]);
  const controller = useRef<AbortController | null>(null);
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
  async function run(execute: boolean) {
    if (!current() || running.current) return;
    running.current = true;
    setBusy(true);
    setUnavailable(false);
    setAttempted(true);
    try {
      if (!consumer.current) {
        const baseUrl = process.env.EXPO_PUBLIC_OTR_API_BASE_URL;
        if (!baseUrl) throw Error("UNIVERSAL_BACKEND_UNAVAILABLE");
        controller.current = new AbortController();
        const getAccountId = async () => {
          const id = (await readLocalSession())?.identity?.userId;
          if (!id) throw Error("UNIVERSAL_ACCOUNT_UNAVAILABLE");
          return id;
        };
        const transport = createUniversalImportTransport(getAccountId, {
          baseUrl,
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
          prepareSources: async (context, job) => {
            if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
            const { prepareDefaultUniversalCaptureSources } =
              await import("@/data/operations/defaultUniversalOriginalSource");
            await prepareDefaultUniversalCaptureSources(context, job, {
              baseUrl,
              ...(process.env.EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED === "true"
                ? {
                    prepareTask: async (
                      input: import("@/data/api/universalImportContracts").UniversalBatchPrepare,
                    ) => {
                      await transport.prepare(context, input);
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
        setQueued(consumer.current.queued);
        setUnavailable(next === null && !consumer.current.queued);
      }
    } catch (error) {
      if (execute && current()) {
        try {
          const code =
            error instanceof ApiClientError
              ? (error.code ?? "")
              : error instanceof Error
                ? error.message
                : "";
          console.info(
            JSON.stringify({
              event: "universal_capture_failed",
              code: [
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
          !(
            error instanceof ApiClientError &&
            error.status === 404 &&
            error.code === "TASK_NOT_FOUND"
          ),
        );
    } finally {
      running.current = false;
      if (scopeCurrent()) setBusy(false);
      if (current()) {
        setActivity(consumer.current?.activity ?? null);
        setCanStart(consumer.current?.canDispatch ?? true);
      }
    }
  }
  useEffect(() => {
    if (model.allInputsAccepted && model.batch.context.tripPrior) void run(false);
    // One read on reopen; only explicit Start may prepare or dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const pending = () => {
      const state = current() ? consumer.current?.activity?.state : activity?.state;
      return state && ["PENDING", "WAITING", "PROCESSING"].includes(state);
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
  }, [result, activity?.state]);
  return {
    activity,
    result,
    busy,
    unavailable,
    attempted,
    canStart,
    queued,
    start: () => run(true),
    recover: () => run(false),
  };
}

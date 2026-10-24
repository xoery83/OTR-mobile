import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { UniversalImportResult } from "@/data/api/universalImportContracts";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { readLocalSession } from "@/data/auth/authRepository";
import { createUniversalImportTransport } from "@/data/api/universalImportTransport";
import { createUniversalCaptureConsumer } from "@/data/operations/universalCaptureConsumer";

export function useUniversalCapture(
  model: CaptureJobReadModel,
  isCurrent: () => boolean,
) {
  const [result, setResult] = useState<UniversalImportResult | null>(null);
  const [busy, setBusy] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [canStart, setCanStart] = useState(true);
  const generation = useRef(getAccountGeneration());
  const alive = useRef(true),
    running = useRef(false);
  const currentRef = useRef(isCurrent);
  useLayoutEffect(() => {
    currentRef.current = isCurrent;
  }, [isCurrent]);
  const controller = useRef<AbortController | null>(null);
  const consumer = useRef<ReturnType<typeof createUniversalCaptureConsumer> | null>(null);
  const current = () =>
    alive.current &&
    currentRef.current() &&
    generation.current === getAccountGeneration();
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
          prepareSources: async (context, job) => {
            if (!current()) throw Error("UNIVERSAL_CAPTURE_STALE");
            const { prepareDefaultUniversalCaptureSources } =
              await import("@/data/operations/defaultUniversalOriginalSource");
            await prepareDefaultUniversalCaptureSources(context, job, {
              baseUrl,
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
        setUnavailable(next === null);
      }
    } catch {
      if (current()) setUnavailable(true);
    } finally {
      running.current = false;
      if (current()) {
        setBusy(false);
        setCanStart(consumer.current?.canDispatch ?? true);
      }
    }
  }
  return {
    result,
    busy,
    unavailable,
    attempted,
    canStart,
    start: () => run(true),
    recover: () => run(false),
  };
}

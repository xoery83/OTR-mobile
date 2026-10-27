import type { UniversalP2SourceReview } from "@/domain/trip/universalP2SourceReview";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { UniversalImportResult } from "@/data/api/universalImportContracts";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { UniversalItemSourceReview } from "@/domain/trip/universalP1SourceReview";
export type P1AdmissionStatus =
  "SYNC_PENDING" | "SERVER_ACCEPTED" | "OWNING_ADMISSION_PENDING" | "UNAVAILABLE";
export type P1AdmissionActions = {
  enabled: boolean;
  enabledFamilies?: readonly ("P1" | "P2" | "P3" | "P4")[];
  readOriginal(result: UniversalImportResult, token: string): Promise<string>;
  busyToken: string | null;
  statuses: Record<string, P1AdmissionStatus>;
  confirm(
    result: UniversalImportResult,
    token: string,
    review?: UniversalItemSourceReview | UniversalP2SourceReview,
  ): Promise<void>;
};
export function useUniversalP1Admission(
  model: CaptureJobReadModel,
  isCurrent: () => boolean,
): P1AdmissionActions {
  const enabledFamilies: ("P1" | "P2" | "P3" | "P4")[] = [];
  if (process.env.EXPO_PUBLIC_OTR_UNIVERSAL_P1_ADMISSION_ENABLED === "true")
    enabledFamilies.push("P1");
  if (process.env.EXPO_PUBLIC_OTR_UNIVERSAL_P2_ADMISSION_ENABLED === "true")
    enabledFamilies.push("P2");
  if (process.env.EXPO_PUBLIC_OTR_UNIVERSAL_P3_ADMISSION_ENABLED === "true")
    enabledFamilies.push("P3");
  if (process.env.EXPO_PUBLIC_OTR_UNIVERSAL_P4_ADMISSION_ENABLED === "true")
    enabledFamilies.push("P4");
  const enabled = enabledFamilies.length > 0;
  const permits = (result: UniversalImportResult, token: string) =>
    result.candidates.some(
      (c) => c.token === token && enabledFamilies.some((family) => family === c.kind),
    );
  const [statuses, setStatuses] = useState<Record<string, P1AdmissionStatus>>({}),
    [busyToken, setBusyToken] = useState<string | null>(null);
  const alive = useRef(true),
    running = useRef(false),
    generation = useRef(getAccountGeneration()),
    initialScope = useRef(`${model.batch.accountId}:${model.batch.batchId}`),
    scope = useRef(`${model.batch.accountId}:${model.batch.batchId}`),
    view = useRef(isCurrent);
  useLayoutEffect(() => {
    scope.current = `${model.batch.accountId}:${model.batch.batchId}`;
    view.current = isCurrent;
  }, [model.batch.accountId, model.batch.batchId, isCurrent]);
  const current = () =>
    alive.current &&
    initialScope.current === scope.current &&
    view.current() &&
    generation.current === getAccountGeneration();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return {
    enabled,
    enabledFamilies,
    busyToken,
    statuses,
    async readOriginal(result, token) {
      if (!current() || !permits(result, token)) throw Error("OWNING_REVIEW_REQUIRED");
      const [
        { getDefaultLocalCaptureInboxRepository, captureStorageDependencies },
        { requireAdoptedUserId },
        { readUniversalP1ReviewOriginal },
      ] = await Promise.all([
        import("@/data/repositories/defaultLocalCaptureInboxRepository"),
        import("@/data/auth/authRepository"),
        import("@/data/operations/universalP1AdmissionConsumer"),
      ]);
      const captures = await getDefaultLocalCaptureInboxRepository();
      return readUniversalP1ReviewOriginal(model, result, token, {
        getAccountId: requireAdoptedUserId,
        isCurrent: current,
        hash: captureStorageDependencies.sha256,
        readCapture: captures.getForSourceHandoff,
      });
    },
    async confirm(result, token, review) {
      if (!current() || !permits(result, token) || running.current) return;
      running.current = true;
      setBusyToken(token);
      try {
        const [
          { readInitializedDatabase },
          { requireAdoptedUserId },
          { createTripCoreV2Repository },
          { tripCoreSha256Hex },
          { createCoreV2Transport },
          { createUniversalP1AdmissionConsumer },
          { createReviewedSourceOperationSync },
        ] = await Promise.all([
          import("@/data/db/database"),
          import("@/data/auth/authRepository"),
          import("@/data/repositories/tripCoreV2Repository"),
          import("@/data/repositories/tripCoreSha256"),
          import("@/data/api/tripCoreV2Transport"),
          import("@/data/operations/universalP1AdmissionConsumer"),
          import("@/data/sync/tripCoreV2SyncWorker"),
        ]);
        const database = await readInitializedDatabase();
        if (!current()) return;
        const core = createTripCoreV2Repository(
          database,
          requireAdoptedUserId,
          tripCoreSha256Hex,
        );
        const transport = createCoreV2Transport(requireAdoptedUserId, tripCoreSha256Hex, {
          timeoutMs: 60000,
        });
        const consumer = createUniversalP1AdmissionConsumer({
          getAccountId: requireAdoptedUserId,
          isCurrent: current,
          core,
          transport,
          sync: createReviewedSourceOperationSync(
            database,
            core,
            transport,
            requireAdoptedUserId,
            tripCoreSha256Hex,
          ),
        });
        const outcome = await consumer.confirm(model, result, token, review);
        if (current()) setStatuses((s) => ({ ...s, [token]: outcome.status }));
      } catch (error) {
        const code =
          error &&
          typeof error === "object" &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : error instanceof Error
              ? error.message
              : "";
        if (current())
          setStatuses((s) => ({
            ...s,
            [token]: [
              "OWNING_ADMISSION_PENDING",
              "SOURCE_RELATION_QUALIFICATION_REQUIRED",
              "OWNING_ADMISSION_UNAVAILABLE",
            ].includes(code)
              ? "OWNING_ADMISSION_PENDING"
              : "UNAVAILABLE",
          }));
      } finally {
        running.current = false;
        if (current()) setBusyToken(null);
      }
    },
  };
}

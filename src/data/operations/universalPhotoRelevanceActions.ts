import { z } from "zod";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  photoImportDecisionSchema,
  type PhotoImportDecision,
} from "@/domain/capture/photoImportRelevance";
import type { createCapturePhotoImportDecisionRepository } from "../repositories/capturePhotoImportDecisionRepository";
import { screenUniversalPhotoInput } from "./universalPhotoRelevance";

export type PhotoRelevanceScreen = {
  revision: number;
  decision: PhotoImportDecision;
  persisted: boolean;
};
// Import-only local actions, bound to the captured Account/view lifetime.
export function createUniversalPhotoRelevanceActions(
  context: AccountRequestContext,
  dependencies: Parameters<typeof screenUniversalPhotoInput>[3] & {
    decisions: Pick<
      ReturnType<typeof createCapturePhotoImportDecisionRepository>,
      "read" | "save"
    >;
  },
  signal?: AbortSignal,
) {
  const current = async () => {
    await assertAccountRequestContext(context, dependencies.getAccountId);
    if (signal?.aborted) throw new Error("PHOTO_IMPORT_CANCELLED");
  };
  return {
    async read(jobId: string, inputId: string) {
      await current();
      const saved = await dependencies.decisions.read(context, jobId, inputId);
      await current();
      return saved;
    },
    async screen(jobId: string, inputId: string): Promise<PhotoRelevanceScreen> {
      await current();
      const prior = await dependencies.decisions.read(context, jobId, inputId);
      await current();
      if (prior?.status === "CURRENT")
        return {
          revision: prior.revision,
          decision: prior.decision,
          persisted: true,
        };
      const decision = await screenUniversalPhotoInput(
        context,
        jobId,
        inputId,
        dependencies,
        signal,
      );
      await current();
      if (prior && prior.decision.choice !== "UNDECIDED")
        return { revision: prior.revision, decision, persisted: false };
      const saved = await dependencies.decisions.save(
        context,
        jobId,
        prior?.revision ?? 0,
        decision,
        signal,
      );
      await current();
      return {
        revision: saved.revision,
        decision: saved.decision,
        persisted: true,
      };
    },
    async choose(
      jobId: string,
      expectedRevision: number,
      observation: unknown,
      choice: "CONTINUE_WITH_AI" | "SKIP",
    ) {
      await current();
      const decision = photoImportDecisionSchema.parse(observation);
      const explicitChoice = z.enum(["CONTINUE_WITH_AI", "SKIP"]).parse(choice);
      const saved = await dependencies.decisions.save(
        context,
        jobId,
        expectedRevision,
        { ...decision, choice: explicitChoice },
        signal,
      );
      await current();
      return saved;
    },
  };
}

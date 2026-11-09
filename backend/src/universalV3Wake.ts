import { canonicalEventJson } from "../../src/domain/trip/eventIntentJson";
import { createHash } from "node:crypto";
import type { AccountRequestContext } from "../../src/data/auth/accountRequestContext";
import type { createIntelligenceContinuationRepository } from "../../src/data/repositories/intelligenceContinuationRepository";
import type { SyncOperation } from "../../src/data/sync/syncOperationRepository";
import type { Attempt, Task } from "../../src/domain/intelligence/persistence";
import type { UniversalV3Manifest } from "../../src/data/api/universalV3Contracts";
import type { buildUniversalV3TaskDraft } from "./universalV3TaskDraft";
import { createUniversalDeepSeekExecution } from "./universalDeepSeekProvider";
import { universalBatchIdentity } from "./universalBatchSource";
import { projectUniversalV3Candidates } from "./universalV3Materials";

type Draft = Awaited<ReturnType<typeof buildUniversalV3TaskDraft>>;
type ProviderPorts = Parameters<typeof createUniversalDeepSeekExecution>[0];
type ProviderResult = Awaited<
  ReturnType<ReturnType<typeof createUniversalDeepSeekExecution>["interpret"]>
>;
type Publication = {
  candidates: (ReturnType<typeof projectUniversalV3Candidates>[number] & {
    candidateId: string;
  })[];
  providerReceipt: ProviderResult["providerReceipt"] & { outcome?: "SETTLED" };
};
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function runUniversalV3Wake(input: {
  context: AccountRequestContext;
  repository: ReturnType<typeof createIntelligenceContinuationRepository>;
  wake: SyncOperation;
  manifest: UniversalV3Manifest;
  draft: Draft;
  provider: Omit<ProviderPorts, "requestProfile" | "send">;
  send: ProviderPorts["send"];
  assertCurrent(): Promise<void>;
  assertDurableStart(attempt: Attempt, task: Task): Promise<void>;
  assertCompletion?(
    result: ProviderResult & { providerReceipt: { outcome: "SETTLED" } },
    attempt: Attempt,
    task: Task,
  ): Promise<void>;
  retainPublication(attempt: Attempt, bytes: Buffer, sha256: string): Promise<void>;
}) {
  const { context, repository, wake, manifest, draft } = input;
  await input.assertCurrent();
  const inspected = await repository.inspectWake(context, wake);
  if (inspected.task.task_id !== draft.task.task_id || wake.id !== draft.wakeId)
    throw Error("UNIVERSAL_V3_WAKE_SCOPE");
  if (inspected.disposition !== "EVALUATE")
    return inspected.task.work_disposition === "PUBLISHED" ? "PUBLISHED" : "NO_DISPATCH";
  const { task, attempts } = await repository.snapshot(context, draft.task.task_id);
  if (task.work_disposition === "PUBLISHED") return "PUBLISHED" as const;
  if (attempts.length) return "RECONCILE_ONLY" as const;
  const reserved = await repository.reserveAttempt(
    context,
    draft.attempt,
    task.row_revision,
    wake,
  );
  // This owning port must make remote intent durable and independently read it.
  // An ambiguous failure here leaves a retained Attempt and cannot resend.
  await input.assertDurableStart(reserved, task);
  const running = await repository.beginExecution(
    context,
    reserved.attempt_id,
    reserved.row_revision,
    "START_DURABLE",
  );

  const provider = createUniversalDeepSeekExecution({
    ...input.provider,
    requestProfile: "local-first",
    async send(request) {
      if (sha(Buffer.from(request.body)) !== draft.requestSha256)
        throw Error("UNIVERSAL_V3_CHANGED_REQUEST");
      await input.assertCurrent();
      if (
        !task.policy_snapshot.deadline ||
        Date.parse(task.policy_snapshot.deadline) <= Date.now()
      )
        throw Error("UNIVERSAL_V3_TASK_EXPIRED");
      let response: ReturnType<ProviderPorts["send"]> | undefined;
      await repository.admitExecution(context, running, () => {
        response = input.send(request);
      });
      if (!response) throw Error("UNIVERSAL_V3_SEND_CLOSED");
      return response;
    },
  });
  let settled: ProviderResult;
  try {
    settled = await provider.interpret(draft.providerInput);
    if (input.assertCompletion)
      await input.assertCompletion(
        {
          ...settled,
          providerReceipt: { ...settled.providerReceipt, outcome: "SETTLED" },
        },
        running,
        task,
      );
  } catch {
    const retained = await repository.readAttempt(context, running.attempt_id);
    await repository.observeAttempt(context, retained.attempt_id, retained.row_revision, {
      execution_observation: "UNKNOWN",
      execution_outcome: null,
      metering_disposition: "UNKNOWN",
      response_material_reference: null,
      response_material_sha256: null,
      response_sha256: null,
      reported_usage_summary: null,
    });
    return "RECONCILE_ONLY" as const;
  }

  let candidates: Publication["candidates"];
  try {
    candidates = projectUniversalV3Candidates(settled.output, manifest).map(
      (candidate, index) => ({
        ...candidate,
        candidateId: universalBatchIdentity(
          context.accountId,
          context.tripId,
          draft.task.import_id,
          "local-first/candidate/" + index,
        ),
      }),
    );
  } catch {
    // A verified billed response with invalid suggestions does not authorize another send.
    candidates = [];
  }
  const publication: Publication = {
    candidates,
    providerReceipt: {
      ...settled.providerReceipt,
      ...(input.assertCompletion ? { outcome: "SETTLED" } : {}),
    },
  };
  const { provider_extension: _providerExtension, ...usage } =
    settled.providerReceipt.usage;
  const bytes = Buffer.from(
    canonicalEventJson(publication as Parameters<typeof canonicalEventJson>[0]),
  );
  const digest = sha(bytes);
  const retained = await repository.readAttempt(context, running.attempt_id);
  await input.retainPublication(retained, bytes, digest);
  const observed = await repository.observeAttempt(
    context,
    retained.attempt_id,
    retained.row_revision,
    {
      execution_observation: "TERMINAL",
      execution_outcome: "SUCCEEDED",
      metering_disposition: "COMPLETE",
      response_material_reference: retained.attempt_id,
      response_material_sha256: digest,
      response_sha256: digest,
      reported_usage_summary: input.assertCompletion
        ? null
        : {
            ...usage,
            version: 1,
            image_units: null,
            audio_units: null,
            call_count: 1,
            bytes: null,
            wall_ms: null,
            cpu_ms: null,
            gpu_ms: null,
            accelerator_ms: null,
          },
    },
  );
  await input.assertCurrent();
  const installed = await repository.installResult(
    context,
    observed.attempt_id,
    observed.row_revision,
    observed.attempt_id,
    digest,
    async () => {},
  );
  if (installed.result_install_disposition !== "INSTALLED") return "NO_DISPATCH";
  return "PUBLISHED" as const;
}

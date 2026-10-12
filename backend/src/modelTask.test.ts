import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { modelTaskRequestSchema } from "../../src/domain/intelligence/modelTask";
import { taskSchema } from "../../src/domain/intelligence/persistence";
import { createFlightDevExecutor } from "./flightDevDispatch";
import { flightExecutorFixture } from "./__fixtures__/flightExecutor";
import { persistenceDigest, commandDigest } from "./externalIntegrationPersistence";
import {
  registeredFlightModelProfile,
  bindModelTask,
  projectModelTaskRequest,
  modelTaskBindingSchema,
} from "./modelTaskProfile";
import { createClosedModelTaskFacade } from "./modelTaskFacade";

describe("CLOSED Model Task facade/profile/technical witness", () => {
  it("freezes the exact registered JSON/hash shared with Python and PostgreSQL", () => {
    const vector = JSON.parse(
      readFileSync(
        new URL("../../scripts/cp-llm/profile-vector.json", import.meta.url),
        "utf8",
      ),
    );
    expect(registeredFlightModelProfile).toEqual(vector.profile);
    expect(persistenceDigest(registeredFlightModelProfile)).toBe(vector.sha256);
    const taskVector = JSON.parse(
      readFileSync(
        new URL("../../scripts/cp-llm/model-task-vector.json", import.meta.url),
        "utf8",
      ),
    );
    expect(bindModelTask(taskVector.request).request_sha256).toBe(
      taskVector.request_sha256,
    );
    expect(persistenceDigest(taskVector.request.policy_snapshot)).toBe(
      taskVector.policy_sha256,
    );
  });
  it.each(["contract", "consumer", "schema", "policy", "profile", "budget", "deadline"])(
    "rejects changed %s before transport",
    async (change) => {
      const f = await flightExecutorFixture(),
        b = structuredClone(f.command.model_task_binding);
      if (change === "contract")
        (b.request as unknown as { contract_version: string }).contract_version = "wrong";
      if (change === "consumer") b.request.consumer_version++;
      if (change === "schema") b.request.schema.sha256 = "b".repeat(64);
      if (change === "policy") b.request.policy_snapshot.privacy = "OTR_ONLY";
      if (change === "profile") b.profile.modality = "VISION";
      if (change === "budget") b.request.policy_snapshot.budget_nanos = null;
      if (change === "deadline") b.request.policy_snapshot.deadline = null;
      expect(() => modelTaskBindingSchema.parse(b)).toThrow();
    },
  );
  it("rejects arbitrary input URLs and caller schema/credential fields", async () => {
    const f = await flightExecutorFixture(),
      q = f.command.model_task_binding.request;
    expect(modelTaskRequestSchema.safeParse({ ...q, provider: "caller" }).success).toBe(
      false,
    );
    expect(
      modelTaskRequestSchema.safeParse({
        ...q,
        input: { ...q.input, reference: "https://bad.invalid" },
      }).success,
    ).toBe(false);
    expect(
      modelTaskRequestSchema.safeParse({
        ...q,
        schema: { ...q.schema, validator: "executable" },
      }).success,
    ).toBe(false);
  });
  it("retains technical success independently of semantic rejection and nullable metering", async () => {
    const f = await flightExecutorFixture("meter-loss");
    f.deps.interpret = async () => {
      throw new Error("SEMANTIC_INVALID");
    };
    const report = await f.factory.executor(f.context).execute(f.a);
    expect(report.execution_outcome).toBe("FAILED");
    expect(report.response_sha256).toBeNull();
    expect(report.metering_disposition).toBe("COMPLETION_PENDING");
    const technical = await f.factory.readTechnicalOutput(f.context, f.a.attempt_id);
    expect(technical?.witness.output.sha256).toMatch(/^[a-f0-9]{64}$/);
    const freshFactory = createFlightDevExecutor(
      f.deps as Parameters<typeof createFlightDevExecutor>[0],
    );
    expect(await freshFactory.readTechnicalOutput(f.context, f.a.attempt_id)).toEqual(
      technical,
    );
    await expect(f.factory.executor(f.context).execute(f.a)).rejects.toThrow();
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("raw-response recovery retains technical output when the consumer rejects semantics", async () => {
    const f = await flightExecutorFixture();
    await f.factory.retainRecoveredResponse(
      f.context,
      f.a.attempt_id,
      {
        status: "FAILED",
        error: "SEMANTIC_INVALID",
        provider_request_id: null,
        latency_ms: null,
        usage: {
          input_tokens: null,
          output_tokens: null,
          total_tokens: null,
          cached_input_tokens: null,
          reasoning_tokens: null,
          provider_extension: {},
          usage_quality: "UNKNOWN",
        },
      },
      null,
      f.output,
    );
    const technical = await f.factory.readTechnicalOutput(f.context, f.a.attempt_id);
    expect(technical?.output).toEqual(f.output);
    expect(
      (await f.factory.recover(f.context, f.a.attempt_id)).report.response_sha256,
    ).toBeNull();
    expect(f.send).not.toHaveBeenCalled();
  });
  it("technical JSON digest does not replace the successful interpretation digest", async () => {
    const f = await flightExecutorFixture();
    const report = await f.factory.executor(f.context).execute(f.a);
    const technical = await f.factory.readTechnicalOutput(f.context, f.a.attempt_id);
    expect(report.response_sha256).not.toBe(technical?.witness.output.sha256);
    expect(
      (await f.factory.recover(f.context, f.a.attempt_id)).report.response_sha256,
    ).toBe(report.response_sha256);
  });
  it("invalid structural output and UNKNOWN have no technical success witness", async () => {
    for (const mode of ["malformed", "lost-ack"]) {
      const f = await flightExecutorFixture(mode);
      await f.factory.executor(f.context).execute(f.a);
      expect(await f.factory.readTechnicalOutput(f.context, f.a.attempt_id)).toBeNull();
    }
  });
  it("revalidates bytes/digest and current disclosure after retaining private output", async () => {
    const f = await flightExecutorFixture();
    await f.factory.executor(f.context).execute(f.a);
    const technical = await f.factory.readTechnicalOutput(f.context, f.a.attempt_id);
    f.blobs.get(technical!.witness.output.reference)!.bytes = new TextEncoder().encode(
      "{}",
    );
    await expect(
      f.factory.readTechnicalOutput(f.context, f.a.attempt_id),
    ).rejects.toThrow();
    f.repo.authorizeResultDisclosure.mockRejectedValue(new Error("REVOKED"));
    await expect(
      f.factory.readTechnicalOutput(f.context, f.a.attempt_id),
    ).rejects.toThrow("REVOKED");
  });
  it("uses the repository snapshot and fences cancellation or stale callback projections", async () => {
    const f = await flightExecutorFixture();
    const q = f.command.model_task_binding.request;
    const task = taskSchema.parse({
      account_id: f.a.account_id,
      task_id: f.a.task_id,
      format_version: 1,
      import_id: randomUUID(),
      manifest_version: 1,
      manifest_sha256: "a".repeat(64),
      trip_id: f.request.binding.trip_id,
      stage: "INTERPRETATION",
      logical_request_id: q.logical_request_id,
      logical_idempotency_key: q.logical_idempotency_key,
      input_pins: [],
      input_sha256: persistenceDigest([]),
      consumer_id: "import",
      consumer_version: 1,
      schema_id: "flight",
      schema_dialect: "otr",
      schema_version: 1,
      schema_sha256: "a".repeat(64),
      capability_requirements: ["EXTRACT"],
      policy_snapshot: q.policy_snapshot,
      policy_sha256: q.policy_sha256,
      run_id: null,
      expected_run_generation: null,
      candidate_id: null,
      expected_candidate_sha256: null,
      event_id: null,
      expected_event_revision: null,
      created_at: f.a.created_at,
      creation_clock: "DEVICE_WALL",
      row_revision: 1,
      publication_fence: 1,
      current_pass_complete: false,
      work_disposition: "PENDING",
      wait_reason: null,
      wait_reasons: [],
      sync_operation_id: null,
      dependencies: [],
      current_attempt_id: null,
      cancellation_disposition: "NONE",
      safe_reason: null,
      publication_id: null,
      publication_sha256: null,
      result_sha256: null,
      updated_at: f.a.created_at,
      update_clock: "DEVICE_WALL",
      completed_at: null,
    });
    expect(projectModelTaskRequest(task, q.input)).toEqual(q);
    const snapshot = vi.fn(async () => ({ task: structuredClone(task), attempts: [] }));
    const readTechnicalOutput = vi.fn();
    const facade = createClosedModelTaskFacade({ snapshot }, { readTechnicalOutput });
    expect((await facade.read(f.context, task.task_id)).attempt).toBeNull();
    task.cancellation_disposition = "FENCED";
    task.work_disposition = "CANCELED";
    expect(
      (await facade.read(f.context, task.task_id)).continuation.cancellation_disposition,
    ).toBe("FENCED");
    expect(readTechnicalOutput).not.toHaveBeenCalled();
    snapshot.mockImplementationOnce(async () => ({
      task: { ...task, row_revision: 2 },
      attempts: [],
    }));
    await expect(facade.read(f.context, task.task_id)).rejects.toThrow("POLICY_BLOCKED");
  });
  it("changed protected binding is denied by the host load before send", async () => {
    const f = await flightExecutorFixture();
    f.command.model_task_binding.request.input.sha256 = "b".repeat(64);
    f.command.model_task_binding.request_sha256 = persistenceDigest(
      f.command.model_task_binding.request,
    );
    f.command.request_sha256 = commandDigest(f.command);
    await expect(f.factory.executor(f.context).execute(f.a)).rejects.toThrow(
      "POLICY_BLOCKED",
    );
    expect(f.send).not.toHaveBeenCalled();
  });
});

import { expect, it } from "vitest";
import { flightExecutorFixture } from "./__fixtures__/flightExecutor";
import {
  bindFlightAssemblyModelTask,
  flightAssemblyModelProfile,
  flightAssemblyModelBindingSchema,
  modelTaskBindingSchema,
} from "./modelTaskProfile";
import { persistenceDigest } from "./externalIntegrationPersistence";
it.each(["TEXT", "VISION"] as const)(
  "registers no authority while making an exact candidate %s profile",
  async (mode) => {
    const f = await flightExecutorFixture();
    const p = flightAssemblyModelProfile(mode);
    const q = {
      ...f.command.model_task_binding.request,
      consumer_version: 2,
      schema: {
        id: p.output_schema_version,
        version: 1,
        dialect: "OTR_TYPED_V1",
        sha256: p.output_schema_sha256,
      },
    };
    const bound = bindFlightAssemblyModelTask(q, mode);
    expect(bound.profile_sha256).toBe(persistenceDigest(p));
    expect(modelTaskBindingSchema.safeParse(bound).success).toBe(false);
    for (const mutate of [
      (b: typeof bound) => {
        b.profile.capability = "ANYTHING";
      },
      (b: typeof bound) => {
        b.request.consumer_version = 1;
      },
      (b: typeof bound) => {
        b.request.policy_snapshot.max_attempts = 2;
      },
      (b: typeof bound) => {
        b.request.policy_snapshot.privacy = "LOCAL_ONLY";
      },
      (b: typeof bound) => {
        b.request.policy_snapshot.budget_nanos = "0";
      },
      (b: typeof bound) => {
        b.request.schema.id = "FLIGHT_REMOTE_OUTPUT_V1";
      },
    ]) {
      const changed = structuredClone(bound);
      mutate(changed);
      expect(flightAssemblyModelBindingSchema.safeParse(changed).success).toBe(false);
    }
  },
);

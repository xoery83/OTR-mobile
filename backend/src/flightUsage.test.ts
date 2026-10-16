import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  flightUsageCommand,
  flightSemanticUsageCommand,
  createFlightSemanticUsageAppender,
} from "./flightUsage";
import { flightExecutorFixture } from "./__fixtures__/flightExecutor";
import {
  createClosedPersistenceGateway,
  persistenceDigest,
  verifiedCallContextSchema,
} from "./externalIntegrationPersistence";
const at = "2026-10-07T00:00:00Z";
async function fixture() {
  const f = await flightExecutorFixture();
  const report = await f.factory.executor(f.context).execute(f.a);
  const result = (await f.factory.recover(f.context, f.a.attempt_id)).result;
  const a = {
    ...f.a,
    descriptor_snapshot: {
      version: 1 as const,
      provider_class: "COMMERCIAL_REMOTE" as const,
      replay_support: "UNSUPPORTED" as const,
      capabilities: ["INTERPRET"],
      modalities: ["TEXT"],
      network_required: true,
    },
  };
  const pins = f.descriptor.remote;
  const schedule = {
    id: pins.price_schedule_id,
    sha256: pins.price_sha256,
    currency: "USD",
    units: [
      {
        measurement_unit: "input_tokens" as const,
        unit_quantity: 1000000,
        price_per_quantity: "0.3",
        relationship: "DISJOINT" as const,
        billable: true,
      },
      {
        measurement_unit: "output_tokens" as const,
        unit_quantity: 1000000,
        price_per_quantity: "1.2",
        relationship: "DISJOINT" as const,
        billable: true,
      },
    ],
  };
  return { ...f, a, result, report, pins, schedule };
}
it("preserves legacy descriptor-v2 wrapper while semantic price pins bind exact same call", async () => {
  const f = await fixture();
  const observation = { id: randomUUID(), request_id: randomUUID(), at };
  expect(() =>
    flightUsageCommand(f.a, f.result, f.report, f.schedule, observation),
  ).toThrow("POLICY_BLOCKED");
  const c = flightSemanticUsageCommand(
    f.a,
    f.result,
    f.report,
    f.schedule,
    f.pins,
    observation,
  );
  expect(c.row.usage_quality).toBe("ACTUAL_REPORTED");
  expect(c.row.cost_quality).toBe("ESTIMATED");
  expect(c.row.cost_nanos).toBe("54000");
  for (const change of [
    { ...f.pins, price_sha256: "b".repeat(64) },
    { ...f.pins, call_id: randomUUID() },
  ])
    expect(() =>
      flightSemanticUsageCommand(
        f.a,
        f.result,
        f.report,
        f.schedule,
        change,
        observation,
      ),
    ).toThrow("POLICY_BLOCKED");
});
it("actual gateway appender replays identical immutable row, rejects cancel and UNKNOWN coverage upgrade", async () => {
  const f = await fixture();
  let stored: ReturnType<typeof flightSemanticUsageCommand>["row"] | null = null;
  let canceled = false,
    inserted = 0;
  const rows: unknown[] = [];
  const gateway = createClosedPersistenceGateway({
    gatewayIdentity: "otr_external_integration_call_gateway",
    now: () => at,
    verify: async (r) =>
      verifiedCallContextSchema.parse({
        ...f.host,
        request_id: r.requestId,
        request_sha256: r.requestSha256,
        command_kind: r.command,
      }),
    execute: async (kind, _context, command) => {
      expect(kind).toBe("external_integration_usage_append");
      const row = command.row as NonNullable<typeof stored>;
      if (stored && persistenceDigest(stored) !== persistenceDigest(row))
        throw new Error("CP14_CHANGED_OBSERVATION");
      if (!stored) {
        stored = row;
        inserted++;
      }
      rows.push(structuredClone(row));
      return stored;
    },
  });
  const append = createFlightSemanticUsageAppender({
    gateway,
    authorize: async () => {
      if (canceled) throw new Error("POLICY_BLOCKED");
    },
    loadPrice: async () => ({ pins: f.pins, schedule: f.schedule }),
    readCompletion: async () => stored,
    id: randomUUID,
    now: () => at,
  });
  await append(f.a, f.result, f.report);
  await append(f.a, f.result, f.report);
  await append(f.a, f.result, f.report);
  expect(inserted).toBe(1);
  expect(rows[0]).toEqual(rows[1]);
  expect(rows[1]).toEqual(rows[2]);
  canceled = true;
  await expect(append(f.a, f.result, f.report)).rejects.toThrow("POLICY_BLOCKED");
  expect(rows).toHaveLength(3);
  canceled = false;
  stored = null;
  const unknown = {
    ...f.result,
    status: "UNKNOWN" as const,
    error: "TIMEOUT" as const,
    usage: {
      ...f.result.usage,
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      cached_input_tokens: null,
      reasoning_tokens: null,
      provider_extension: {},
      usage_quality: "UNKNOWN" as const,
    },
  };
  await append(f.a, unknown, { ...f.report, response_sha256: null });
  await expect(append(f.a, f.result, f.report)).rejects.toThrow(
    "USAGE_UNKNOWN_TO_ACTUAL_CONTRACT_REQUIRED",
  );
  expect(rows).toHaveLength(4);
});

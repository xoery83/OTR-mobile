import { expect, it, vi } from "vitest";
import { commandDigest } from "../externalIntegrationPersistence";
import { responseSchema } from "./contracts";
import { summarizeUsage } from "./service";
import { createFlightEnrichmentIdempotency } from "./idempotency";
const binding = {
  accountId: "a0000000-0000-4000-8000-000000000001",
  actorId: "a0000000-0000-4000-8000-000000000002",
  tripId: "a0000000-0000-4000-8000-000000000003",
};
const scope = {
  accountId: binding.accountId,
  actorId: binding.actorId,
  key: "key1",
  digest: "a".repeat(64),
};
const response = () =>
  responseSchema.parse({
    version: "otr-flight-enrichment/1",
    requestId: "r1",
    idempotencyKey: "key1",
    mode: "CREATE",
    draft: { id: "d1", revision: 1 },
    query: { flightNumber: "NZ101", departureLocalDate: "2026-10-27" },
    status: "UNAVAILABLE",
    advisory: true,
    requiresUserConfirmation: true,
    manualEntryAllowed: true,
    suggestions: [],
    references: [],
    unresolved: [],
    candidates: [],
    observedAt: "2026-10-27T00:00:00Z",
    cache: { state: "MISS", freshUntil: null, writes: "CLOSED_LICENSE_UNCONFIRMED" },
    usage: summarizeUsage(
      null,
      "deepseek",
      "deepseek-flash",
      {},
      [],
      "POLICY_UNFROZEN",
      false,
      [],
    ),
    failureReason: "POLICY_CLOSED",
  });
function journal() {
  let row: Record<string, unknown> | null = null;
  const invoke = vi.fn(
    async (kind: string, command: Record<string, unknown>): Promise<unknown> => {
      expect(command.request_sha256).toBe(commandDigest(command));
      expect(command.environment).toBe("DEV");
      expect(command.integration_id).toBe("otr-flight-enrichment-v1");
      if (row && ["trip_id", "logical_sha256"].some((key) => row![key] !== command[key]))
        throw Error("ENRICHMENT_IDEMPOTENCY_CONFLICT");
      if (kind === "flight_enrichment_request_claim") {
        if (!row) {
          row = { ...command, state: "PENDING" };
          return { state: "ACQUIRED" };
        }
        return row.state === "TERMINAL"
          ? { state: "TERMINAL", response: row.response }
          : { state: row.state };
      }
      expect(command.claim_token).toBe(row?.claim_token);
      row = {
        ...row,
        state: command.response === null ? "UNKNOWN" : "TERMINAL",
        response: command.response,
      };
      return row.state === "TERMINAL"
        ? { state: "TERMINAL", response: row.response }
        : { state: "UNKNOWN" };
    },
  );
  return { invoke };
}
it("replays a committed result through a new adapter without invoking action again", async () => {
  const gateway = journal(),
    action = vi.fn(async () => response());
  await createFlightEnrichmentIdempotency(gateway as any, binding).execute(scope, action);
  expect(
    await createFlightEnrichmentIdempotency(gateway as any, binding).execute(
      scope,
      action,
    ),
  ).toEqual(response());
  expect(action).toHaveBeenCalledOnce();
});
it("a simultaneous request cannot execute a second action", async () => {
  const gateway = journal();
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const action = vi.fn(async () => {
    await gate;
    return response();
  });
  const first = createFlightEnrichmentIdempotency(gateway as any, binding).execute(
    scope,
    action,
  );
  await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());
  await expect(
    createFlightEnrichmentIdempotency(gateway as any, binding).execute(scope, action),
  ).rejects.toThrow("ENRICHMENT_REQUEST_PENDING");
  finish();
  await first;
  expect(action).toHaveBeenCalledOnce();
});
it("changed Trip or request digest cannot replay even when the client reuses its key", async () => {
  const gateway = journal(),
    action = vi.fn(async () => response());
  await createFlightEnrichmentIdempotency(gateway as any, binding).execute(scope, action);
  await expect(
    createFlightEnrichmentIdempotency(gateway as any, {
      ...binding,
      tripId: binding.accountId,
    }).execute(scope, action),
  ).rejects.toThrow("CONFLICT");
  await expect(
    createFlightEnrichmentIdempotency(gateway as any, binding).execute(
      { ...scope, digest: "b".repeat(64) },
      action,
    ),
  ).rejects.toThrow("CONFLICT");
  expect(action).toHaveBeenCalledOnce();
});
it("action failure leaves UNKNOWN and never retries the provider", async () => {
  const gateway = journal(),
    action = vi.fn(async () => {
      throw Error("LOST_RESPONSE");
    });
  await expect(
    createFlightEnrichmentIdempotency(gateway as any, binding).execute(scope, action),
  ).rejects.toThrow("LOST_RESPONSE");
  await expect(
    createFlightEnrichmentIdempotency(gateway as any, binding).execute(scope, action),
  ).rejects.toThrow("ENRICHMENT_REQUEST_UNKNOWN");
  expect(action).toHaveBeenCalledOnce();
});
it("claim acknowledgement loss leaves a tombstone and never starts the action", async () => {
  const gateway = journal(),
    action = vi.fn(async () => response());
  const lost = {
    invoke: async (...args: Parameters<typeof gateway.invoke>) => {
      await gateway.invoke(...args);
      throw Error("ACK_LOST");
    },
  };
  await expect(
    createFlightEnrichmentIdempotency(lost as any, binding).execute(scope, action),
  ).rejects.toThrow("ACK_LOST");
  await expect(
    createFlightEnrichmentIdempotency(gateway as any, binding).execute(scope, action),
  ).rejects.toThrow("PENDING");
  expect(action).not.toHaveBeenCalled();
});
it("a lost finish reply can replay only the durable terminal result", async () => {
  const gateway = journal(),
    action = vi.fn(async () => response());
  const lost = {
    invoke: async (...args: Parameters<typeof gateway.invoke>) => {
      const result = await gateway.invoke(...args);
      if (args[0] === "flight_enrichment_request_finish") throw Error("ACK_LOST");
      return result;
    },
  };
  await expect(
    createFlightEnrichmentIdempotency(lost as any, binding).execute(scope, action),
  ).rejects.toThrow("ACK_LOST");
  expect(
    await createFlightEnrichmentIdempotency(gateway as any, binding).execute(
      scope,
      action,
    ),
  ).toEqual(response());
  expect(action).toHaveBeenCalledOnce();
});
it("rejects actor substitution before reaching the gateway", async () => {
  const gateway = journal(),
    action = vi.fn(async () => response());
  await expect(
    createFlightEnrichmentIdempotency(gateway as any, binding).execute(
      { ...scope, actorId: binding.accountId },
      action,
    ),
  ).rejects.toThrow("SCOPE");
  expect(gateway.invoke).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
});

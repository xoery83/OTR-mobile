import { createSourcePdfV2StorageProducer } from "./sourcePdfStorageProducer";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createSourcePdfRequestPreparation } from "./sourcePdfRequestPreparation";
import { createDevBackendHandler } from "./app";
function fixture() {
  const actor = randomUUID(),
    trip = randomUUID(),
    source = randomUUID(),
    representation = randomUUID(),
    operation = randomUUID();
  const command = {
    contract_version: 1,
    command: "PREPARE_REPRESENTATION",
    operation_id: operation,
    operation_key: "synthetic-prepare",
    operation_sha256: "a".repeat(64),
    actor_account_id: actor,
    trip_id: trip,
    source_id: source,
    payload: {
      material_revision: 1,
      expected_source_row_revision: 1,
      expected_source_state: { lifecycle: "ACTIVE", retention_state: "RETAINED" },
      representation_id: representation,
      expected_representation_row_revision: 1,
      expected_representation_state: {
        remote_state: "PENDING",
        retention_state: "RETAINED",
      },
    },
  };
  const receipt = {
    contract_version: 1,
    command: command.command,
    operation_id: operation,
    operation_key: command.operation_key,
    operation_sha256: command.operation_sha256,
    outcome: "APPLIED",
    error_code: null,
    completed_at: "2026-10-30T00:00:00.000000Z",
    source_id: source,
    representation_id: representation,
    result_source_row_revision: 1,
    result_material_revision: 1,
    result_representation_row_revision: 1,
    result_remote_state: "PENDING",
    result_retention_state: "RETAINED",
    result_action_id: null,
    result_verified_at: null,
    result_sha256: "b".repeat(64),
  };
  const trace: string[] = [];
  let xid = 0;
  const query = vi.fn(async (sql: string) => {
    trace.push(sql);
    if (sql.includes("session_user AS principal"))
      return {
        rows: [
          {
            principal: "otr_trip_source_command_gateway",
            role: "otr_trip_source_command_gateway",
            xid: String(++xid),
          },
        ],
      };
    if (sql.includes("pg_current_xact_id")) return { rows: [{ xid: String(++xid) }] };
    if (sql.includes("trip_source_universal_pdf_enter"))
      return { rows: [{ entered: true }] };
    if (sql.includes("trip_source_prepare_representation"))
      return { rows: [{ result: receipt }] };
    return { rows: [] };
  });
  const lease = { query, retire: vi.fn() };
  const gateway = {
    validateAccessToken: vi.fn(async () => ({ id: actor })),
    canReadTrip: vi.fn(async () => true),
  };
  const assertEnabled = vi.fn();
  const connection = {
    withLease: vi.fn(async (work: (l: typeof lease) => unknown) => work(lease)),
  };
  const factory = createSourcePdfRequestPreparation({
    gateway: gateway as never,
    connection: connection as never,
    workload: {
      ownerRun: randomUUID(),
      producerId: randomUUID(),
      providerInstanceSha256: "c".repeat(64),
    },
    nodeId: randomUUID(),
    stage: {} as never,
    providerForRequest: (guard) =>
      createSourcePdfV2StorageProducer(
        {
          instanceId: "synthetic",
          origin: "https://storage.example.invalid",
          credentialRef: "synthetic",
          serviceToken: "synthetic",
          timeoutMs: 500,
        },
        undefined,
        { accountId: actor, tripId: trip },
        guard,
      ),
    assertEnabled,
  });
  const request = () =>
    new Request(
      `https://dev.example.invalid/v2/trips/${trip}/sources/${source}/representations/${representation}/pdf-v4/${operation}/prepare`,
      {
        method: "POST",
        headers: { Authorization: "Bearer synthetic" },
        body: JSON.stringify(command),
      },
    );
  return {
    actor,
    trip,
    gateway,
    query,
    trace,
    assertEnabled,
    factory,
    request,
    receipt,
    command,
    connection,
    lease,
  };
}
it("composes the owning PREPARE path under normal request Auth/Trip, without a fake Session epoch", async () => {
  const f = fixture();
  expect(f.query).not.toHaveBeenCalled();
  const response = await createDevBackendHandler({
    gateway: f.gateway as never,
    sourcePdfV4PreparationForRequest: f.factory,
  })(f.request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    observation: "PREPARE_OBSERVED",
    receipt: f.receipt,
  });
  expect(f.query).toHaveBeenCalledWith(
    expect.stringContaining("trip_source_prepare_representation"),
    [f.actor, expect.any(String)],
  );
  expect(f.gateway.validateAccessToken.mock.calls.length).toBeGreaterThan(2);
  expect(f.gateway.canReadTrip).toHaveBeenCalledWith(f.actor, f.trip);
  expect(f.trace.at(-1)).toBe("COMMIT");
});
it.each(["actor", "Trip", "disabled"])(
  "request composition rejects %s before SQL",
  async (denied) => {
    const f = fixture();
    if (denied === "actor")
      f.gateway.validateAccessToken.mockResolvedValue({ id: randomUUID() });
    if (denied === "Trip") f.gateway.canReadTrip.mockResolvedValue(false);
    if (denied === "disabled")
      f.assertEnabled.mockImplementation(() => {
        throw Error("SOURCE_CAPABILITY_CLOSED");
      });
    await expect(f.factory(f.request(), f.actor)).rejects.toThrow();
    expect(f.query).not.toHaveBeenCalled();
  },
);
it("closed request ports reject reused asynchronous work and do not acquire another SQL lease", async () => {
  const f = fixture(),
    runtime = await f.factory(f.request(), f.actor);
  runtime.close();
  await expect(
    runtime.port.reservation.prepare(f.actor, JSON.stringify(f.command), {
      tripId: f.trip,
      sourceId: f.command.source_id,
      representationId: f.command.payload.representation_id,
      operationId: f.command.operation_id,
      accountGeneration: 1,
    }),
  ).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
  expect(f.query).not.toHaveBeenCalled();
});
it("Auth rejection after committed SQL withholds the response and never retries the write", async () => {
  const f = fixture();
  f.query.mockImplementation(async (sql: string) => {
    f.trace.push(sql);
    if (sql.includes("session_user AS principal"))
      return {
        rows: [
          {
            principal: "otr_trip_source_command_gateway",
            role: "otr_trip_source_command_gateway",
            xid: "before",
          },
        ],
      } as never;
    if (sql.includes("pg_current_xact_id")) return { rows: [{ xid: "after" }] } as never;
    if (sql.includes("trip_source_universal_pdf_enter"))
      return { rows: [{ entered: true }] } as never;
    if (sql.includes("trip_source_prepare_representation"))
      return { rows: [{ result: f.receipt }] } as never;
    if (sql === "COMMIT") f.gateway.canReadTrip.mockResolvedValue(false);
    return { rows: [] };
  });
  const response = await createDevBackendHandler({
    gateway: f.gateway as never,
    sourcePdfV4PreparationForRequest: f.factory,
  })(f.request());
  expect(response.status).toBe(403);
  expect(
    f.trace.filter((sql) => sql.includes("trip_source_prepare_representation")),
  ).toHaveLength(1);
  expect(f.trace.at(-1)).toBe("COMMIT");
});

it.each(["lease-close", "lease-abort", "enter-close", "enter-abort"])(
  "%s stops queued work before the owning write RPC",
  async (kind) => {
    const f = fixture(),
      controller = new AbortController();
    const runtime = await f.factory(
      new Request(f.request(), { signal: controller.signal }),
      f.actor,
    );
    const identity = {
      tripId: f.trip,
      sourceId: f.command.source_id,
      representationId: f.command.payload.representation_id,
      operationId: f.command.operation_id,
      accountGeneration: await runtime.port.owner.accountGeneration(f.actor),
    };
    let release!: () => void,
      reached = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (kind.startsWith("lease"))
      f.connection.withLease.mockImplementation(async (work) => {
        reached = true;
        await gate;
        return work(f.lease);
      });
    else {
      const previous = f.query.getMockImplementation()!;
      f.query.mockImplementation(async (sql) => {
        if (sql.includes("trip_source_universal_pdf_enter")) {
          reached = true;
          await gate;
        }
        return previous(sql);
      });
    }
    const pending = runtime.port.reservation.prepare(
      f.actor,
      JSON.stringify(f.command),
      identity,
    );
    await vi.waitFor(() => expect(reached).toBe(true));
    if (kind.endsWith("abort")) controller.abort();
    else runtime.close();
    release();
    await expect(pending).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
    expect(
      f.query.mock.calls.filter(([sql]) =>
        sql.includes("trip_source_prepare_representation"),
      ),
    ).toHaveLength(0);
  },
);

import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { enterSourcePdfContinuousScope } from "./sourcePdfContinuousScope";
import { createSourcePdfV2CausalAuthority } from "./sourcePdfCausalAuthority";
const identity = () => ({
  actorAccountId: randomUUID(),
  tripId: randomUUID(),
  sourceId: randomUUID(),
});
it.each([true, false])(
  "same held Source lease preserves SQL's exact eligibility %s",
  async (entered) => {
    const scope = identity(),
      query = vi.fn(async () => ({ rows: [{ entered }] }));
    expect(await enterSourcePdfContinuousScope({ query } as never, scope)).toBe(entered);
    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("trip_source_universal_pdf_enter"),
      [scope.actorAccountId, scope.tripId, scope.sourceId],
    );
  },
);
it.each([null, undefined, 1, "true"])(
  "malformed eligibility %s never becomes permission",
  async (entered) => {
    await expect(
      enterSourcePdfContinuousScope(
        { query: async () => ({ rows: [{ entered }] }) } as never,
        identity(),
      ),
    ).rejects.toThrow("PDF_SCOPE_RESPONSE_INVALID");
  },
);
it.each([undefined, true] as const)(
  "V4 admission scope opt-in %s preserves the same owning RPC/transaction",
  async (enabled) => {
    const scope = identity(),
      operation = randomUUID(),
      representation = randomUUID();
    const command = {
      contract_version: 1,
      command: "UPLOAD_ORIGINAL",
      operation_id: operation,
      operation_key: "synthetic",
      operation_sha256: "a".repeat(64),
      actor_account_id: scope.actorAccountId,
      trip_id: scope.tripId,
      source_id: scope.sourceId,
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
        parent_operation_id: randomUUID(),
        payload_sha256: "b".repeat(64),
        byte_count: 1000,
        mime_type: "application/pdf",
      },
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
        return { rows: [{ entered: false }] };
      if (sql.includes("trip_source_pdf_upload_v4_begin"))
        return { rows: [{ result: { receipt: { outcome: "APPLIED" } } }] };
      return { rows: [] };
    });
    const lease = { query, retire: vi.fn() };
    const authority = createSourcePdfV2CausalAuthority(
      { withLease: async (work: (l: typeof lease) => unknown) => work(lease) } as never,
      {
        ownerRun: randomUUID(),
        producerId: randomUUID(),
        providerInstanceSha256: "c".repeat(64),
        accountGeneration: async () => 1,
      },
      { continuousSourceScope: enabled },
    );
    expect(
      await authority.admit(scope.actorAccountId, JSON.stringify(command), 1, {
        attemptId: randomUUID(),
        resourceId: randomUUID(),
        nodeId: randomUUID(),
        resourceKey: "d".repeat(64),
        runToken: randomUUID(),
      }),
    ).toEqual({ receipt: { outcome: "APPLIED" } });
    const enter = trace.findIndex((sql) =>
      sql.includes("trip_source_universal_pdf_enter"),
    );
    expect(enter >= 0).toBe(enabled === true);
    if (enabled) {
      expect(enter).toBeGreaterThan(trace.indexOf("BEGIN"));
      expect(enter).toBeLessThan(
        trace.findIndex((sql) => sql.includes("trip_source_pdf_upload_v4_begin")),
      );
    }
    expect(trace.at(-1)).toBe("COMMIT");
  },
);
it("explicit PREPARE uses the same held transaction and remains closed without opt-in", async () => {
  const scope = identity();
  const command = {
    contract_version: 1,
    command: "PREPARE_REPRESENTATION",
    operation_id: randomUUID(),
    operation_key: "synthetic-prepare",
    operation_sha256: "a".repeat(64),
    actor_account_id: scope.actorAccountId,
    trip_id: scope.tripId,
    source_id: scope.sourceId,
    payload: {
      material_revision: 1,
      expected_source_row_revision: 1,
      expected_source_state: { lifecycle: "ACTIVE", retention_state: "RETAINED" },
      representation_id: randomUUID(),
      expected_representation_row_revision: 1,
      expected_representation_state: {
        remote_state: "PENDING",
        retention_state: "RETAINED",
      },
    },
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
      return { rows: [{ entered: false }] };
    if (sql.includes("trip_source_prepare_representation"))
      return { rows: [{ result: { outcome: "APPLIED" } }] };
    return { rows: [] };
  });
  const lease = { query, retire: vi.fn() };
  const connection = {
    withLease: async (work: (l: typeof lease) => unknown) => work(lease),
  };
  const owner = {
    ownerRun: randomUUID(),
    producerId: randomUUID(),
    providerInstanceSha256: "b".repeat(64),
    accountGeneration: async () => 3,
  };
  const raw = JSON.stringify(command);
  await expect(
    createSourcePdfV2CausalAuthority(connection as never, owner).prepare(
      scope.actorAccountId,
      raw,
      3,
    ),
  ).rejects.toThrow("SOURCE_CAPABILITY_CLOSED");
  expect(query).not.toHaveBeenCalled();
  const port = createSourcePdfV2CausalAuthority(connection as never, owner, {
    continuousSourceScope: true,
  });
  await expect(port.prepare(scope.actorAccountId, raw, 4)).rejects.toThrow(
    "PDF_SCOPE_FORBIDDEN",
  );
  expect(query).not.toHaveBeenCalled();
  expect(await port.prepare(scope.actorAccountId, raw, 3)).toEqual({
    outcome: "APPLIED",
  });
  const enter = trace.findIndex((sql) => sql.includes("trip_source_universal_pdf_enter"));
  const prepare = trace.findIndex((sql) =>
    sql.includes("trip_source_prepare_representation"),
  );
  expect(enter).toBeGreaterThan(trace.indexOf("BEGIN"));
  expect(prepare).toBeGreaterThan(enter);
  expect(trace.at(-1)).toBe("COMMIT");
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining("trip_source_prepare_representation"),
    [scope.actorAccountId, raw],
  );
});

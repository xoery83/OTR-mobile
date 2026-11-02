import { it } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createUniversalSourceReader } from "./universalSourceRead";
import { createDevBackendHandler } from "./app";
const actor = "20000000-0000-4000-8000-000000000001",
  trip = "10000000-0000-4000-8000-000000000001",
  batch = "30000000-0000-4000-8000-000000000001",
  taskId = "40000000-0000-4000-8000-000000000001",
  requestId = "50000000-0000-4000-8000-000000000001";
const source = "60000000-0000-4000-8000-000000000001",
  rep = "70000000-0000-4000-8000-000000000001",
  input = "80000000-0000-4000-8000-000000000001",
  run = "90000000-0000-4000-8000-000000000001";
const bytes = Buffer.from("synthetic"),
  sha = createHash("sha256").update(bytes).digest("hex");
const task = {
  account_id: actor,
  trip_id: trip,
  import_id: batch,
  task_id: taskId,
  run_id: run,
  manifest_sha256: "a".repeat(64),
  input_pins: [
    {
      kind: "SOURCE",
      input_id: input,
      source_id: source,
      representation_id: rep,
      material_revision: 1,
      payload_sha256: sha,
      byte_count: bytes.length,
    },
  ],
} as never;
const manifest = {
  accountId: actor,
  tripId: trip,
  batchId: batch,
  taskId,
  runId: run,
  submissionSha256: "a".repeat(64),
  representations: [
    {
      inputId: input,
      sourceId: source,
      representationId: rep,
      revision: 1,
      sha256: sha,
      byteCount: bytes.length,
      mime: "text/plain",
      text: bytes.toString(),
    },
  ],
};
it("preserves Source failures and correlates safe phases with the server request", async () => {
  const output: string[] = [],
    order: string[] = [];
  const originalLog = console.info;
  console.info = (line: unknown) => {
    output.push(String(line));
    order.push("log");
  };
  let checks = 0;
  function fixture(mode: string, id: string | undefined = requestId) {
    let snapshots = 0;
    const original = Object.assign(
      Error(mode === "sql" ? "Query read timeout" : "sensitive-token SQL /private/path"),
      { code: "57014" },
    );
    const connection = {
      withLease: async (work: any) => {
        if (mode === "lease") throw original;
        return work({
          query: async (sql: string) => {
            if (sql === "ROLLBACK") {
              order.push("rollback");
              if (mode === "sql") throw Error("sensitive-rollback");
            }
            if (sql.includes(" AS manifest")) {
              snapshots++;
              if (mode === "sql" || (mode === "second" && snapshots === 2))
                throw original;
              const m = structuredClone(manifest);
              if (mode === "secondpin") {
                m.representations.push({
                  ...m.representations[0],
                  inputId: "80000000-0000-4000-8000-000000000002",
                  representationId: "70000000-0000-4000-8000-000000000002",
                });
              }
              if (mode === "binary") {
                m.representations[0].mime = "image/jpeg";
                m.representations[0].text = null as never;
              }
              return { rows: [{ manifest: m }] };
            }
            return { rows: [] };
          },
          retire() {
            order.push("retire");
          },
        });
      },
    };
    const read = createUniversalSourceReader({
      connection,
      continuous: true,
      diagnosticRequestId: id,
      readBinary: async () => {
        throw original;
      },
    });
    return { read, original };
  }
  try {
    for (const [mode, stage, snapshot] of [
      ["sql", "SOURCE_SQL", "FIRST"],
      ["lease", "LEASE", "FIRST"],
      ["binary", "BINARY_READ", "FIRST"],
      ["second", "SOURCE_SQL", "SECOND"],
    ]) {
      output.length = 0;
      order.length = 0;
      const f = fixture(mode);
      await assert.rejects(f.read(task), (error) => error === f.original);
      assert.equal(output.length, 1);
      const event = JSON.parse(output[0]);
      assert.equal(event.event, "universal_source_read_failed");
      assert.equal(event.requestId, requestId);
      assert.equal(event.stage, stage);
      assert.equal(event.snapshot, snapshot);
      assert.deepEqual(Object.keys(event).sort(), [
        "code",
        "event",
        "kind",
        "requestId",
        "snapshot",
        "sqlState",
        "stage",
      ]);
      assert.equal(event.sqlState, "57014");
      assert.ok(!output[0].includes("sensitive"));
      assert.ok(!output[0].includes("/private"));
      if (mode === "sql") {
        assert.equal(event.code, "PG_QUERY_TIMEOUT");
        assert.ok(order.indexOf("log") < order.indexOf("rollback"));
        assert.ok(order.includes("retire"));
      }
      checks++;
    }
    output.length = 0;
    const two = structuredClone(task) as any;
    two.input_pins.push({
      ...two.input_pins[0],
      input_id: "80000000-0000-4000-8000-000000000002",
      representation_id: "70000000-0000-4000-8000-000000000002",
      source_id: "60000000-0000-4000-8000-000000000002",
    });
    await assert.rejects(fixture("secondpin").read(two));
    assert.equal(JSON.parse(output[0]).stage, "PIN_VALIDATION");
    checks++;
    output.length = 0;
    assert.equal((await fixture("positive").read(task)).representations.length, 1);
    assert.equal(output.length, 0);
    checks++;
    output.length = 0;
    await fixture("sql", "not-a-safe-id")
      .read(task)
      .catch(() => {});
    assert.equal(output.length, 0);
    checks++;
    console.info = () => {
      throw Error("LOG_FAILURE");
    };
    const fail = fixture("sql");
    await assert.rejects(fail.read(task), (error) => error === fail.original);
    checks++;
    console.info = (line: unknown) => {
      output.push(String(line));
    };
    output.length = 0;
    const requestEvents: any[] = [];
    const handler = createDevBackendHandler({
      gateway: {
        validateAccessToken: async () => ({ id: actor }),
        canReadTrip: async () => true,
      } as never,
      log: (e) => requestEvents.push(e),
      universalRuntimeForRequest: async (_request, a, id) => ({
        universalImportPort: {
          readContext: async () => ({
            version: "otr.backend.universal-context/1",
            actorId: a,
            accountId: a,
            tripId: trip,
            batchId: batch,
            taskId,
          }),
          execute: async () => {
            throw Error("NO_EXECUTE");
          },
          read: async () => {
            await fixture("sql", id).read(task);
            return null;
          },
        },
      }),
    });
    const context = await handler(
      new Request(
        `https://local.invalid/v2/import-batches/${batch}/interpretations?tripId=${trip}`,
        { headers: { Authorization: "Bearer synthetic" } },
      ),
    );
    assert.equal(context.status, 200);
    const response = await handler(
      new Request(
        `https://local.invalid/v2/import-batches/${batch}/interpretations/${taskId}?tripId=${trip}`,
        {
          headers: {
            Authorization: "Bearer synthetic",
            "X-Request-Id": "client-value-must-not-be-trusted",
          },
        },
      ),
    );
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error.code, "BACKEND_UNAVAILABLE");
    const id = response.headers.get("X-Request-Id");
    assert.equal(body.error.requestId, id);
    assert.notEqual(id, "client-value-must-not-be-trusted");
    assert.equal(requestEvents.at(-1).requestId, id);
    assert.equal(JSON.parse(output[0]).requestId, id);
    checks++;
  } finally {
    console.info = originalLog;
  }
  assert.equal(checks, 9);
});

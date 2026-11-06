import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import type { Json } from "../../src/domain/trip/eventIntentJson";
import { importDigest } from "../../src/domain/trip/flightImportReview";
import { publicationTestHash as hash } from "./__fixtures__/tripCoreV2CandidatePublication";
import {
  createUniversalOriginalSourceConnection,
  universalOriginalSourceBoundary,
} from "./universalOriginalSource";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import { createUniversalContinuousHost } from "./universalContinuousHost";
import { universalBoundary } from "./universalImport";
import { universalBatchIdentity } from "./universalBatchSource";
import { initializeUniversalTaskDatabase } from "./universalTaskBootstrap";
import {
  mixedBInitialDigest,
  mixedBInitialManifestSchema,
} from "./universalMixedBTaskReservation";
import type { CorePgLease } from "./tripCoreV2PgStorage";

const actor = randomUUID(),
  trip = randomUUID();
async function envelope(file: boolean) {
  const text = "\ufeffHarbour QA Hotel\r\n中文",
    bytes = new TextEncoder().encode(text),
    digest = await hash(bytes);
  return {
    contract_version: 1,
    command: "ACQUIRE_SOURCE",
    operation_id: randomUUID(),
    operation_key: randomUUID(),
    actor_account_id: actor,
    trip_id: trip,
    source_id: randomUUID(),
    operation_sha256: "a".repeat(64),
    payload: {
      acquisition_key: "key",
      acquisition_sha256: "a".repeat(64),
      source_input: {
        source_kind: file ? "FILE" : "TEXT",
        acquisition_channel: file ? "FILES" : "PASTE",
        captured_at: null,
        capture_time_basis: "UNKNOWN",
      },
      capture: { completeness: "AS_SUPPLIED", capture_sha256: "a".repeat(64) },
      original: {
        id: randomUUID(),
        material_kind: "TEXT",
        original_filename: file ? "Original.txt" : null,
        part_key: null,
        mime_type: null,
        encoding: "UTF-8",
        payload_sha256: digest,
        byte_count: bytes.length,
        text_content: text,
        locator_uri: null,
      },
    },
  };
}
async function result(
  q: Pick<
    Awaited<ReturnType<typeof envelope>>,
    "operation_id" | "operation_key" | "command" | "operation_sha256" | "source_id"
  > & { payload: { original: { id: string } } },
  remote = "NOT_APPLICABLE",
  verifiedAt: string | null = null,
) {
  const r = {
    contract_version: 1,
    operation_id: q.operation_id,
    operation_key: q.operation_key,
    command: q.command,
    operation_sha256: q.operation_sha256,
    outcome: "APPLIED",
    error_code: null,
    completed_at: "2026-10-24T00:00:00.000000Z",
    source_id: q.source_id,
    result_source_row_revision: 1,
    result_material_revision: 1,
    representation_id: q.payload.original.id,
    result_representation_row_revision: 1,
    result_remote_state: remote,
    result_retention_state: "RETAINED",
    result_action_id: randomUUID(),
    result_verified_at: verifiedAt,
    result_sha256: "",
  };
  r.result_sha256 = await importDigest(
    "otr-source-result-v1",
    [
      1,
      r.operation_id,
      r.command,
      r.operation_sha256,
      r.outcome,
      r.error_code,
      r.completed_at,
      1,
      1,
      1,
      r.result_remote_state,
      r.result_retention_state,
      r.result_action_id,
      r.result_verified_at,
    ],
    hash,
  );
  return r;
}
const request = (path: string, body: unknown) =>
  new Request(`http://local/v2/trips/${trip}/universal-source-originals/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
it.each([false, true])(
  "uses the existing pinned owning RPC and transaction for file=%s, with exact receipt lookup",
  async (file) => {
    const q = await envelope(file),
      r = await result(q),
      queries: string[] = [];
    const connection = createUniversalOriginalSourceConnection(
      {
        withLease: async (work) =>
          work({
            retire: vi.fn(),
            query: async (sql, parameters) => {
              queries.push(sql);
              if (sql.startsWith("SELECT")) {
                expect(parameters?.[0]).toBe(actor);
                return { rows: [{ result: r }] };
              }
              return { rows: [] };
            },
          }),
      },
      hash,
    );
    expect(await connection.acquire(actor, trip, q)).toEqual(r);
    expect(await connection.lookup(actor, trip, q)).toEqual(r);
    expect(queries[0]).toMatch(/^BEGIN/);
    expect(queries[1]).toContain("trip_source_acquire_universal_original");
    expect(queries[2]).toBe("COMMIT");
    expect(queries[4]).toContain("trip_source_lookup_universal_original");
  },
);
it("defaults CLOSED; fences Trip and malformed original without leasing SQL", async () => {
  const lease = vi.fn(),
    c = createUniversalOriginalSourceConnection({ withLease: lease }, hash),
    q = await envelope(true);
  expect(
    (
      await universalOriginalSourceBoundary(
        request("acquire", q),
        actor,
        async () => true,
      )
    ).status,
  ).toBe(503);
  expect(
    (
      await universalOriginalSourceBoundary(
        request("acquire", q),
        actor,
        async () => false,
        c,
      )
    ).status,
  ).toBe(403);
  await expect(c.acquire(randomUUID(), trip, q)).rejects.toThrow("SOURCE_ACCESS_DENIED");
  await expect(
    c.acquire(actor, trip, {
      ...q,
      payload: {
        ...q.payload,
        original: { ...q.payload.original, original_filename: "Wrong.pdf" },
      },
    }),
  ).rejects.toThrow();
  expect(lease).not.toHaveBeenCalled();
});
it("preserves UNKNOWN on SQL failure and accepts null lookup without attempting a write", async () => {
  const q = await envelope(false),
    queries: string[] = [];
  const c = createUniversalOriginalSourceConnection(
    {
      withLease: async (work) =>
        work({
          retire: vi.fn(),
          query: async (sql) => {
            queries.push(sql);
            if (sql.includes("acquire")) throw new Error("SOURCE_IO_UNAVAILABLE");
            return { rows: sql.startsWith("SELECT") ? [{ result: null }] : [] };
          },
        }),
    },
    hash,
  );
  await expect(c.acquire(actor, trip, q)).rejects.toThrow("SOURCE_IO_UNAVAILABLE");
  expect(queries.at(-1)).toBe("ROLLBACK");
  expect(await c.lookup(actor, trip, q)).toBeNull();
  expect(queries.at(-1)).toBe("COMMIT");
});

it("maps the actual UTF8 FILE helper error to422 before SQL, rather than retryable IO", async () => {
  const lease = vi.fn(),
    c = createUniversalOriginalSourceConnection({ withLease: lease }, hash),
    q = await envelope(true);
  q.payload.original.original_filename = "Wrong.pdf";
  const response = await universalOriginalSourceBoundary(
    request("acquire", q),
    actor,
    async () => true,
    c,
  );
  expect(response.status).toBe(422);
  expect(lease).not.toHaveBeenCalled();
});

async function pendingPdfFixture(remote = "PENDING", verifiedAt: string | null = null) {
  const base = await envelope(true),
    r = await result(base, remote, verifiedAt);
  const q = {
    ...base,
    payload: {
      ...base.payload,
      original: {
        ...base.payload.original,
        material_kind: "BINARY",
        original_filename: "Retained.pdf",
        mime_type: "application/pdf",
        encoding: null,
        text_content: null,
        byte_count: 1700,
        payload_sha256: "b".repeat(64),
      },
    },
  };
  const query = vi.fn(async (sql: string) => ({
    rows: sql.startsWith("SELECT") ? [{ result: r }] : [],
  }));
  const lease = vi.fn(async (work: any) => work({ query, retire: vi.fn() }));
  return { q, r, query, lease, connection: { withLease: lease } };
}
it("pending PDF metadata is closed before SQL unless explicitly composed", async () => {
  const f = await pendingPdfFixture();
  const source = createUniversalOriginalSourceConnection(f.connection, hash);
  await expect(source.acquire(actor, trip, f.q)).rejects.toThrow(
    "UNIVERSAL_SOURCE_SCOPE_CLOSED",
  );
  expect(f.lease).not.toHaveBeenCalled();
});
it("explicit pending metadata uses the same owning acquire/lookup and never claims verified bytes", async () => {
  const f = await pendingPdfFixture();
  const source = createUniversalOriginalSourceConnection(f.connection, hash, {
    pendingPdf: true,
  });
  expect(await source.acquire(actor, trip, f.q)).toEqual(f.r);
  expect(await source.lookup(actor, trip, f.q)).toEqual(f.r);
  expect(
    f.query.mock.calls.filter(([sql]) => sql.startsWith("SELECT")).map(([sql]) => sql),
  ).toEqual([
    "SELECT public.trip_source_acquire_universal_original($1::uuid,$2) AS result",
    "SELECT public.trip_source_lookup_universal_original($1::uuid,$2) AS result",
  ]);
});
it.each(["VERIFIED", "NOT_APPLICABLE"])(
  "PDF acquisition cannot turn %s into a valid pending receipt",
  async (remote) => {
    const f = await pendingPdfFixture(remote);
    const source = createUniversalOriginalSourceConnection(f.connection, hash, {
      pendingPdf: true,
    });
    await expect(source.acquire(actor, trip, f.q)).rejects.toThrow("REPLAY_UNAVAILABLE");
  },
);
it("a PENDING receipt cannot already contain verification evidence", async () => {
  const f = await pendingPdfFixture("PENDING", "2026-10-29T00:00:00.000000Z");
  const source = createUniversalOriginalSourceConnection(f.connection, hash, {
    pendingPdf: true,
  });
  await expect(source.acquire(actor, trip, f.q)).rejects.toThrow("REPLAY_UNAVAILABLE");
});
it.each(["actor", "trip", "media", "encoding", "text", "locator", "oversize"] as const)(
  "pending metadata refuses %s drift without SQL",
  async (drift) => {
    const f = await pendingPdfFixture();
    let q: any = f.q;
    if (drift === "actor") q = { ...q, actor_account_id: randomUUID() };
    else if (drift === "trip") q = { ...q, trip_id: randomUUID() };
    else
      q = {
        ...q,
        payload: {
          ...q.payload,
          original: {
            ...q.payload.original,
            ...(drift === "media"
              ? { mime_type: "image/jpeg" }
              : drift === "encoding"
                ? { encoding: "UTF-8" }
                : drift === "text"
                  ? { text_content: "fake OCR" }
                  : drift === "locator"
                    ? { locator_uri: "https://other.invalid/file.pdf" }
                    : { byte_count: 4194305 }),
          },
        },
      };
    const source = createUniversalOriginalSourceConnection(f.connection, hash, {
      pendingPdf: true,
    });
    await expect(source.acquire(actor, trip, q)).rejects.toThrow();
    expect(f.lease).not.toHaveBeenCalled();
  },
);
it("the pending-PDF software option cannot be enabled by request JSON", async () => {
  const f = await pendingPdfFixture();
  const c = createUniversalOriginalSourceConnection(f.connection, hash);
  const response = await universalOriginalSourceBoundary(
    request("acquire", { ...f.q, pendingPdf: true }),
    actor,
    async () => true,
    c,
  );
  expect(response.status).toBe(422);
  expect(f.lease).not.toHaveBeenCalled();
});
it("normal HTTP keeps a composed text-only Source port closed to pending PDF", async () => {
  const f = await pendingPdfFixture();
  const c = createUniversalOriginalSourceConnection(f.connection, hash);
  const response = await universalOriginalSourceBoundary(
    request("acquire", f.q),
    actor,
    async () => true,
    c,
  );
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe("SOURCE_CAPABILITY_CLOSED");
  expect(f.lease).not.toHaveBeenCalled();
});

async function pendingPngFixture() {
  const f = await pendingPdfFixture();
  f.q.payload.source_input.source_kind = "IMAGE";
  f.q.payload.original.original_filename = "Retained.png";
  f.q.payload.original.mime_type = "image/png";
  return f;
}
it("pending PNG metadata cannot borrow the PDF capability or enable itself over HTTP", async () => {
  const f = await pendingPngFixture();
  const port = createUniversalOriginalSourceConnection(f.connection, hash, {
    pendingPdf: true,
  });
  await expect(port.acquire(actor, trip, f.q)).rejects.toThrow(
    "UNIVERSAL_SOURCE_SCOPE_CLOSED",
  );
  expect(f.lease).not.toHaveBeenCalled();
  const closed = createUniversalOriginalSourceConnection(f.connection, hash);
  const response = await universalOriginalSourceBoundary(
    request("acquire", { ...f.q, pendingPng: true }),
    actor,
    async () => true,
    closed,
  );
  expect(response.status).toBe(422);
  expect(f.lease).not.toHaveBeenCalled();
});
it("explicit pending PNG uses existing Source receipts but does not claim PNG validation", async () => {
  const f = await pendingPngFixture();
  const port = createUniversalOriginalSourceConnection(f.connection, hash, {
    pendingPng: true,
  });
  expect(await port.acquire(actor, trip, f.q)).toEqual(f.r);
  expect(await port.lookup(actor, trip, f.q)).toEqual(f.r);
  expect(
    f.query.mock.calls.filter(([sql]) => sql.startsWith("SELECT")).map(([sql]) => sql),
  ).toEqual([
    "SELECT public.trip_source_acquire_universal_original($1::uuid,$2) AS result",
    "SELECT public.trip_source_lookup_universal_original($1::uuid,$2) AS result",
  ]);
});

it.each(["VERIFIED", "NOT_APPLICABLE"])(
  "pending PNG refuses a premature %s receipt",
  async (state) => {
    const f = await pendingPngFixture();
    Object.assign(f.r, await result(f.q as never, state));
    const port = createUniversalOriginalSourceConnection(f.connection, hash, {
      pendingPng: true,
    });
    await expect(port.acquire(actor, trip, f.q)).rejects.toThrow("REPLAY_UNAVAILABLE");
  },
);
it("pending PNG capability does not open PDF intake", async () => {
  const f = await pendingPdfFixture();
  const port = createUniversalOriginalSourceConnection(f.connection, hash, {
    pendingPng: true,
  });
  await expect(port.acquire(actor, trip, f.q)).rejects.toThrow(
    "UNIVERSAL_SOURCE_SCOPE_CLOSED",
  );
  expect(f.lease).not.toHaveBeenCalled();
});

it("recovers an expired UTF8 receipt only in a fresh transaction after rollback and lease release", async () => {
  const q = await envelope(true),
    receipt = await result(q),
    trace: string[] = [];
  let leaseNumber = 0;
  const c = createUniversalOriginalSourceConnection(
    {
      withLease: async (work) => {
        const lease = ++leaseNumber;
        trace.push(`lease:${lease}`);
        try {
          return await work({
            retire: vi.fn(),
            query: async (sql, parameters) => {
              trace.push(`${lease}:${sql}`);
              if (sql.includes("trip_source_lookup_universal_original"))
                throw Error("UNIVERSAL_SOURCE_SCOPE_CLOSED");
              if (sql.includes("trip_source_operation_lookup")) {
                expect(parameters).toEqual([
                  actor,
                  trip,
                  q.source_id,
                  q.operation_id,
                  q.operation_key,
                  q.operation_sha256,
                ]);
                return { rows: [{ result: receipt }] };
              }
              return { rows: [] };
            },
          });
        } finally {
          trace.push(`release:${lease}`);
        }
      },
    },
    hash,
  );
  expect(await c.lookup(actor, trip, q)).toEqual(receipt);
  expect(trace).toEqual([
    "lease:1",
    "1:BEGIN ISOLATION LEVEL READ COMMITTED",
    "1:SELECT public.trip_source_lookup_universal_original($1::uuid,$2) AS result",
    "1:ROLLBACK",
    "release:1",
    "lease:2",
    "2:BEGIN ISOLATION LEVEL READ COMMITTED",
    "2:SELECT public.trip_source_operation_lookup($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6) AS result",
    "2:COMMIT",
    "release:2",
  ]);
});

it.each([
  "SOURCE_ACCESS_DENIED",
  "INVALID_SOURCE_COMMAND",
  "INVALID_SOURCE_HASH",
  "SOURCE_IO_UNAVAILABLE",
  "UNKNOWN",
])("does not turn %s into receipt recovery or another command", async (code) => {
  const q = await envelope(true),
    queries: string[] = [];
  const c = createUniversalOriginalSourceConnection(
    {
      withLease: async (work) =>
        work({
          retire: vi.fn(),
          query: async (sql) => {
            queries.push(sql);
            if (sql.startsWith("SELECT")) throw Error(code);
            return { rows: [] };
          },
        }),
    },
    hash,
  );
  await expect(c.lookup(actor, trip, q)).rejects.toThrow(code);
  expect(queries).toEqual([
    "BEGIN ISOLATION LEVEL READ COMMITTED",
    "SELECT public.trip_source_lookup_universal_original($1::uuid,$2) AS result",
    "ROLLBACK",
  ]);
});

it.each([
  "absent",
  "denied",
  "wrong-representation",
  "bad-proof",
  "non-final",
  "not-retained",
])("expired UTF8 recovery refuses %s instead of inviting a new ACQUIRE", async (kind) => {
  const q = await envelope(true),
    receipt = await result(q),
    queries: string[] = [];
  if (kind === "wrong-representation") receipt.representation_id = randomUUID();
  if (kind === "bad-proof") receipt.result_sha256 = "f".repeat(64);
  if (kind === "not-retained") receipt.result_retention_state = "PURGED";
  const c = createUniversalOriginalSourceConnection(
    {
      withLease: async (work) =>
        work({
          retire: vi.fn(),
          query: async (sql) => {
            queries.push(sql);
            if (sql.includes("trip_source_lookup_universal_original"))
              throw Error("UNIVERSAL_SOURCE_SCOPE_CLOSED");
            if (sql.includes("trip_source_operation_lookup")) {
              if (kind === "denied") throw Error("SOURCE_ACCESS_DENIED");
              return {
                rows: [
                  {
                    result:
                      kind === "absent"
                        ? null
                        : kind === "non-final"
                          ? { phase: "IO_UNKNOWN" }
                          : receipt,
                  },
                ],
              };
            }
            return { rows: [] };
          },
        }),
    },
    hash,
  );
  await expect(c.lookup(actor, trip, q)).rejects.toThrow(
    kind === "absent"
      ? "UNIVERSAL_SOURCE_SCOPE_CLOSED"
      : kind === "denied"
        ? "SOURCE_ACCESS_DENIED"
        : "REPLAY_UNAVAILABLE",
  );
  expect(
    queries.filter((sql) => sql.includes("trip_source_operation_lookup")),
  ).toHaveLength(1);
  expect(queries.some((sql) => sql.includes("trip_source_acquire"))).toBe(false);
});

it("does not widen the UTF8 receipt recovery to a submitted-text profile", async () => {
  const q = await envelope(false),
    queries: string[] = [];
  const c = createUniversalOriginalSourceConnection(
    {
      withLease: async (work) =>
        work({
          retire: vi.fn(),
          query: async (sql) => {
            queries.push(sql);
            if (sql.startsWith("SELECT")) throw Error("UNIVERSAL_SOURCE_SCOPE_CLOSED");
            return { rows: [] };
          },
        }),
    },
    hash,
  );
  await expect(c.lookup(actor, trip, q)).rejects.toThrow("UNIVERSAL_SOURCE_SCOPE_CLOSED");
  expect(queries.some((sql) => sql.includes("trip_source_operation_lookup"))).toBe(false);
});

async function withMixedBFirstFixture(
  work: (fixture: Awaited<ReturnType<typeof mixedBSourceFixture>>) => Promise<void>,
) {
  const directory = mkdtempSync(join(tmpdir(), "otr-mixed-b-first-source-"));
  const sql = new DatabaseSync(join(directory, "task.sqlite"));
  const observer = new DatabaseSync(join(directory, "task.sqlite"));
  try {
    initializeUniversalTaskDatabase(sql);
    sql.exec(
      readFileSync(
        new URL(
          "../sql/universal_mixed_b_task_reservation_candidate.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await work(await mixedBSourceFixture(sql, observer));
  } finally {
    observer.close();
    sql.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

async function mixedBSourceFixture(sql: DatabaseSync, observer: DatabaseSync) {
  const { q: pdf } = await pendingPdfFixture();
  const text = await envelope(false);
  const png = {
    ...pdf,
    source_id: randomUUID(),
    operation_id: randomUUID(),
    operation_key: randomUUID(),
    payload: {
      ...pdf.payload,
      source_input: { ...pdf.payload.source_input, source_kind: "IMAGE" },
      original: {
        ...pdf.payload.original,
        id: randomUUID(),
        original_filename: "Original.png",
        mime_type: "image/png",
      },
    },
  };
  const batchId = randomUUID();
  const initial = mixedBInitialManifestSchema.parse({
    version: "otr.import.mixed-b-initial/1",
    actorId: actor,
    tripId: trip,
    batchId,
    runId: universalBatchIdentity(actor, trip, batchId, "run"),
    taskId: universalBatchIdentity(actor, trip, batchId, "task"),
    submissionSha256: "c".repeat(64),
    originals: [png, pdf, text].map((q, ordinal) => ({
      ordinal,
      profile: [
        "OTR_PNG_CAPTURE_ORIGINAL_V1",
        "OTR_PDF_CAPTURE_ORIGINAL_V1",
        "OTR_SUBMITTED_TEXT_V1",
      ][ordinal],
      inputId: randomUUID(),
      sourceId: q.source_id,
      originalRepresentationId: q.payload.original.id,
      sha256: q.payload.original.payload_sha256,
      byteCount: q.payload.original.byte_count,
      operationId: q.operation_id,
      operationKey: q.operation_key,
      operationSha256: q.operation_sha256,
    })),
  });
  const reply = {
    version: "otr.import.mixed-b-pristine/1",
    initialManifestSha256: mixedBInitialDigest(initial),
    firstCommandSha256: await importDigest(
      "otr.import.mixed-b-first-acquire/1",
      png as Json,
      hash,
    ),
  };
  const receipts = new Map([
    [png.operation_id, await result(png, "PENDING")],
    [pdf.operation_id, await result(pdf, "PENDING")],
    [text.operation_id, await result(text)],
  ]);
  const phase = () =>
    observer
      .prepare("SELECT phase FROM universal_mixed_b_task_reservations WHERE task_id=?")
      .get(initial.taskId)?.phase;
  const calls: { sql: string; leaseId: number; phase: unknown }[] = [];
  let leaseId = 0;
  let checks = 0;
  const assertCurrent = vi.fn();
  const behavior = {
    nextOrdinal: 0,
    proof(_attempt: number, envelope?: { version?: string; command?: { operation_id: string } }): unknown {
      if (envelope?.version === "otr.import.mixed-b-acquire-next/1" || envelope?.command) {
        const ordinal = envelope.command
          ? initial.originals.findIndex((pin) => pin.operationId === envelope.command?.operation_id)
          : behavior.nextOrdinal;
        return {
          version: "otr.import.mixed-b-acquire-current/1",
          initialManifestSha256: mixedBInitialDigest(initial),
          ordinal,
        };
      }
      return reply;
    },
    lookup(_operation: string): unknown { return null; },
    beforeCommit() {},
  };
  const c = createUniversalOriginalSourceConnection(
    {
      withLease: async (work) => {
        const current = ++leaseId;
        return work({
          retire: vi.fn(),
          query: (async (statement: string, params?: readonly unknown[]) => {
            calls.push({ sql: statement, leaseId: current, phase: phase() });
            if (statement.includes("find_finite"))
              return { rows: [{ result: behavior.proof(++checks, JSON.parse(String(params?.[6]))) }] };
            if (statement.includes("lookup_universal"))
              return { rows: [{ result: behavior.lookup(JSON.parse(String(params?.[1])).operation_id) }] };
            if (statement.includes("acquire_universal"))
              return { rows: [{ result: receipts.get(JSON.parse(String(params?.[1])).operation_id) }] };
            if (statement === "COMMIT") behavior.beforeCommit();
            return { rows: [] };
          }) as CorePgLease["query"],
        });
      },
    },
    hash,
    {
      pendingPng: true,
      pendingPdf: true,
      mixedBInitial: { manifest: initial, taskDb: sql, assertCurrent },
    },
  );
  return { c, png, pdf, text, initial, phase, calls, behavior, reply, assertCurrent, sql, receipts };
}

it("mixed B uses a passive Context proof, then reserves between two proofs on one PG lease", () =>
  withMixedBFirstFixture(async ({ c, png, initial, calls, phase }) => {
    await c.proveInitialMixedBTaskAbsent(
      actor,
      trip,
      initial.batchId,
      mixedBInitialDigest(initial),
    );
    expect(phase()).toBeUndefined();
    expect(calls.map((x) => x.sql.startsWith("SELECT"))).toEqual([false, true, false]);
    calls.length = 0;
    await c.acquire(actor, trip, png);
    expect(calls.map((x) => x.leaseId)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(calls.map((x) => x.phase)).toEqual([
      undefined,
      undefined,
      undefined,
      "RESERVED",
      "RESERVED",
      "RESERVED",
    ]);
    expect(calls[4].sql).toContain("trip_source_acquire_universal_original");
    expect(phase()).toBe("RESERVED");
  }));

it("mixed B rejects a caller command with changed non-pin metadata before creating a reservation", () =>
  withMixedBFirstFixture(async ({ c, png, pdf, initial, calls, phase }) => {
    await expect(
      c.proveInitialMixedBTaskAbsent(
        actor,
        trip,
        randomUUID(),
        mixedBInitialDigest(initial),
      ),
    ).rejects.toThrow("MIXED_B_INITIAL_BINDING");
    await expect(
      c.proveInitialMixedBTaskAbsent(actor, trip, initial.batchId, "f".repeat(64)),
    ).rejects.toThrow("MIXED_B_INITIAL_BINDING");
    await expect(c.acquire(actor, trip, pdf)).rejects.toThrow(
      "MIXED_B_TASK_FENCE",
    );
    expect(calls.some(({ sql }) => sql.includes("acquire_universal"))).toBe(false);
    const changed = {
      ...png,
      payload: {
        ...png.payload,
        original: { ...png.payload.original, original_filename: "Changed.png" },
      },
    };
    await expect(c.acquire(actor, trip, changed)).rejects.toThrow(
      "MIXED_B_SOURCE_NOT_PRISTINE",
    );
    expect(calls.at(-1)?.sql).toBe("ROLLBACK");
    expect(phase()).toBeUndefined();
    expect(initial.originals[0].operationSha256).toBe(changed.operation_sha256);
  }));

it("uses the same reservation for successor proofs and reads an exact FINAL replay by its original key", () =>
  withMixedBFirstFixture(async ({ c, png, pdf, text, calls, phase, behavior, receipts }) => {
    await c.acquire(actor, trip, png);
    expect(phase()).toBe("RESERVED");
    calls.length = 0;
    behavior.lookup = (operation) => operation === png.operation_id ? receipts.get(operation) : null;
    expect(await c.acquire(actor, trip, png)).toEqual(receipts.get(png.operation_id));
    expect(calls.some(({ sql }) => sql.includes("acquire_universal"))).toBe(false);
    await c.acquire(actor, trip, pdf);
    await c.acquire(actor, trip, text);
    expect(calls.filter(({ sql }) => sql.includes("acquire_universal")).map(({ phase }) => phase))
      .toEqual(["RESERVED", "RESERVED"]);
    behavior.lookup = () => ({ phase: "IO_UNKNOWN" });
    const before = calls.length;
    await expect(c.acquire(actor, trip, text)).rejects.toThrow();
    expect(calls.slice(before).some(({ sql }) => sql.includes("acquire_universal"))).toBe(false);
    expect(phase()).toBe("RESERVED");
  }));

it("mixed B rolls back an ACQUIRE with an invalid receipt and keeps the original reservation", () =>
  withMixedBFirstFixture(async ({ c, png, phase, calls, receipts }) => {
    Object.assign(receipts.get(png.operation_id)!, { result_sha256: "0".repeat(64) });

    await expect(c.acquire(actor, trip, png)).rejects.toThrow("REPLAY_UNAVAILABLE");
    expect(calls.at(-1)?.sql).toBe("ROLLBACK");
    expect(phase()).toBe("RESERVED");

    await expect(c.acquire(actor, trip, png)).rejects.toThrow("MIXED_B_TASK_FENCE");
    expect(calls.filter(({ sql }) => sql.includes("acquire_universal"))).toHaveLength(1);
    expect(phase()).toBe("RESERVED");
  }));

it.each(["proof", "commit"])(
  "mixed B preserves reservation across uncertain %s without a new ACQUIRE",
  (point) =>
    withMixedBFirstFixture(async ({ c, png, behavior, reply, phase, calls }) => {
      if (point === "proof") behavior.proof = (attempt) => (attempt === 2 ? null : reply);
      else
        behavior.beforeCommit = () => {
          throw Error("TEST_COMMIT_UNKNOWN");
        };
      await expect(c.acquire(actor, trip, png)).rejects.toThrow(
        point === "proof" ? "MIXED_B_SOURCE_NOT_PRISTINE" : "TEST_COMMIT_UNKNOWN",
      );
      expect(phase()).toBe("RESERVED");
      const acquisitions = () =>
        calls.filter((x) => x.sql.includes("acquire_universal")).length;
      expect(acquisitions()).toBe(point === "commit" ? 1 : 0);
      await expect(c.acquire(actor, trip, png)).rejects.toThrow();
      expect(acquisitions()).toBe(point === "commit" ? 1 : 0);
      expect(phase()).toBe("RESERVED");
    }),
);

it("normal Context GET maps only exact combined pristine proof to protected-B 404", () =>
  withMixedBFirstFixture(
    async ({ c, sql, initial, png, phase, calls, behavior, reply }) => {
      const defaultProof = behavior.proof;
      const forbidden = vi.fn(async () => {
        throw Error("UNEXPECTED_IO");
      });
      const db = initializeUniversalTaskDatabase(sql);
      const context = await captureAccountRequestContext(trip, async () => actor);
      const ordinaryLookup = vi.fn<() => Promise<null>>(async () => null);
      let active = true;
      const host = createUniversalContinuousHost({
        enabled: true,
        context,
        finiteDeadline: new Date(Date.now() + 60000).toISOString(),
        mixedBInitial: initial,
        mixedBPristineSource: c,
        db,
        assertCurrentAuth: async () => {},
        assertNewExecutionAllowed() {
          if (!active) throw Error("FIXTURE_SCOPE_CLOSED");
        },
        catalogConnection: { withLease: forbidden },
        bootstrapLedger: forbidden,
        selectProvider: forbidden,
        runtime: {
          stores: {} as never,
          sourceConnection: { withLease: forbidden },
          taskReceiptConnection: { withLease: forbidden },
          gateway: {} as never,
          readBinary: forbidden,
          environment: () => undefined,
        },
        readAdmittedPrice: forbidden,
        publishedSource: { lookup: ordinaryLookup, readManifest: forbidden },
      });
      const read = (batch = initial.batchId, readActor = actor) =>
        universalBoundary(
          new Request(
            `http://local/v2/import-batches/${batch}/interpretations?tripId=${trip}`,
          ),
          readActor,
          async (a, t) => a === actor && t === trip,
          {
            readContext: (_a, b) => host.readContext(b),
            read: forbidden,
            execute: forbidden,
          },
        );
      const before = sql.prepare("SELECT total_changes() AS n").get();
      const exact = await read();
      expect(exact.status).toBe(404);
      expect(await exact.json()).toEqual({ error: { code: "TASK_NOT_FOUND" } });
      expect(ordinaryLookup).not.toHaveBeenCalled();
      expect(sql.prepare("SELECT total_changes() AS n").get()).toEqual(before);
      expect(phase()).toBeUndefined();

      const proofCount = calls.length;
      expect((await read(initial.batchId, randomUUID())).status).toBe(403);
      expect((await read(randomUUID())).status).toBe(404);
      expect(calls).toHaveLength(proofCount);

      behavior.proof = () => null;
      expect((await read()).status).toBe(503);
      ordinaryLookup.mockRejectedValueOnce(Error("INVALID_IMPORT_INPUT"));
      expect((await read()).status).toBe(503);
      ordinaryLookup.mockRejectedValueOnce(Error("UNIVERSAL_BATCH_NOT_PREPARED"));
      expect((await read()).status).toBe(503);
      expect(sql.prepare("SELECT total_changes() AS n").get()).toEqual(before);

      behavior.proof = () => {
        active = false;
        return reply;
      };
      expect((await read()).status).toBe(503);
      expect(sql.prepare("SELECT total_changes() AS n").get()).toEqual(before);

      behavior.proof = () => reply;
      active = true;
      await c.acquire(actor, trip, png);
      const reserved = sql.prepare("SELECT total_changes() AS n").get();
      expect((await read()).status).toBe(503);
      expect(phase()).toBe("RESERVED");
      expect(sql.prepare("SELECT total_changes() AS n").get()).toEqual(reserved);
      behavior.proof = defaultProof;
      behavior.nextOrdinal = 1;
      expect((await read()).status).toBe(404);
      expect(sql.prepare("SELECT total_changes() AS n").get()).toEqual(reserved);
      behavior.nextOrdinal = 3;
      expect((await read()).status).toBe(503);
      expect(forbidden).not.toHaveBeenCalled();
    },
  ));


it("keeps a closed protected mixed Source lookup on the original path", async () =>
  withMixedBFirstFixture(async ({ c, text, behavior, calls }) => {
    behavior.lookup = () => {
      throw Error("UNIVERSAL_SOURCE_SCOPE_CLOSED");
    };
    await expect(c.lookup(actor, trip, text)).rejects.toThrow("UNIVERSAL_SOURCE_SCOPE_CLOSED");
    expect(calls.map(({ sql }) => sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED",
      "SELECT public.trip_source_lookup_universal_original($1::uuid,$2) AS result",
      "ROLLBACK",
    ]);
  }));

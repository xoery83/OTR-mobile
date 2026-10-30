import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { importDigest } from "../../src/domain/trip/flightImportReview";
import { publicationTestHash as hash } from "./__fixtures__/tripCoreV2CandidatePublication";
import {
  createUniversalOriginalSourceConnection,
  universalOriginalSourceBoundary,
} from "./universalOriginalSource";
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
  q: Awaited<ReturnType<typeof envelope>>,
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

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
async function result(q: Awaited<ReturnType<typeof envelope>>) {
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
    result_remote_state: "NOT_APPLICABLE",
    result_retention_state: "RETAINED",
    result_action_id: randomUUID(),
    result_verified_at: null,
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
      null,
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

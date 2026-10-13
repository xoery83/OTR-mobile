import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, expect, test, vi } from "vitest";
import { createTripDocumentPrivateReferenceCustody } from "./tripDocumentPrivateReferenceCustody";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import type { CoreRow } from "../../src/domain/trip/tripCoreV2Mutation";
const actor = "10000000-0000-4000-8000-000000000001",
  trip = "10000000-0000-4000-8000-000000000002",
  doc = "10000000-0000-4000-8000-000000000003",
  rep = "10000000-0000-4000-8000-000000000004";
const content = Buffer.from("owned source bytes"),
  sha = createHash("sha256").update(content).digest("hex");
function harness(change: Record<string, unknown> = {}, enabled = true) {
  const commands: string[] = [],
    parameters: readonly unknown[][] = [];
  const row = {
    source_id: rep,
    source_revision: 1,
    row_revision: 1,
    source_trip_id: trip,
    acquired_by: actor,
    lifecycle: "ACTIVE",
    source_retention: "RETAINED",
    role: "ORIGINAL",
    retention_state: "RETAINED",
    material_kind: "TEXT",
    remote_state: "NOT_APPLICABLE",
    payload_sha256: sha,
    byte_count: content.length,
    mime_type: null,
    text_content: content.toString(),
    storage_provider: null,
    storage_bucket: null,
    object_key: null,
    ...change,
  };
  const connection: CorePgConnection = {
    withLease: async (work) =>
      work({
        retire: vi.fn(),
        query: async (sql, args = []) => {
          commands.push(sql);
          (parameters as unknown as unknown[][]).push([...args]);
          return {
            rows: sql.includes("trip_core_lock_source_scope")
              ? [{ allowed: true }]
              : sql.includes("current_user")
                ? [{ role: "otr_trip_core_v2_gateway" }]
                : sql.includes("runtime_enabled")
                  ? [{ runtime_enabled: enabled }]
                  : sql.includes("trip_source_representations")
                    ? [row as CoreRow]
                    : [],
          };
        },
      }),
  };
  const sign = vi.fn().mockResolvedValue({
    data: {
      signedUrl:
        "https://example.test/storage/v1/object/sign/trip-source-material/key?token=fixture",
    },
    error: null,
  });
  const storage = {
    from: vi.fn(() => ({ createSignedUrl: sign })),
  } as unknown as SupabaseClient["storage"];
  const service = createTripDocumentPrivateReferenceCustody(
    connection,
    storage,
    async () => null,
  );
  const input = {
    actorAccountId: actor,
    tripId: trip,
    documentId: doc,
    representationId: rep,
    sha256: sha,
    byteSize: content.length,
    mediaType: "text/plain" as const,
  };
  return { service, input, commands, parameters, sign };
}
afterEach(() => vi.unstubAllGlobals());
test("real Source TEXT bytes are verified before the owning proof INSERT", async () => {
  const h = harness();
  const proof = await h.service.verifyReference(actor, h.input);
  expect(proof.custodyProofId).toMatch(/^[0-9a-f-]{36}$/);
  expect(
    h.commands.findIndex((x) => x.includes("trip_source_representations")),
  ).toBeLessThan(h.commands.findIndex((x) => x.startsWith("INSERT")));
  expect(
    h.parameters.find((_, i) => h.commands[i].startsWith("INSERT"))?.slice(1),
  ).toEqual([doc, trip, actor, rep, sha, content.length, "text/plain"]);
  expect(h.commands.at(-1)).toBe("COMMIT");
  expect(h.sign).not.toHaveBeenCalled();
});
test.each([
  { acquired_by: doc },
  { source_trip_id: doc },
  { lifecycle: "DELETED" },
  { source_retention: "IDENTITY_ONLY" },
  { retention_state: "PURGE_PENDING" },
  { role: "DERIVED" },
  { payload_sha256: "a".repeat(64) },
])(
  "current Source right denies stale or other scope %o before bytes/proof",
  async (change) => {
    const h = harness(change);
    await expect(h.service.verifyReference(actor, h.input)).rejects.toThrow(
      "CURRENT_SOURCE_CUSTODY_UNAVAILABLE",
    );
    expect(h.commands.some((x) => x.startsWith("INSERT"))).toBe(false);
    expect(h.commands.at(-1)).toBe("ROLLBACK");
    expect(h.sign).not.toHaveBeenCalled();
  },
);
test("authenticated actor cannot be overridden by request", async () => {
  const h = harness();
  await expect(h.service.verifyReference(doc, h.input)).rejects.toThrow(
    "CURRENT_SOURCE_CUSTODY_UNAVAILABLE",
  );
  expect(h.commands).toEqual([]);
});
test("closed Core gate rejects before Source or Storage access", async () => {
  const h = harness({}, false);
  await expect(h.service.verifyReference(actor, h.input)).rejects.toThrow(
    "CORE_CAPABILITY_CLOSED",
  );
  expect(h.commands.some((x) => x.includes("trip_source_representations"))).toBe(false);
  expect(h.sign).not.toHaveBeenCalled();
  expect(h.commands.at(-1)).toBe("ROLLBACK");
});
test("hash mismatch never persists VERIFIED custody", async () => {
  const h = harness({ text_content: "same length wrong" });
  await expect(h.service.verifyReference(actor, h.input)).rejects.toThrow(
    "ORIGINAL_BYTES_UNAVAILABLE",
  );
  expect(h.commands.some((x) => x.startsWith("INSERT"))).toBe(false);
});
test("binary storage uses only the owned fixed Source bucket with bounded body", async () => {
  const h = harness({
    material_kind: "BINARY",
    remote_state: "VERIFIED",
    mime_type: "application/pdf",
    storage_provider: "supabase_storage",
    storage_bucket: "trip-source-material",
    object_key: "private-original",
  });
  const fetchMock = vi.fn().mockResolvedValue(new Response(content));
  vi.stubGlobal("fetch", fetchMock);
  await h.service.verifyReference(actor, { ...h.input, mediaType: "application/pdf" });
  expect(h.sign).toHaveBeenCalledWith("private-original", 60);
  expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
  expect(h.commands.at(-1)).toBe("COMMIT");
});
test("oversized streamed response is cancelled without a proof", async () => {
  const h = harness({
    material_kind: "BINARY",
    remote_state: "VERIFIED",
    mime_type: "application/pdf",
    storage_provider: "supabase_storage",
    storage_bucket: "trip-source-material",
    object_key: "private-original",
  });
  const cancel = vi.fn();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(content.length + 1));
    },
    cancel,
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
  await expect(
    h.service.verifyReference(actor, { ...h.input, mediaType: "application/pdf" }),
  ).rejects.toThrow("ORIGINAL_BYTES_UNAVAILABLE");
  expect(cancel).toHaveBeenCalled();
  expect(h.commands.some((x) => x.startsWith("INSERT"))).toBe(false);
});

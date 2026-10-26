import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readCorePgGraph } from "./tripCoreV2PgStorage";
it("reads the bounded owning Core graph in one database round trip", async () => {
  const query = vi.fn(async () => ({ rows: [] }));
  const graph = await readCorePgGraph({ query, retire: vi.fn() }, randomUUID());
  expect(Object.values(graph).flat()).toEqual([]);
  expect(query).toHaveBeenCalledTimes(1);
});

it("rejects a graph over the total resource bound before parsing rows", async () => {
  const query = vi.fn(async () => ({ rows: Array.from({ length: 20001 }, () => ({})) }));
  await expect(readCorePgGraph({ query, retire: vi.fn() }, randomUUID())).rejects.toThrow(
    "CORE_READ_RESOURCE_LIMIT",
  );
});
it("rejects unknown table identities from a returned snapshot", async () => {
  const query = vi.fn(async () => ({
    rows: [{ core_table: "expense_links", fact: {} }],
  }));
  await expect(readCorePgGraph({ query, retire: vi.fn() }, randomUUID())).rejects.toThrow(
    "CORE_READ_TABLE_MISMATCH",
  );
});

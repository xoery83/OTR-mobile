import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import {
  createFlightTextSourceConnection,
  flightTextSourceBoundary,
} from "./flightTextSource";
import { publicationTestHash as hash } from "./__fixtures__/tripCoreV2CandidatePublication";
const actor = randomUUID(),
  trip = randomUUID();
const request = (path: string, value: unknown) =>
  new Request(`http://local/v2/trips/${trip}/sources/${path}`, {
    method: "POST",
    headers: { Authorization: "Bearer owner" },
    body: typeof value === "string" ? value : JSON.stringify(value),
  });
const envelope = () => ({
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
      source_kind: "TEXT",
      acquisition_channel: "PASTE",
      captured_at: null,
      capture_time_basis: "UNKNOWN",
    },
    capture: { completeness: "AS_SUPPLIED", capture_sha256: "a".repeat(64) },
    original: {
      id: randomUUID(),
      material_kind: "TEXT",
      original_filename: null,
      part_key: null,
      mime_type: null,
      encoding: "UTF-8",
      payload_sha256: "a".repeat(64),
      byte_count: 4,
      text_content: "text",
      locator_uri: null,
    },
  },
});
it("keeps startup Source routes authenticated and CLOSED", async () => {
  const h = createDevBackendHandler({
    gateway: {
      validateAccessToken: async (token: string) =>
        token === "owner" ? { id: actor } : null,
      canReadTrip: async () => true,
    } as unknown as DevBackendGateway,
  });
  expect((await h(request("acquire", envelope()))).status).toBe(503);
  expect(
    (
      await h(
        new Request(`http://local/v2/trips/${trip}/sources/acquire`, {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
  ).toBe(401);
});
it("rejects forged actor, binary and corrupt bytes before a database lease", async () => {
  const lease = vi.fn();
  const c = createFlightTextSourceConnection({ withLease: lease }, hash);
  const q = envelope();
  expect(
    (
      await flightTextSourceBoundary(
        request("acquire", { ...q, actor_account_id: randomUUID() }),
        actor,
        async () => true,
        c,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await flightTextSourceBoundary(
        request("acquire", {
          ...q,
          payload: {
            ...q.payload,
            original: { ...q.payload.original, material_kind: "BINARY" },
          },
        }),
        actor,
        async () => true,
        c,
      )
    ).status,
  ).toBe(422);
  expect(
    (await flightTextSourceBoundary(request("acquire", q), actor, async () => true, c))
      .status,
  ).toBe(422);
  expect(lease).not.toHaveBeenCalled();
});
it("bounds and strictly parses requests; denied Trip reaches no connection", async () => {
  const acquire = vi.fn();
  const c = { acquire, publishRun: vi.fn() };
  expect(
    (
      await flightTextSourceBoundary(
        request("acquire", " ".repeat(2097153)),
        actor,
        async () => true,
        c,
      )
    ).status,
  ).toBe(413);
  expect(
    (
      await flightTextSourceBoundary(
        request("acquire", '{"command":1,"command":2}'),
        actor,
        async () => true,
        c,
      )
    ).status,
  ).toBe(400);
  expect(
    (await flightTextSourceBoundary(request("acquire", {}), actor, async () => false, c))
      .status,
  ).toBe(403);
  expect(acquire).not.toHaveBeenCalled();
});
it.each([
  [undefined, 503],
  ["23505", 409],
])("rolls back SQL failure %s and returns bounded status %s", async (code, status) => {
  const sql: string[] = [];
  const c = createFlightTextSourceConnection(
    {
      withLease: async (work) =>
        work({
          retire: vi.fn(),
          query: async (query) => {
            sql.push(query);
            if (query.startsWith("SELECT"))
              throw Object.assign(new Error("private SQL or credential error"), { code });
            return { rows: [] };
          },
        }),
    },
    hash,
  );
  const r = await flightTextSourceBoundary(
    request("runs/publish", { id: randomUUID() }),
    actor,
    async () => true,
    c,
  );
  expect(r.status).toBe(status);
  expect(await r.text()).not.toContain("private SQL");
  expect(sql.at(-1)).toBe("ROLLBACK");
});

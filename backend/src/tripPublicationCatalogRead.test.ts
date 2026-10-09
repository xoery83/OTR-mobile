import { afterEach, describe, expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import { createSupabaseDevGateway } from "./supabaseGateway";
import {
  publicationCatalogBody,
  readPublicationCatalog,
  type PublicationCatalogConnection,
} from "./tripPublicationCatalogRead";
import { tripImportCatalogSchemas } from "../../src/data/api/tripImportCatalogContracts";
import { canonicalEventJson, type Json } from "../../src/domain/trip/eventIntentJson";
import fixture from "../../src/data/repositories/__fixtures__/tripImportCatalogs.json";
import { readFileSync } from "node:fs";

const actor = fixture.actor_account_id,
  trip = fixture.trip_id;
const json = (v: unknown) => canonicalEventJson(v as Json);
function empty() {
  return {
    version: 1,
    actor_account_id: actor,
    trip_id: trip,
    ...Object.fromEntries(Object.keys(tripImportCatalogSchemas).map((k) => [k, []])),
  };
}
function request(patch: RequestInit = {}, suffix = "", id = trip) {
  return new Request(`https://local/v2/trips/${id}/source-import-catalogs${suffix}`, {
    headers: { Authorization: "Bearer valid", "X-OTR-Publication-Catalog-Version": "1" },
    ...patch,
  });
}
function gateway(overrides: Partial<DevBackendGateway> = {}) {
  return {
    validatePublicationAccessToken: vi.fn(async (token) =>
      token === "valid"
        ? { disposition: "VERIFIED", user: { id: actor } }
        : { disposition: "REJECTED" },
    ),
    canReadTrip: vi.fn(async () => true),
    readPublicationImportCatalogs: vi.fn(async () => json(empty())),
    ...overrides,
  } as unknown as DevBackendGateway;
}
function connection(
  principal = "otr_trip_publication_catalog_reader",
  value: unknown = fixture,
  failure?: unknown,
) {
  const query = vi.fn(async (sql: string, _parameters: readonly string[]) => {
    if (sql === "SELECT session_user AS principal") return { rows: [{ principal }] };
    if (sql.startsWith("SELECT public.trip_source_read_import_catalogs")) {
      if (failure) throw failure;
      return { rows: [{ catalog: value }] };
    }
    return { rows: [] };
  });
  const c: PublicationCatalogConnection = { withLease: async (work) => work({ query }) };
  return { c, query };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("dormant authenticated Publication catalog", () => {
  it.each([
    [{ method: "POST", body: "private" }, "", trip, 405],
    [{ method: "PUT" }, "", trip, 405],
    [{ headers: { Authorization: "Bearer valid" } }, "", trip, 426],
    [{}, "?actor=spoof", trip, 400],
    [{}, "?cursor=x", trip, 400],
    [{}, "", "invalid", 400],
    [{}, "", "", 400],
    [
      {
        headers: {
          Authorization: "Bearer valid",
          "X-OTR-Publication-Catalog-Version": "1",
          "Content-Length": "1",
        },
      },
      "",
      trip,
      400,
    ],
  ] as const)(
    "rejects invalid request before SQL %#",
    async (init, suffix, id, status) => {
      const g = gateway();
      const r = await createDevBackendHandler({ gateway: g })(request(init, suffix, id));
      expect(r.status).toBe(status);
      expect(g.readPublicationImportCatalogs).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, "Bearer forged", "Basic valid"])(
    "withholds missing/forged bearer %s",
    async (authorization) => {
      const g = gateway();
      const r = await createDevBackendHandler({ gateway: g })(
        request({
          headers: {
            ...(authorization ? { Authorization: authorization } : {}),
            "X-OTR-Publication-Catalog-Version": "1",
          },
        }),
      );
      expect(r.status).toBe(401);
      expect(g.readPublicationImportCatalogs).not.toHaveBeenCalled();
    },
  );
  it("derives actor only from verified Auth, canonicalizes and never logs private payload", async () => {
    const g = gateway({
      readPublicationImportCatalogs: vi.fn(async () => json(fixture)),
    });
    const log = vi.fn();
    const r = await createDevBackendHandler({ gateway: g, log })(
      request({
        headers: {
          Authorization: "Bearer valid",
          "X-Actor-Id": "spoof",
          "X-OTR-Publication-Catalog-Version": "1",
        },
      }),
    );
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(json(fixture));
    expect(g.readPublicationImportCatalogs).toHaveBeenCalledWith(
      actor,
      trip,
      expect.any(AbortSignal),
    );
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("vary")).toBe("Authorization");
    expect(JSON.stringify(log.mock.calls)).not.toContain(actor);
    expect(JSON.stringify(log.mock.calls)).not.toContain("valid");
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      fixture.trip_source_representations[0].text_content,
    );
  });
  it.each(["UNAVAILABLE", "REJECTED"] as const)(
    "distinguishes Auth %s",
    async (disposition) => {
      const g = gateway({
        validatePublicationAccessToken: async () => ({ disposition }),
      });
      const r = await createDevBackendHandler({ gateway: g })(request());
      expect(r.status).toBe(disposition === "REJECTED" ? 401 : 503);
      expect(g.readPublicationImportCatalogs).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    "Trip admission %s is rechecked before protected read",
    async (admitted) => {
      const g = gateway({ canReadTrip: async () => admitted });
      const r = await createDevBackendHandler({ gateway: g })(request());
      expect(r.status).toBe(admitted ? 200 : 403);
      expect(g.readPublicationImportCatalogs).toHaveBeenCalledTimes(admitted ? 1 : 0);
    },
  );
  it("missing injected connection fails CLOSED without service listing", async () => {
    const g = gateway({ readPublicationImportCatalogs: undefined });
    expect((await createDevBackendHandler({ gateway: g })(request())).status).toBe(503);
    await expect(
      readPublicationCatalog(undefined, actor, trip, new AbortController().signal),
    ).rejects.toMatchObject({ status: 503 });
  });
  it.each([
    "service_role",
    "postgres",
    "authenticated",
    "anon",
    "otr_trip_source_command_gateway",
  ])("rejects actual leased principal %s", async (principal) => {
    const f = connection(principal);
    await expect(
      readPublicationCatalog(f.c, actor, trip, new AbortController().signal),
    ).rejects.toMatchObject({ status: 503 });
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes("trip_source_read_import_catalogs"),
      ),
    ).toBe(false);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it("uses one leased READ COMMITTED READ ONLY observation and fixed parameters", async () => {
    const f = connection();
    expect(
      await readPublicationCatalog(f.c, actor, trip, new AbortController().signal),
    ).toBe(json(fixture));
    expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY",
      "SET LOCAL statement_timeout = '5000ms'",
      "SET LOCAL lock_timeout = '1000ms'",
      "SELECT session_user AS principal",
      "SELECT public.trip_source_read_import_catalogs($1::uuid,$2::uuid) AS catalog",
      "COMMIT",
    ]);
    expect(f.query.mock.calls[4][1]).toEqual([actor, trip]);
  });
  it.each([
    { code: "42501", message: "FORBIDDEN" },
    { message: "IMPORT_READ_RESOURCE_LIMIT" },
  ])("SQL denial/overflow withholds all rows and rolls back", async (failure) => {
    const f = connection(undefined, undefined, failure);
    await expect(
      readPublicationCatalog(f.c, actor, trip, new AbortController().signal),
    ).rejects.toMatchObject({
      code:
        failure.message === "FORBIDDEN"
          ? "TRIP_READ_FORBIDDEN"
          : "IMPORT_READ_RESOURCE_LIMIT",
    });
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it.each(
    Object.keys(tripImportCatalogSchemas) as (keyof typeof tripImportCatalogSchemas)[],
  )("preserves0/1/64 and rejects65 for %s", (table) => {
    for (const count of [0, 1, 64]) {
      const raw = {
        ...empty(),
        [table]: Array(count).fill(
          fixture[table][0] ?? {
            slot_id: actor,
            predecessor_slot_id: trip,
            dependency_kind: "RECEIPT_SUCCESS",
            expected_receipt_sha256: "a".repeat(64),
            expected_target_id: actor,
            expected_result_revision: 1,
          },
        ),
      };
      expect(JSON.parse(publicationCatalogBody(raw, actor, trip))[table]).toHaveLength(
        count,
      );
    }
    expect(() =>
      publicationCatalogBody(
        { ...empty(), [table]: Array(65).fill(fixture[table][0]) },
        actor,
        trip,
      ),
    ).toThrow("unavailable");
  });
  it("rejects foreign scope and missing families rather than returning empty", () => {
    expect(() =>
      publicationCatalogBody({ ...empty(), actor_account_id: trip }, actor, trip),
    ).toThrow();
    const raw = empty();
    delete (raw as Record<string, unknown>).trip_source_inputs;
    expect(() => publicationCatalogBody(raw, actor, trip)).toThrow();
  });
  it("times out an abort-ignoring Auth call without SQL or late disclosure", async () => {
    vi.useFakeTimers();
    let done!: (v: unknown) => void;
    const g = gateway({
      validatePublicationAccessToken: () =>
        new Promise((resolve) => {
          done = resolve as typeof done;
        }),
    });
    const pending = createDevBackendHandler({ gateway: g })(request());
    await vi.advanceTimersByTimeAsync(5001);
    expect((await pending).status).toBe(503);
    done({ disposition: "VERIFIED", user: { id: actor } });
    await Promise.resolve();
    expect(g.readPublicationImportCatalogs).not.toHaveBeenCalled();
  });
  it("adds only the dormant Reader session to the existing forward read body", () => {
    const historical = readFileSync(
      "supabase/migrations/20261005000900_trip_import_private_catalog_reads.sql",
      "utf8",
    );
    const forward = readFileSync(
      "supabase/dev-forward/r3-v1/202610090001_publication_catalog_reader.sql",
      "utf8",
    );
    const body = historical.match(/as \$\$(declare result jsonb;[\s\S]*?)\$\$;/)![1];
    expect(forward).toContain(
      body.replace(
        "session_user<>'otr_trip_source_command_gateway'",
        "session_user not in ('otr_trip_source_command_gateway','otr_trip_publication_catalog_reader')",
      ),
    );
    expect(forward).toContain("nologin password null nosuperuser");
    expect(forward).not.toMatch(
      /set role|grant.*writer to otr_trip_publication_catalog_reader/i,
    );
    expect(forward.match(/grant execute on function/g)).toHaveLength(1);
    expect(forward).toContain("R3_CATALOG_READER_ROLE_EXISTS");
    expect(forward).toContain("R3_CATALOG_READER_CATALOG_DRIFT");
  });
  it("retains immutable SQL authorization/roster bounds and unprovisioned server", () => {
    const sql = readFileSync(
      "supabase/migrations/20261005000900_trip_import_private_catalog_reads.sql",
      "utf8",
    );
    expect(sql).toContain("session_user<>'otr_trip_source_command_gateway'");
    expect(sql).toContain("trip_source_admission(actor,trip,false)");
    expect(sql.match(/limit 65/g)).toHaveLength(13);
    expect(sql).toContain("jsonb_array_length(rows)>64");
    expect(sql).toContain(">4194304");
    expect(sql).toContain("from public,anon,authenticated,service_role");
    expect(readFileSync("backend/src/server.ts", "utf8")).not.toContain(
      "publicationCatalogConnection",
    );
  });
});

describe("Publication Auth uses the existing Supabase Auth client", () => {
  const config = {
    url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    publishableKey: "test-public",
    secretKey: "test-private",
  };
  it.each([
    [401, "bad_jwt", "REJECTED"],
    [401, "session_not_found", "REJECTED"],
    [400, "bad_jwt", "REJECTED"],
    [404, "user_not_found", "REJECTED"],
    [403, "user_banned", "REJECTED"],
    [503, "bad_jwt", "UNAVAILABLE"],
    [429, "over_request_rate_limit", "UNAVAILABLE"],
    [401, "unknown_error", "UNAVAILABLE"],
  ])(
    "maps Auth status%s/%s to%s without credential inference",
    async (status, code, disposition) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          expect(String(url)).toContain("/auth/v1/user");
          return Response.json(
            { code, msg: "private-error" },
            {
              status: Number(status),
              headers: { "X-Supabase-Api-Version": "2024-01-01" },
            },
          );
        }),
      );
      const g = createSupabaseDevGateway(config);
      expect(
        await g.validatePublicationAccessToken!(
          "synthetic-token",
          new AbortController().signal,
        ),
      ).toEqual({ disposition });
    },
  );
  it("network failure is unavailable, not revoked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("synthetic-offline");
      }),
    );
    const result = await createSupabaseDevGateway(config).validatePublicationAccessToken!(
      "token",
      new AbortController().signal,
    );
    expect(result).toEqual({ disposition: "UNAVAILABLE" });
  });
  it("verified Auth user supplies actor and cancellation denies late verification", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: actor,
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
          created_at: "2026-10-09T00:00:00Z",
        }),
      ),
    );
    const g = createSupabaseDevGateway(config);
    expect(
      await g.validatePublicationAccessToken!("synthetic-token", controller.signal),
    ).toEqual({ disposition: "VERIFIED", user: { id: actor } });
    controller.abort();
    expect(
      await g.validatePublicationAccessToken!("synthetic-token", controller.signal),
    ).toEqual({ disposition: "UNAVAILABLE" });
  });
  it.each(["creator", "legacy", "linked", "revoked", "foreign"])(
    "preserves existing Trip read admission: %s",
    async (kind) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string) => {
          const url = new URL(input);
          expect(
            url.searchParams.get(
              url.pathname.endsWith("trips") ? "created_by" : "user_id",
            ),
          ).toBe(`eq.${actor}`);
          const admitted =
            (kind === "creator" && url.pathname.endsWith("/trips")) ||
            (kind === "legacy" && url.pathname.endsWith("/trip_members")) ||
            (kind === "linked" &&
              url.pathname.endsWith("/journey_members") &&
              url.searchParams.get("status") === "eq.linked");
          return Response.json(admitted ? [{ id: trip }] : []);
        }),
      );
      expect(await createSupabaseDevGateway(config).canReadTrip(actor, trip)).toBe(
        ["creator", "legacy", "linked"].includes(kind),
      );
    },
  );
  it("SQL gateway remains absent even with valid Supabase clients", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      createSupabaseDevGateway(config).readPublicationImportCatalogs!(
        actor,
        trip,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("actual canonical catalog byte ceiling", () => {
  it("accepts exactly4MiB UTF-8 and rejects one byte over", () => {
    const representation = fixture.trip_source_representations.find(
      (r) => r.material_kind === "TEXT",
    )!;
    const raw = {
      ...empty(),
      trip_source_representations: Array.from({ length: 17 }, () => ({
        ...representation,
        text_content: "旅".repeat(78000),
      })),
    };
    const size = Buffer.byteLength(json(raw));
    const remaining = 4194304 - size;
    expect(remaining).toBeGreaterThan(0);
    let left = remaining;
    for (const rep of raw.trip_source_representations) {
      const added = Math.min(left, 262144 - Buffer.byteLength(rep.text_content));
      rep.text_content += "a".repeat(added);
      left -= added;
    }
    expect(left).toBe(0);
    expect(Buffer.byteLength(publicationCatalogBody(raw, actor, trip))).toBe(4194304);
    raw.trip_source_representations[16].text_content += "a";
    expect(() => publicationCatalogBody(raw, actor, trip)).toThrow();
  });
});

it("rejects a GET body before SQL even without Content-Length", async () => {
  const g = gateway(),
    r = request();
  Object.defineProperty(r, "body", {
    value: new ReadableStream({
      start(c) {
        c.close();
      },
    }),
  });
  expect((await createDevBackendHandler({ gateway: g })(r)).status).toBe(400);
  expect(g.readPublicationImportCatalogs).not.toHaveBeenCalled();
});

describe("F1 Backend original catalog text admission", () => {
  const raw = () => json(empty());
  it.each([
    ["duplicate actor", () => '{"actor_account_id":"' + trip + '",' + raw().slice(1)],
    [
      "duplicate family conceals65 rows",
      () =>
        '{"trip_source_candidates":' +
        JSON.stringify(Array(65).fill(fixture.trip_source_candidates[0])) +
        "," +
        raw().slice(1),
    ],
    [
      "rounded version",
      () => raw().replace('"version":1', '"version":1.0000000000000001'),
    ],
    [
      "nested duplicate",
      () =>
        json(fixture).replace('"row_revision":1', '"row_revision":2,"row_revision":1'),
    ],
    ["unsafe integer", () => raw().replace('"version":1', '"version":9007199254740993')],
    ["exponent", () => raw().replace('"version":1', '"version":1e0')],
  ] as const)("withholds %s", async (_label, body) => {
    const log = vi.fn();
    const response = await createDevBackendHandler({
      gateway: gateway({ readPublicationImportCatalogs: async () => body() }),
      log,
    })(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "PUBLICATION_MEMBERSHIP_INTEGRITY" },
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(JSON.stringify(log.mock.calls)).not.toContain(body());
  });
  it("retains exact canonical positive control", async () => {
    const response = await createDevBackendHandler({ gateway: gateway() })(request());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(raw());
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeSharedLedgerCursor } from "../../src/domain/trip/participationSnapshot";
import { createSupabaseDevGateway } from "./supabaseGateway";

const tripId = "10000000-0000-4000-8000-000000000001";
const personId = "20000000-0000-4000-8000-000000000001";
const userId = "30000000-0000-4000-8000-000000000001";
const now = "2026-10-03T00:00:00Z";

afterEach(() => vi.unstubAllGlobals());

function fixture(
  pair: Record<string, unknown>,
  options: {
    rosters?: Record<string, unknown>[][];
    sequence?: number;
    feed?: Record<string, unknown>[];
  } = {},
) {
  const memberSelects: string[] = [];
  const requests: URL[] = [];
  const defaultRow = {
    id: personId,
    user_id: userId,
    display_name: "Inactive Organizer",
    role: "owner",
    status: "linked",
    updated_at: now,
    ...pair,
  };
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(input);
    requests.push(url);
    let body: unknown = [];
    if (url.pathname.endsWith("/rpc/read_ledger_review_projection_v2"))
      body = { findings: [], actions: [] };
    if (url.pathname.endsWith("/ledger_settings"))
      body = {
        revision: 1,
        settlement_currency: "NZD",
        settlement_scale: 2,
        valuation_policy: "REFERENCE_RATE",
        updated_at: now,
      };
    if (url.pathname.endsWith("/trips"))
      body = { name: "Trip", start_date: null, end_date: null };
    if (url.pathname.endsWith("/rpc/read_trip_person_snapshot_v1")) {
      const rows = options.rosters?.[
        Math.min(memberSelects.length, options.rosters.length - 1)
      ] ?? [defaultRow];
      memberSelects.push(url.pathname);
      body = {
        observedAt: "2026-10-04T00:00:00.000000Z",
        personCount: rows.length,
        members: rows,
      };
    }
    if (url.pathname.endsWith("/ledger_changes")) {
      body = url.searchParams.get("entity_type")
        ? []
        : url.searchParams.get("select") === "sequence"
          ? options.sequence
            ? [{ sequence: options.sequence }]
            : []
          : (options.feed ?? []);
    }
    return Response.json(body);
  });
  const gateway = createSupabaseDevGateway({
    url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    secretKey: "local-test-secret",
    publishableKey: "local-test-public",
  });
  return { gateway, memberSelects, requests };
}

describe("Trip Person passive bootstrap projection", () => {
  it.each([
    [true, 0],
    [false, 7],
    [true, Number.MAX_SAFE_INTEGER],
  ])(
    "emits %s/%s without changing linked-owner capabilities",
    async (active, revision) => {
      const { gateway, memberSelects } = fixture({
        participation_active: active,
        participation_revision: revision,
      });
      const response = await gateway.bootstrapLedger(userId, tripId);
      expect(response.members).toHaveLength(1);
      expect(response.members[0]).toMatchObject({
        id: personId,
        isParticipating: active,
        participationRevision: revision,
        role: "owner",
        status: "linked",
        capabilities: { canFinalizeSettlement: true },
      });
      expect(response.actor.capabilities.canFinalizeSettlement).toBe(true);
      expect(memberSelects).toHaveLength(3);
      expect(response.members[0]).not.toHaveProperty("user_id");
    },
  );
  it.each([
    {},
    { participation_active: false },
    { participation_active: null, participation_revision: 0 },
    { participation_active: false, participation_revision: -1 },
    { participation_active: false, participation_revision: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects missing/malformed migrated database observation %j", async (pair) => {
    const { gateway } = fixture(pair);
    await expect(gateway.bootstrapLedger(userId, tripId)).rejects.toThrow();
  });
});

const active = { participation_active: true, participation_revision: 0 };
function row(id = personId, pair = active) {
  return {
    id,
    user_id: userId,
    display_name: "Owner",
    role: "owner",
    status: "linked",
    updated_at: now,
    ...pair,
  };
}
describe("Trip Person complete snapshot and shared verification", () => {
  it("certifies an empty roster with a real sequence-zero cursor", async () => {
    const { gateway } = fixture(active, { rosters: [[]] });
    const result = await gateway.bootstrapLedger(userId, tripId);
    expect(result.participationSnapshot).toMatchObject({
      complete: true,
      personCount: 0,
    });
    expect(decodeSharedLedgerCursor(result.cursor, tripId, userId).sequence).toBe(0);
  });
  it("preserves Member wire order above row cap, including inactive unlinked guests", async () => {
    const rows = Array.from({ length: 1203 }, (_, i) => ({
      ...row(`20000000-0000-4000-8000-${(1203 - i).toString().padStart(12, "0")}`, {
        participation_active: false,
        participation_revision: 7,
      }),
      user_id: null,
      role: "guest",
      status: "unlinked",
      display_name: i.toString().padStart(4, "0"),
    }));
    const { gateway } = fixture(active, { rosters: [rows] });
    const result = await gateway.bootstrapLedger(userId, tripId);
    expect(result.participationSnapshot?.personCount).toBe(1203);
    expect(result.members.map((member) => member.id)).toEqual(
      rows.map((member) => member.id),
    );
    expect(result.members.every((member) => member.isParticipating === false)).toBe(true);
  });
  it("retries V0/M/V1 churn, then certifies a coherent observation", async () => {
    const original = [row()];
    const changed = [
      row(personId, { participation_active: false, participation_revision: 1 }),
    ];
    const { gateway, memberSelects } = fixture(active, {
      rosters: [original, original, changed, changed, changed, changed],
    });
    const result = await gateway.bootstrapLedger(userId, tripId);
    expect(memberSelects).toHaveLength(6);
    expect(result.members[0].participationRevision).toBe(1);
  });
  it("fails after exactly three incoherent attempts", async () => {
    const original = [row()];
    const changed = [
      row(personId, { participation_active: false, participation_revision: 1 }),
    ];
    const { gateway, memberSelects } = fixture(active, {
      rosters: [
        original,
        original,
        changed,
        original,
        original,
        changed,
        original,
        original,
        changed,
      ],
    });
    await expect(gateway.bootstrapLedger(userId, tripId)).rejects.toMatchObject({
      status: 503,
      code: "PARTICIPATION_SNAPSHOT_UNSTABLE",
    });
    expect(memberSelects).toHaveLength(9);
  });
  it("fails malformed complete snapshots without retry or certification", async () => {
    const { gateway, memberSelects } = fixture(active, { rosters: [[row(), row()]] });
    await expect(gateway.bootstrapLedger(userId, tripId)).rejects.toMatchObject({
      status: 500,
      code: "PARTICIPATION_SNAPSHOT_INVALID",
    });
    expect(memberSelects).toHaveLength(1);
  });
  it("verifies empty/final incremental pages without changing the bound fingerprint", async () => {
    const { gateway } = fixture(active);
    const bootstrap = await gateway.bootstrapLedger(userId, tripId);
    const page = await gateway.pullLedgerChanges(userId, tripId, bootstrap.cursor);
    expect(page.cursor).toBe(bootstrap.cursor);
    expect(page.participationVerification?.fingerprint).toBe(
      bootstrap.participationSnapshot?.fingerprint,
    );
    expect(page.changes).toEqual([]);
    expect(page.hasMore).toBe(false);
  });
  it.each(["new", "aba", "missing"])(
    "rejects %s roster drift before reading a financial page",
    async (kind) => {
      const original = [row()];
      const next =
        kind === "missing"
          ? []
          : kind === "new"
            ? [...original, row("20000000-0000-4000-8000-000000000002")]
            : [row(personId, { participation_active: true, participation_revision: 2 })];
      const { gateway, requests } = fixture(active, {
        rosters: [original, original, original, next],
      });
      const bootstrap = await gateway.bootstrapLedger(userId, tripId);
      requests.length = 0;
      await expect(
        gateway.pullLedgerChanges(userId, tripId, bootstrap.cursor),
      ).rejects.toMatchObject({ status: 400, code: "INVALID_CURSOR" });
      expect(requests.some((url) => url.pathname.endsWith("/ledger_changes"))).toBe(
        false,
      );
    },
  );
  it("rejects legacy shared v1 before any database read", async () => {
    const { gateway, requests } = fixture(active);
    const token = btoa(
      JSON.stringify({ version: 1, sequence: 0, tripId, userId }),
    ).replace(/=/g, "");
    await expect(gateway.pullLedgerChanges(userId, tripId, token)).rejects.toMatchObject({
      code: "INVALID_CURSOR",
    });
    expect(requests).toHaveLength(0);
  });
  it("keeps the first continuation page and rejects participation drift before the next page", async () => {
    const original = [row()];
    const next = [
      row(personId, { participation_active: false, participation_revision: 1 }),
    ];
    const feed = Array.from({ length: 101 }, (_, i) => ({
      sequence: i + 1,
      entity_type: "EXPENSE",
      entity_id: `40000000-0000-4000-8000-${(i + 1).toString().padStart(12, "0")}`,
      revision: 1,
      is_tombstone: true,
    }));
    const { gateway, requests } = fixture(active, {
      rosters: [original, original, original, original, next],
      sequence: 101,
      feed,
    });
    const bootstrap = await gateway.bootstrapLedger(userId, tripId);
    // Bind the same snapshot at sequence zero to exercise an existing financial continuation.
    const binding = decodeSharedLedgerCursor(bootstrap.cursor, tripId, userId);
    const token = btoa(JSON.stringify({ ...binding, sequence: 0 }))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const page = await gateway.pullLedgerChanges(userId, tripId, token);
    expect(page.hasMore).toBe(true);
    expect(page.changes).toHaveLength(100);
    expect(decodeSharedLedgerCursor(page.cursor, tripId, userId)).toMatchObject({
      sequence: 100,
      participationFingerprint: binding.participationFingerprint,
    });
    requests.length = 0;
    await expect(
      gateway.pullLedgerChanges(userId, tripId, page.cursor),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    expect(requests.some((url) => url.pathname.endsWith("/ledger_changes"))).toBe(false);
  });
});

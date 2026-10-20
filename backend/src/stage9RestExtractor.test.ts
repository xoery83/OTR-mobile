import { createHmac } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { STAGE9_SOURCE_ALLOWLIST, type LegacyExtract } from "./stage9Import";
import { syntheticLegacyExtract } from "../../scripts/stage9/syntheticFixture";
import {
  assertStage9MappingLookupRequest,
  assertStage9RestRequest,
  extractStage9Authenticated,
  PAGE_SIZE,
  parseStage9Csv,
  resolveStage9AuthenticatedMember,
  validateStage9SourceAllowlist,
} from "../../scripts/stage9/extract-production";
import { buildResolvedStage9Mapping } from "../../scripts/stage9/resolve-private-mapping";
import { readCommittedStage9Raw } from "../../scripts/stage9/transform-private";

const projectRef = "abcdefghijklmnopqrst";
const origin = `https://${projectRef}.supabase.co`;
const journeyId = "90000000-0000-4000-8000-000000000000";
const nowMs = Date.UTC(2026, 8, 13, 0, 0, 0);
const tokenCanary = "STAGE9_TOKEN_CANARY_DO_NOT_LEAK";
const roots: string[] = [];

type SourceTable = keyof typeof STAGE9_SOURCE_ALLOWLIST;
type ApiRow = Record<string, string>;
type Snapshot = {
  rows: Record<SourceTable, ApiRow[]>;
  presence: Record<string, number>;
};
type Fault = "duplicate" | "missing" | "out-of-order" | null;

function jwt(overrides: Record<string, unknown> = {}) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    role: "authenticated",
    sub: "00000000-0000-4000-8000-000000000001",
    iss: `${origin}/auth/v1`,
    exp: Math.floor(nowMs / 1000) + 3600,
    ...overrides,
  })}.${tokenCanary}`;
}

function privateRoot() {
  const root = mkdtempSync(join(tmpdir(), "otr-stage9-http-"));
  chmodSync(root, 0o700);
  roots.push(root);
  return root;
}

function tokenFile(root: string, token: string) {
  const directory = join(root, "session");
  mkdirSync(directory, { mode: 0o700 });
  const path = join(directory, "access-token");
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
  return path;
}

function string(value: string | null) {
  return value ?? "";
}

function snapshot(raw: LegacyExtract): Snapshot {
  return {
    rows: {
      trips: raw.trips.map((row) => ({
        id: row.id,
        start_date: string(row.startDate),
        end_date: string(row.endDate),
      })),
      journey_members: raw.journeyMembers.map((row) => ({
        id: row.id,
        trip_id: row.tripId,
        role: row.role,
        status: row.status,
      })),
      journey_ledgers: raw.journeyLedgers.map((row) => ({
        journey_id: row.journeyId,
        base_currency: row.baseCurrency,
        display_currency: row.displayCurrency,
        exchange_rates_snapshot_date: row.exchangeRatesSnapshotDate,
      })),
      ledger_entries: raw.ledgerEntries.map((row) => ({
        id: row.id,
        journey_id: row.journeyId,
        category: row.category,
        accounting_mode: row.accountingMode,
        expense_date: row.expenseDate,
        start_date: string(row.startDate),
        end_date: string(row.endDate),
        original_amount: row.originalAmount,
        original_currency: row.originalCurrency,
        base_amount: row.baseAmount,
        base_currency: row.baseCurrency,
        exchange_rate: row.exchangeRate,
        exchange_rate_date: string(row.exchangeRateDate),
        payer_member_id: string(row.payerMemberId),
        status: row.status,
      })),
      ledger_entry_participants: raw.ledgerEntryParticipants.map((row) => ({
        ledger_entry_id: row.ledgerEntryId,
        member_id: row.memberId,
        split_method: row.splitMethod,
        share_amount: string(row.shareAmount),
        share_percentage: string(row.sharePercentage),
        computed_share_base_amount: string(row.computedShareBaseAmount),
      })),
      journey_exchange_rates: raw.journeyExchangeRates.map((row) => ({
        journey_id: row.journeyId,
        base_currency: row.baseCurrency,
        quote_currency: row.quoteCurrency,
        rate_to_base: row.rateToBase,
        rate_date: row.rateDate,
      })),
      ledger_settlements: raw.ledgerSettlements.map((row) => ({
        id: row.id,
        journey_id: row.journeyId,
        from_member_id: row.fromMemberId,
        to_member_id: row.toMemberId,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        created_at: row.createdAt,
      })),
    },
    presence: { ...raw.redactionPresenceCounts },
  };
}

function pagedLegacyExtract() {
  const raw = syntheticLegacyExtract();
  const entry = raw.ledgerEntries[0]!;
  for (let index = raw.ledgerEntries.length + 1; index <= PAGE_SIZE + 1; index += 1) {
    raw.ledgerEntries.push({
      ...entry,
      id: `93000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    });
  }
  const participantEntryId = raw.ledgerEntries[0]!.id;
  for (let index = 3; index <= PAGE_SIZE + 3; index += 1) {
    const memberId = `94000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    raw.journeyMembers.push({
      id: memberId,
      tripId: journeyId,
      role: "group_member",
      status: "unlinked",
    });
    raw.ledgerEntryParticipants.push({
      ledgerEntryId: participantEntryId,
      memberId,
      splitMethod: "equal",
      shareAmount: null,
      sharePercentage: null,
      computedShareBaseAmount: "0.00",
    });
  }
  return raw;
}

function csv(headers: string[], rows: ApiRow[]) {
  const escape = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => escape(row[header] ?? "")).join(",")).join("\n")}${rows.length ? "\n" : ""}`;
}

function compareRows(left: ApiRow, right: ApiRow, order: string[]) {
  for (const column of order) {
    if (left[column]! < right[column]!) return -1;
    if (left[column]! > right[column]!) return 1;
  }
  return 0;
}

function makeFetch(input: {
  passA: Snapshot;
  passB?: Snapshot;
  fault?: Fault;
  visibleJourney?: boolean;
  reverseResponseColumns?: boolean;
  headerlessEmpty?: boolean;
  malformedHeaderTable?: SourceTable;
}) {
  let activePass: "A" | "B" = "A";
  let tripScanStarts = 0;
  const calls: { url: URL; init: RequestInit }[] = [];
  const mock = vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
    const url = new URL(request instanceof Request ? request.url : request.toString());
    const requestInit = init ?? {};
    calls.push({ url, init: requestInit });
    const table = url.pathname.slice("/rest/v1/".length) as SourceTable;
    const select = url.searchParams.get("select")!;
    const headers = select.split(",");
    if (input.reverseResponseColumns) headers.reverse();
    if (input.malformedHeaderTable === table && headers.length > 1)
      headers[0] = "relation(id)";
    const isPreflight = table === "trips" && select === "id";
    if (
      table === "trips" &&
      !isPreflight &&
      url.searchParams.get("limit") !== "0" &&
      !url.searchParams.get("id")?.startsWith("gt.")
    ) {
      tripScanStarts += 1;
      activePass = tripScanStarts === 1 ? "A" : "B";
    }
    const source = activePass === "A" ? input.passA : (input.passB ?? input.passA);
    if (isPreflight && input.visibleJourney === false) {
      return new Response("id\n", {
        headers: { "content-type": "text/csv", "content-range": "*/0" },
      });
    }
    const presenceColumn = STAGE9_SOURCE_ALLOWLIST[table].presenceOnly.find(
      (column) => url.searchParams.get(column) === "not.is.null",
    );
    if (presenceColumn) {
      const count = source.presence[`${table}.${presenceColumn}`] ?? 0;
      return new Response(input.headerlessEmpty ? "\r\n" : `${headers.join(",")}\n`, {
        headers: { "content-type": "text/csv", "content-range": `*/${count}` },
      });
    }
    let rows = source.rows[table].map((row) => ({ ...row }));
    for (const [column, filter] of url.searchParams) {
      if (["select", "order", "limit", "or"].includes(column)) continue;
      if (filter.startsWith("eq."))
        rows = rows.filter((row) => row[column] === filter.slice(3));
      else if (filter.startsWith("gt."))
        rows = rows.filter((row) => row[column]! > filter.slice(3));
      else if (filter.startsWith("in.(")) {
        const values = new Set(filter.slice(4, -1).split(","));
        rows = rows.filter((row) => values.has(row[column]!));
      }
    }
    const composite =
      /^\((\w+)\.gt\.([^,]+),and\(\1\.eq\.([^,]+),(\w+)\.gt\.([^)]+)\)\)$/.exec(
        url.searchParams.get("or") ?? "",
      );
    if (composite) {
      const [, first, greaterFirst, equalFirst, second, greaterSecond] = composite;
      rows = rows.filter(
        (row) =>
          row[first!]! > greaterFirst! ||
          (row[first!] === equalFirst && row[second!]! > greaterSecond!),
      );
    }
    const order = url.searchParams
      .get("order")!
      .split(",")
      .map((part) => part.replace(/\.asc$/, ""));
    rows.sort((left, right) => compareRows(left, right, order));
    let total = rows.length;
    const cursorRequest =
      url.searchParams.has("or") ||
      order.some((column) => url.searchParams.get(column)?.startsWith("gt."));
    if (
      input.fault === "missing" &&
      activePass === "A" &&
      table === "ledger_entries" &&
      !cursorRequest
    )
      total += 1;
    const limit = Number(url.searchParams.get("limit"));
    let page = rows.slice(0, limit);
    if (
      input.fault === "out-of-order" &&
      activePass === "A" &&
      table === "ledger_entries" &&
      !cursorRequest
    )
      page = page.reverse();
    if (
      input.fault === "duplicate" &&
      activePass === "A" &&
      table === "ledger_entries" &&
      cursorRequest
    ) {
      const cursor = order
        .map((column) => url.searchParams.get(column)?.slice(3))
        .find(Boolean);
      const duplicate = source.rows.ledger_entries.find((row) => row.id === cursor);
      if (duplicate) page.unshift({ ...duplicate });
    }
    const range = page.length ? `0-${page.length - 1}/${total}` : `*/${total}`;
    return new Response(
      input.headerlessEmpty && !page.length ? "\r\n" : csv(headers, page),
      {
        headers: { "content-type": "text/csv", "content-range": range },
      },
    );
  });
  return { mock, calls };
}

function options(root: string, accessTokenPath: string) {
  return {
    sourceUrl: origin,
    projectRef,
    journeyId,
    publishableKey: "sb_publishable_synthetic",
    accessTokenPath,
    privateRoot: root,
    estimatedTwoPassSeconds: 60,
    nowMs,
  };
}

function allNames(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return [entry.name, ...(entry.isDirectory() ? allNames(path) : [])];
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  while (roots.length) {
    const root = roots.pop()!;
    if (existsSync(root)) {
      const makeWritable = (path: string) => {
        if (statSync(path).isDirectory()) {
          chmodSync(path, 0o700);
          for (const name of readdirSync(path)) makeWritable(join(path, name));
        } else chmodSync(path, 0o600);
      };
      makeWritable(root);
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("Stage 9 authenticated GET-only extractor", () => {
  test("locks the seven-table allowlist and normalizes safe CSV header variants", () => {
    expect(() => validateStage9SourceAllowlist()).not.toThrow();
    for (const contract of Object.values(STAGE9_SOURCE_ALLOWLIST)) {
      expect(new Set(contract.rows).size).toBe(contract.rows.length);
      expect(new Set(contract.presenceOnly).size).toBe(contract.presenceOnly.length);
      expect(
        contract.rows.some((column) => contract.presenceOnly.includes(column as never)),
      ).toBe(false);
      expect(
        [...contract.rows, ...contract.presenceOnly].every((column) =>
          /^[a-z][a-z0-9_]*$/.test(column),
        ),
      ).toBe(true);
    }
    expect(
      parseStage9Csv(
        '\uFEFF"end_date","id","start_date"\r\n"2026-09-15","synthetic-id","2026-09-13"\r\n',
        ["id", "start_date", "end_date"],
      ),
    ).toEqual([{ id: "synthetic-id", start_date: "2026-09-13", end_date: "2026-09-15" }]);
    expect(parseStage9Csv("\r\n", ["id"], true)).toEqual([]);
    expect(() => parseStage9Csv("\r\n", ["id"])).toThrow(
      /^STAGE9_CSV_COLUMNS_INVALID:1:0:[0-9a-f]{64}$/,
    );
    expect(() => parseStage9Csv('"id","relation(id)"\n', ["id", "start_date"])).toThrow(
      /^STAGE9_CSV_COLUMNS_INVALID:2:2:[0-9a-f]{64}$/,
    );
  });

  test("commits an exact two-pass multi-page keyset extraction without token leakage", async () => {
    const runtimeRoot = privateRoot();
    const root = join(runtimeRoot, "artifacts");
    mkdirSync(root, { mode: 0o700 });
    const token = jwt();
    const path = tokenFile(runtimeRoot, token);
    const source = snapshot(pagedLegacyExtract());
    const http = makeFetch({ passA: source, reverseResponseColumns: true });
    vi.stubGlobal("fetch", http.mock);

    const result = await extractStage9Authenticated(options(root, path));

    expect(result.receipt.state).toBe("COMMITTED");
    expect(result.receipt.tables.ledger_entries.rowCount).toBe(PAGE_SIZE + 1);
    expect(result.receipt.tables.ledger_entry_participants.rowCount).toBeGreaterThan(
      PAGE_SIZE,
    );
    expect(existsSync(join(result.rawRoot, "stage9-raw-commit.json"))).toBe(true);
    expect(existsSync(path)).toBe(false);
    expect(
      http.calls.some(({ url }) =>
        [...url.searchParams.values()].some((value) => value.startsWith("gt.")),
      ),
    ).toBe(true);
    expect(http.calls.some(({ url }) => url.searchParams.has("or"))).toBe(true);
    expect(
      new Set(
        http.calls.map(({ init }) => new Headers(init.headers).get("authorization")),
      ),
    ).toEqual(new Set([`Bearer ${token}`]));
    expect(
      http.calls.every(({ url, init }) => url.origin === origin && init.method === "GET"),
    ).toBe(true);
    for (const { url } of http.calls) {
      const table = url.pathname.slice("/rest/v1/".length) as SourceTable;
      const select = url.searchParams.get("select")!;
      expect([
        STAGE9_SOURCE_ALLOWLIST[table].rows.join(","),
        table === "trips" ? "id" : "",
      ]).toContain(select);
      expect(select).not.toMatch(/[():!]/);
      expect(
        STAGE9_SOURCE_ALLOWLIST[table].presenceOnly.some((column) =>
          select.split(",").includes(column),
        ),
      ).toBe(false);
    }
    expect(readFileSync(result.rawPath, "utf8")).not.toContain(tokenCanary);
    expect(readCommittedStage9Raw(result.rawPath).length).toBeGreaterThan(0);
    expect(
      readFileSync(join(result.rawRoot, "stage9-raw-commit.json"), "utf8"),
    ).not.toContain(tokenCanary);
  });

  test("accepts headerless empty GET and limit=0 bodies only under count contracts", async () => {
    const root = privateRoot();
    const path = tokenFile(root, jwt());
    const raw = syntheticLegacyExtract();
    raw.ledgerSettlements = [];
    raw.redactionPresenceCounts["ledger_settlements.notes"] = 0;
    const http = makeFetch({ passA: snapshot(raw), headerlessEmpty: true });
    vi.stubGlobal("fetch", http.mock);

    const result = await extractStage9Authenticated(options(root, path));

    expect(result.receipt.state).toBe("COMMITTED");
    expect(result.receipt.tables.ledger_settlements.rowCount).toBe(0);
  });

  test("reports only safe metadata for a mismatched response header", async () => {
    const root = privateRoot();
    const path = tokenFile(root, jwt());
    const http = makeFetch({
      passA: snapshot(syntheticLegacyExtract()),
      malformedHeaderTable: "journey_members",
    });
    vi.stubGlobal("fetch", http.mock);

    await expect(extractStage9Authenticated(options(root, path))).rejects.toThrow(
      /^STAGE9_CSV_COLUMNS_INVALID:4:4:[0-9a-f]{64}:journey_members$/,
    );
    expect(allNames(root)).not.toContain("stage9-raw-commit.json");
  });

  test("resolves one member through the fixed authenticated mapping-only GET", async () => {
    const root = privateRoot();
    const token = jwt();
    const path = tokenFile(root, token);
    const memberId = syntheticLegacyExtract().journeyMembers[0]!.id;
    const fetchMock = vi.fn(
      async (request: string | URL | Request, init?: RequestInit) => {
        const url = new URL(
          request instanceof Request ? request.url : request.toString(),
        );
        expect(url.pathname).toBe("/rest/v1/journey_members");
        expect(url.searchParams.get("select")).toBe("id");
        expect(url.searchParams.get("trip_id")).toBe(`eq.${journeyId}`);
        expect(url.searchParams.get("user_id")).toBe(
          "eq.00000000-0000-4000-8000-000000000001",
        );
        expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
        return new Response(`id\n${memberId}\n`, {
          headers: { "content-type": "text/csv", "content-range": "0-0/1" },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const resolved = await resolveStage9AuthenticatedMember({
      ...options(root, path),
      estimatedOperationSeconds: 60,
    });

    expect(resolved).toBe(memberId);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(existsSync(path)).toBe(false);
  });

  test.each([
    ["zero", "id\n", "*/0"],
    [
      "multiple",
      "id\n90000000-0000-4000-8000-000000000001\n90000000-0000-4000-8000-000000000002\n",
      "0-1/2",
    ],
  ])("rejects %s authenticated member matches", async (_name, body, range) => {
    const root = privateRoot();
    const path = tokenFile(root, jwt());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(body, {
            headers: { "content-type": "text/csv", "content-range": range },
          }),
        ),
      ),
    );
    await expect(
      resolveStage9AuthenticatedMember({
        ...options(root, path),
        estimatedOperationSeconds: 60,
      }),
    ).rejects.toThrow("STAGE9_MAPPING_MEMBER_NOT_EXACTLY_ONE");
  });

  test("replaces only invalid private mapping entries after owner HMAC verification", () => {
    const raw = syntheticLegacyExtract();
    const sourceMemberId = raw.journeyMembers[0]!.id;
    const namespaceKey = "stage9-synthetic-key-0123456789abcdef0123456789abcdef";
    const devOperatorUserId = "00000000-0000-4000-8000-000000000001";
    const expectedMemberRefHmac = createHmac("sha256", namespaceKey)
      .update(`member|${sourceMemberId}`)
      .digest("hex");
    const result = buildResolvedStage9Mapping({
      raw,
      config: {
        namespaceKey,
        devOperatorUserId,
        linkedUserBySourceMemberId: { invalid: "invalid" },
      },
      sourceMemberId,
      expectedMemberRefHmac,
    });

    expect(result.config.linkedUserBySourceMemberId).toEqual({
      [sourceMemberId]: devOperatorUserId,
    });
    expect(result.invalidMappingEntriesRemoved).toBe(1);
    expect(() =>
      buildResolvedStage9Mapping({
        raw,
        config: result.config,
        sourceMemberId,
        expectedMemberRefHmac: "0".repeat(64),
      }),
    ).toThrow("STAGE9_MAPPING_MEMBER_HMAC_MISMATCH");
  });

  test.each(["duplicate", "missing", "out-of-order"] as const)(
    "rejects %s page identities",
    async (fault) => {
      const root = privateRoot();
      const path = tokenFile(root, jwt());
      const http = makeFetch({ passA: snapshot(pagedLegacyExtract()), fault });
      vi.stubGlobal("fetch", http.mock);
      await expect(extractStage9Authenticated(options(root, path))).rejects.toThrow(
        /STAGE9_(DUPLICATE_ROW_IDENTITY|PAGE_IDENTITY_MISSING|ROW_ORDER_INVALID)/,
      );
      expect(allNames(root)).not.toContain("stage9-raw-commit.json");
    },
  );

  test.each(["insert", "delete", "update", "presence"] as const)(
    "rejects Pass A/B %s drift and never commits the candidate",
    async (change) => {
      const rawA = pagedLegacyExtract();
      const rawB = structuredClone(rawA);
      if (change === "insert")
        rawB.ledgerEntries.push({
          ...rawB.ledgerEntries[0]!,
          id: "95000000-0000-4000-8000-000000000001",
        });
      if (change === "delete") rawB.ledgerEntries.pop();
      if (change === "update") rawB.ledgerEntries[0]!.originalAmount = "999.99";
      if (change === "presence") rawB.redactionPresenceCounts["ledger_entries.title"] = 7;
      const root = privateRoot();
      const path = tokenFile(root, jwt());
      const http = makeFetch({ passA: snapshot(rawA), passB: snapshot(rawB) });
      vi.stubGlobal("fetch", http.mock);
      await expect(extractStage9Authenticated(options(root, path))).rejects.toThrow(
        "STAGE9_SOURCE_CHANGED_DURING_EXTRACTION",
      );
      expect(allNames(root)).not.toContain("raw");
      expect(allNames(root)).not.toContain("stage9-raw-commit.json");
    },
  );

  test.each([
    ["expired", { exp: Math.floor(nowMs / 1000) - 1 }, "STAGE9_TOKEN_EXPIRED"],
    [
      "insufficient",
      { exp: Math.floor(nowMs / 1000) + 360 },
      "STAGE9_TOKEN_TTL_INSUFFICIENT",
    ],
    ["role", { role: "anon" }, "STAGE9_TOKEN_ROLE_INVALID"],
    [
      "issuer",
      { iss: "https://wrong.supabase.co/auth/v1" },
      "STAGE9_TOKEN_ISSUER_INVALID",
    ],
  ] as const)("rejects %s token before HTTP", async (_name, claims, code) => {
    const root = privateRoot();
    const path = tokenFile(root, jwt(claims));
    const fetchMock = vi.fn(() => Promise.reject(new Error("network must not run")));
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractStage9Authenticated(options(root, path))).rejects.toThrow(code);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(existsSync(path)).toBe(false);
  });

  test("rejects an invisible or wrong Journey before Pass A", async () => {
    const root = privateRoot();
    const path = tokenFile(root, jwt());
    const http = makeFetch({
      passA: snapshot(syntheticLegacyExtract()),
      visibleJourney: false,
    });
    vi.stubGlobal("fetch", http.mock);
    await expect(extractStage9Authenticated(options(root, path))).rejects.toThrow(
      "STAGE9_JOURNEY_NOT_EXACTLY_ONE_VISIBLE",
    );
    expect(allNames(root)).not.toContain("stage9-raw-commit.json");
  });

  test("rejects forbidden method, path, and query construction", () => {
    const valid = new URL(
      `${origin}/rest/v1/trips?select=id%2Cstart_date%2Cend_date&order=id.asc&limit=100&id=eq.${journeyId}`,
    );
    expect(() =>
      assertStage9RestRequest(valid, { method: "POST", redirect: "manual" }, projectRef),
    ).toThrow("STAGE9_HTTP_REQUEST_FORBIDDEN");
    expect(() =>
      assertStage9RestRequest(
        new URL(`${origin}/rest/v1/rpc/anything?select=id&order=id.asc&limit=1`),
        { method: "GET", redirect: "manual" },
        projectRef,
      ),
    ).toThrow("STAGE9_NETWORK_PATH_FORBIDDEN");
    valid.searchParams.set("unapproved", "like.*Europe*");
    expect(() =>
      assertStage9RestRequest(
        valid,
        {
          method: "GET",
          redirect: "manual",
          headers: {
            Accept: "text/csv",
            Prefer: "count=exact",
            Authorization: "Bearer synthetic",
            apikey: "synthetic",
          },
        },
        projectRef,
      ),
    ).toThrow("STAGE9_QUERY_FORBIDDEN");

    const mappingUrl = new URL(
      `${origin}/rest/v1/journey_members?select=id&limit=2&trip_id=eq.${journeyId}&user_id=eq.00000000-0000-4000-8000-000000000001`,
    );
    mappingUrl.searchParams.set("role", "eq.owner");
    expect(() =>
      assertStage9MappingLookupRequest({
        url: mappingUrl,
        init: {
          method: "GET",
          redirect: "manual",
          headers: {
            Accept: "text/csv",
            Prefer: "count=exact",
            Authorization: "Bearer synthetic",
            apikey: "synthetic",
          },
        },
        projectRef,
        journeyId,
        subject: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow("STAGE9_MAPPING_QUERY_FORBIDDEN");
  });
});

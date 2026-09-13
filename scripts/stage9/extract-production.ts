import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  legacyExtractSchema,
  STAGE9_SOURCE_ALLOWLIST,
  type LegacyExtract,
} from "../../backend/src/stage9Import";

const projectRoot = resolve(import.meta.dirname, "../..");
const legacyRoot = "/Users/xoery/Project/otr";
const projectRefPattern = /^[a-z0-9]{20}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 100;
const PARTICIPANT_PARENT_CHUNK_SIZE = 40;
const TOKEN_SAFETY_MARGIN_SECONDS = 300;
const MINIMUM_ESTIMATE_SECONDS = 60;
const MAX_PAGE_BYTES = 16 * 1024 * 1024;

type SourceTable = keyof typeof STAGE9_SOURCE_ALLOWLIST;
type CsvRecord = Record<string, string>;
type TableSummary = { rowCount: number; identitySha256: string; contentSha256: string };
type SourceSet = Pick<
  LegacyExtract,
  | "trips"
  | "journeyMembers"
  | "journeyLedgers"
  | "ledgerEntries"
  | "ledgerEntryParticipants"
  | "journeyExchangeRates"
  | "ledgerSettlements"
  | "redactionPresenceCounts"
>;

const tableNames = [
  "trips",
  "journey_members",
  "journey_ledgers",
  "ledger_entries",
  "ledger_entry_participants",
  "journey_exchange_rates",
  "ledger_settlements",
] as const satisfies readonly SourceTable[];
const specs: Record<
  SourceTable,
  {
    order: readonly string[];
    scopeColumn: "id" | "trip_id" | "journey_id" | "ledger_entry_id";
  }
> = {
  trips: { order: ["id"], scopeColumn: "id" },
  journey_members: { order: ["id"], scopeColumn: "trip_id" },
  journey_ledgers: { order: ["journey_id"], scopeColumn: "journey_id" },
  ledger_entries: { order: ["id"], scopeColumn: "journey_id" },
  ledger_entry_participants: {
    order: ["ledger_entry_id", "member_id"],
    scopeColumn: "ledger_entry_id",
  },
  journey_exchange_rates: {
    order: ["base_currency", "quote_currency"],
    scopeColumn: "journey_id",
  },
  ledger_settlements: { order: ["id"], scopeColumn: "journey_id" },
};

export function validateStage9SourceAllowlist() {
  if (Object.keys(STAGE9_SOURCE_ALLOWLIST).join(",") !== tableNames.join(","))
    throw new Error("STAGE9_TABLE_ALLOWLIST_INVALID");
  for (const table of tableNames) {
    const { rows, presenceOnly } = STAGE9_SOURCE_ALLOWLIST[table];
    const selected = new Set<string>(rows);
    const presence = new Set<string>(presenceOnly);
    if (
      selected.size !== rows.length ||
      presence.size !== presenceOnly.length ||
      rows.some((column) => !/^[a-z][a-z0-9_]*$/.test(column)) ||
      presenceOnly.some(
        (column) => !/^[a-z][a-z0-9_]*$/.test(column) || selected.has(column),
      ) ||
      specs[table].order.some((column) => !selected.has(column)) ||
      !selected.has(specs[table].scopeColumn)
    )
      throw new Error(`STAGE9_COLUMN_ALLOWLIST_INVALID:${table}`);
  }
}

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function outsideRepository(path: string, repository: string) {
  const candidate = relative(repository, path);
  return candidate.startsWith("..") && !isAbsolute(candidate);
}

function inside(path: string, root: string) {
  const candidate = relative(root, path);
  return candidate !== "" && !candidate.startsWith("..") && !isAbsolute(candidate);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function decodeJwtPayload(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("STAGE9_ACCESS_TOKEN_INVALID");
  try {
    return JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    throw new Error("STAGE9_ACCESS_TOKEN_INVALID");
  }
}

export function validateStage9AccessToken(input: {
  token: string;
  sourceOrigin: string;
  estimatedTwoPassSeconds: number;
  nowMs?: number;
}) {
  if (
    !Number.isInteger(input.estimatedTwoPassSeconds) ||
    input.estimatedTwoPassSeconds < MINIMUM_ESTIMATE_SECONDS
  )
    throw new Error("STAGE9_EXTRACTION_ESTIMATE_INVALID");
  const payload = decodeJwtPayload(input.token);
  if (payload.role !== "authenticated") throw new Error("STAGE9_TOKEN_ROLE_INVALID");
  if (payload.iss !== `${input.sourceOrigin}/auth/v1`)
    throw new Error("STAGE9_TOKEN_ISSUER_INVALID");
  if (typeof payload.sub !== "string" || !uuidPattern.test(payload.sub))
    throw new Error("STAGE9_TOKEN_SUBJECT_INVALID");
  if (typeof payload.exp !== "number" || !Number.isInteger(payload.exp))
    throw new Error("STAGE9_TOKEN_EXPIRY_INVALID");
  const remainingSeconds = payload.exp - Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (remainingSeconds <= 0) throw new Error("STAGE9_TOKEN_EXPIRED");
  if (remainingSeconds <= input.estimatedTwoPassSeconds + TOKEN_SAFETY_MARGIN_SECONDS)
    throw new Error("STAGE9_TOKEN_TTL_INSUFFICIENT");
  return { expiresAt: payload.exp, remainingSeconds, subject: payload.sub };
}

function validatePublishableKey(value: string) {
  if (value.startsWith("sb_secret_")) throw new Error("STAGE9_SERVICE_KEY_FORBIDDEN");
  if (value.startsWith("sb_publishable_")) return;
  const payload = decodeJwtPayload(value);
  if (payload.role !== "anon") throw new Error("STAGE9_SERVICE_KEY_FORBIDDEN");
}

export function validateStage9RestOrigin(sourceUrl: string, projectRef: string) {
  if (!projectRefPattern.test(projectRef)) throw new Error("STAGE9_PROJECT_REF_INVALID");
  const url = new URL(sourceUrl);
  const expectedOrigin = `https://${projectRef}.supabase.co`;
  if (
    url.origin !== expectedOrigin ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("STAGE9_REST_ORIGIN_FORBIDDEN");
  return expectedOrigin;
}

function allowedQueryKeys(table: SourceTable) {
  return new Set([
    "select",
    "order",
    "limit",
    "or",
    specs[table].scopeColumn,
    ...specs[table].order,
    ...STAGE9_SOURCE_ALLOWLIST[table].presenceOnly,
  ]);
}

export function assertStage9RestRequest(url: URL, init: RequestInit, projectRef: string) {
  const expectedOrigin = `https://${projectRef}.supabase.co`;
  if (url.origin !== expectedOrigin || !url.pathname.startsWith("/rest/v1/"))
    throw new Error("STAGE9_NETWORK_TARGET_FORBIDDEN");
  const table = url.pathname.slice("/rest/v1/".length) as SourceTable;
  if (!tableNames.includes(table) || url.pathname !== `/rest/v1/${table}`)
    throw new Error("STAGE9_NETWORK_PATH_FORBIDDEN");
  if (init.method !== "GET" || init.body !== undefined || init.redirect !== "manual")
    throw new Error("STAGE9_HTTP_REQUEST_FORBIDDEN");
  const headers = new Headers(init.headers);
  if (
    headers.get("accept") !== "text/csv" ||
    headers.get("prefer") !== "count=exact" ||
    !headers.get("authorization")?.startsWith("Bearer ") ||
    !headers.get("apikey")
  )
    throw new Error("STAGE9_HTTP_HEADERS_INVALID");
  const allowed = allowedQueryKeys(table);
  const seen = new Set<string>();
  for (const key of url.searchParams.keys())
    if (!allowed.has(key) || seen.has(key)) throw new Error("STAGE9_QUERY_FORBIDDEN");
    else seen.add(key);
  const select = url.searchParams.get("select");
  const fullSelect = STAGE9_SOURCE_ALLOWLIST[table].rows.join(",");
  if (select !== fullSelect && !(table === "trips" && select === "id"))
    throw new Error("STAGE9_SELECT_FORBIDDEN");
  if (
    url.searchParams.get("order") !==
    specs[table].order.map((key) => `${key}.asc`).join(",")
  )
    throw new Error("STAGE9_ORDER_FORBIDDEN");
  const limit = Number(url.searchParams.get("limit"));
  if (!Number.isInteger(limit) || limit < 0 || limit > PAGE_SIZE)
    throw new Error("STAGE9_LIMIT_FORBIDDEN");
  const presenceFilters = STAGE9_SOURCE_ALLOWLIST[table].presenceOnly.filter((column) =>
    url.searchParams.has(column),
  );
  if ((limit === 0) !== (presenceFilters.length === 1))
    throw new Error("STAGE9_PRESENCE_QUERY_INVALID");
  for (const column of STAGE9_SOURCE_ALLOWLIST[table].presenceOnly) {
    const value = url.searchParams.get(column);
    if (value !== null && value !== "not.is.null")
      throw new Error("STAGE9_FILTER_FORBIDDEN");
  }
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const eqUuid = new RegExp(`^eq\\.${uuid}$`, "i");
  const gtUuid = new RegExp(`^gt\\.${uuid}$`, "i");
  const inUuids = new RegExp(
    `^in\\.\\(${uuid}(?:,${uuid}){0,${PARTICIPANT_PARENT_CHUNK_SIZE - 1}}\\)$`,
    "i",
  );
  const scopeValue = url.searchParams.get(specs[table].scopeColumn);
  if (
    scopeValue === null ||
    (table === "ledger_entry_participants"
      ? !inUuids.test(scopeValue)
      : !eqUuid.test(scopeValue))
  )
    throw new Error("STAGE9_SCOPE_FILTER_INVALID");
  for (const orderColumn of specs[table].order) {
    const value = url.searchParams.get(orderColumn);
    if (value !== null && orderColumn !== specs[table].scopeColumn && !gtUuid.test(value))
      throw new Error("STAGE9_CURSOR_FILTER_INVALID");
  }
  const composite = url.searchParams.get("or");
  const participantCursor = new RegExp(
    `^\\(ledger_entry_id\\.gt\\.${uuid},and\\(ledger_entry_id\\.eq\\.${uuid},member_id\\.gt\\.${uuid}\\)\\)$`,
    "i",
  );
  const exchangeCursor =
    /^\(base_currency\.gt\.[A-Z]{3},and\(base_currency\.eq\.[A-Z]{3},quote_currency\.gt\.[A-Z]{3}\)\)$/;
  if (
    composite !== null &&
    !(
      (table === "ledger_entry_participants" && participantCursor.test(composite)) ||
      (table === "journey_exchange_rates" && exchangeCursor.test(composite))
    )
  )
    throw new Error("STAGE9_CURSOR_FILTER_INVALID");
  if (select === "id" && (table !== "trips" || limit !== 2 || presenceFilters.length))
    throw new Error("STAGE9_PREFLIGHT_QUERY_INVALID");
}

export function assertStage9MappingLookupRequest(input: {
  url: URL;
  init: RequestInit;
  projectRef: string;
  journeyId: string;
  subject: string;
}) {
  const { url, init, projectRef, journeyId, subject } = input;
  if (
    url.origin !== `https://${projectRef}.supabase.co` ||
    url.pathname !== "/rest/v1/journey_members"
  )
    throw new Error("STAGE9_MAPPING_NETWORK_TARGET_FORBIDDEN");
  if (init.method !== "GET" || init.body !== undefined || init.redirect !== "manual")
    throw new Error("STAGE9_MAPPING_HTTP_REQUEST_FORBIDDEN");
  const headers = new Headers(init.headers);
  if (
    headers.get("accept") !== "text/csv" ||
    headers.get("prefer") !== "count=exact" ||
    !headers.get("authorization")?.startsWith("Bearer ") ||
    !headers.get("apikey")
  )
    throw new Error("STAGE9_MAPPING_HTTP_HEADERS_INVALID");
  const expected = new URLSearchParams({
    select: "id",
    limit: "2",
    trip_id: `eq.${journeyId}`,
    user_id: `eq.${subject}`,
  });
  if (url.searchParams.toString() !== expected.toString())
    throw new Error("STAGE9_MAPPING_QUERY_FORBIDDEN");
}

function readAndConsumeToken(path: string, privateRoot: string) {
  const requested = resolve(path);
  const metadata = lstatSync(requested);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.mode & 0o077)
    throw new Error("STAGE9_TOKEN_FILE_UNSAFE");
  const resolved = realpathSync(requested);
  if (
    inside(resolved, privateRoot) === false &&
    (!outsideRepository(resolved, projectRoot) ||
      !outsideRepository(resolved, legacyRoot))
  )
    throw new Error("STAGE9_TOKEN_PATH_FORBIDDEN");
  const parent = statSync(dirname(resolved));
  if (
    !parent.isDirectory() ||
    parent.mode & 0o077 ||
    (typeof process.getuid === "function" && parent.uid !== process.getuid())
  )
    throw new Error("STAGE9_TOKEN_DIRECTORY_UNSAFE");
  if (typeof process.getuid === "function" && metadata.uid !== process.getuid())
    throw new Error("STAGE9_TOKEN_FILE_OWNER_INVALID");
  const token = readFileSync(resolved, "utf8").trim();
  unlinkSync(resolved); // Retention cleanup only; never claimed as secure erase on SSD/APFS.
  if (!token || /\s/.test(token)) throw new Error("STAGE9_ACCESS_TOKEN_INVALID");
  return token;
}

function columnContractError(expectedHeaders: string[], actualHeaders: string[]) {
  const normalizedHeaderDigest = sha256(
    actualHeaders
      .map((header) => header.normalize("NFC"))
      .sort()
      .join("\u001f"),
  );
  return new Error(
    `STAGE9_CSV_COLUMNS_INVALID:${expectedHeaders.length}:${actualHeaders.length}:${normalizedHeaderDigest}`,
  );
}

export function parseStage9Csv(
  text: string,
  expectedHeaders: string[],
  allowHeaderlessEmpty = false,
) {
  if (text.startsWith("\uFEFF")) text = text.slice(1);
  if (text.trim() === "") {
    if (allowHeaderlessEmpty) return [];
    throw columnContractError(expectedHeaders, []);
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("STAGE9_CSV_INVALID");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0]!;
  if (
    headers.length !== expectedHeaders.length ||
    new Set(headers).size !== headers.length ||
    expectedHeaders.some((header) => !headers.includes(header))
  )
    throw columnContractError(expectedHeaders, headers);
  return rows.slice(1).map((values) => {
    if (values.length !== headers.length) throw new Error("STAGE9_CSV_INVALID");
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index]!]),
    ) as CsvRecord;
  });
}

function contentRangeTotal(value: string | null) {
  const match = /^(?:\d+-\d+|\*)\/(\d+)$/.exec(value ?? "");
  if (!match) throw new Error("STAGE9_CONTENT_RANGE_INVALID");
  return Number(match[1]);
}

type RequestContext = {
  origin: string;
  projectRef: string;
  publishableKey: string;
  token: string;
};

async function getCsv(
  context: RequestContext,
  table: SourceTable,
  parameters: URLSearchParams,
) {
  const url = new URL(`/rest/v1/${table}`, context.origin);
  url.search = parameters.toString();
  const init: RequestInit = {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: "text/csv",
      Prefer: "count=exact",
      apikey: context.publishableKey,
      Authorization: `Bearer ${context.token}`,
    },
  };
  assertStage9RestRequest(url, init, context.projectRef);
  const response = await globalThis.fetch(url, init);
  if (response.status >= 300 && response.status < 400)
    throw new Error("STAGE9_REDIRECT_FORBIDDEN");
  if (!response.ok) throw new Error(`STAGE9_REST_REQUEST_FAILED:${response.status}`);
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/csv"))
    throw new Error("STAGE9_RESPONSE_MEDIA_TYPE_INVALID");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_PAGE_BYTES) throw new Error("STAGE9_PAGE_TOO_LARGE");
  const total = contentRangeTotal(response.headers.get("content-range"));
  const limit = Number(parameters.get("limit"));
  try {
    return {
      rows: parseStage9Csv(
        text,
        parameters.get("select")!.split(","),
        total === 0 || limit === 0,
      ),
      total,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("STAGE9_CSV_COLUMNS_INVALID"))
      throw new Error(`${error.message}:${table}`);
    throw error;
  }
}

function baseParameters(table: SourceTable) {
  return new URLSearchParams({
    select: STAGE9_SOURCE_ALLOWLIST[table].rows.join(","),
    order: specs[table].order.map((key) => `${key}.asc`).join(","),
    limit: String(PAGE_SIZE),
  });
}

function identity(record: CsvRecord, keys: readonly string[]) {
  const values = keys.map((key) => record[key] ?? "");
  if (values.some((value) => value === ""))
    throw new Error("STAGE9_ROW_IDENTITY_MISSING");
  return values.join("\u001f");
}

function setCursor(
  parameters: URLSearchParams,
  keys: readonly string[],
  previous: CsvRecord,
) {
  if (keys.length === 1) {
    parameters.set(keys[0]!, `gt.${previous[keys[0]!]}`);
    return;
  }
  const [first, second] = keys;
  parameters.set(
    "or",
    `(${first}.gt.${previous[first!]},and(${first}.eq.${previous[first!]},${second}.gt.${previous[second!]}))`,
  );
}

async function scanTable(
  context: RequestContext,
  table: SourceTable,
  scope: (parameters: URLSearchParams) => void,
) {
  const result: CsvRecord[] = [];
  const identities = new Set<string>();
  let expectedTotal: number | null = null;
  let previous: CsvRecord | null = null;
  while (true) {
    const parameters = baseParameters(table);
    scope(parameters);
    if (previous) setCursor(parameters, specs[table].order, previous);
    const page = await getCsv(context, table, parameters);
    if (expectedTotal === null) expectedTotal = page.total;
    if (page.rows.length === 0) break;
    for (const record of page.rows) {
      const key = identity(record, specs[table].order);
      if (identities.has(key)) throw new Error("STAGE9_DUPLICATE_ROW_IDENTITY");
      const previousKey = previous ? identity(previous, specs[table].order) : null;
      if (previousKey !== null && key.localeCompare(previousKey) <= 0)
        throw new Error("STAGE9_ROW_ORDER_INVALID");
      identities.add(key);
      result.push(record);
      previous = record;
    }
    if (result.length >= expectedTotal) break;
  }
  if (result.length !== (expectedTotal ?? 0))
    throw new Error("STAGE9_PAGE_IDENTITY_MISSING");
  return result;
}

async function presenceCount(
  context: RequestContext,
  table: SourceTable,
  column: string,
  scope: (parameters: URLSearchParams) => void,
) {
  const parameters = baseParameters(table);
  parameters.set("limit", "0");
  parameters.set(column, "not.is.null");
  scope(parameters);
  return (await getCsv(context, table, parameters)).total;
}

function eqScope(column: string, value: string) {
  return (parameters: URLSearchParams) => parameters.set(column, `eq.${value}`);
}

function participantScope(parentIds: string[]) {
  return (parameters: URLSearchParams) =>
    parameters.set("ledger_entry_id", `in.(${parentIds.join(",")})`);
}

function nullable(value: string) {
  return value === "" ? null : value;
}

function toSourceSet(input: {
  tables: Record<SourceTable, CsvRecord[]>;
  redactionPresenceCounts: Record<string, number>;
}): SourceSet {
  return {
    trips: input.tables.trips.map((row) => ({
      id: row.id!,
      startDate: nullable(row.start_date!),
      endDate: nullable(row.end_date!),
    })),
    journeyMembers: input.tables.journey_members.map((row) => ({
      id: row.id!,
      tripId: row.trip_id!,
      role: row.role as LegacyExtract["journeyMembers"][number]["role"],
      status: row.status as LegacyExtract["journeyMembers"][number]["status"],
    })),
    journeyLedgers: input.tables.journey_ledgers.map((row) => ({
      journeyId: row.journey_id!,
      baseCurrency: row.base_currency!,
      displayCurrency: row.display_currency!,
      exchangeRatesSnapshotDate: row.exchange_rates_snapshot_date!,
    })),
    ledgerEntries: input.tables.ledger_entries.map((row) => ({
      id: row.id!,
      journeyId: row.journey_id!,
      category: row.category!,
      accountingMode:
        row.accounting_mode as LegacyExtract["ledgerEntries"][number]["accountingMode"],
      expenseDate: row.expense_date!,
      startDate: nullable(row.start_date!),
      endDate: nullable(row.end_date!),
      originalAmount: row.original_amount!,
      originalCurrency: row.original_currency!,
      baseAmount: row.base_amount!,
      baseCurrency: row.base_currency!,
      exchangeRate: row.exchange_rate!,
      exchangeRateDate: nullable(row.exchange_rate_date!),
      payerMemberId: nullable(row.payer_member_id!),
      status: row.status as LegacyExtract["ledgerEntries"][number]["status"],
    })),
    ledgerEntryParticipants: input.tables.ledger_entry_participants.map((row) => ({
      ledgerEntryId: row.ledger_entry_id!,
      memberId: row.member_id!,
      splitMethod:
        row.split_method as LegacyExtract["ledgerEntryParticipants"][number]["splitMethod"],
      shareAmount: nullable(row.share_amount!),
      sharePercentage: nullable(row.share_percentage!),
      computedShareBaseAmount: nullable(row.computed_share_base_amount!),
    })),
    journeyExchangeRates: input.tables.journey_exchange_rates.map((row) => ({
      journeyId: row.journey_id!,
      baseCurrency: row.base_currency!,
      quoteCurrency: row.quote_currency!,
      rateToBase: row.rate_to_base!,
      rateDate: row.rate_date!,
    })),
    ledgerSettlements: input.tables.ledger_settlements.map((row) => ({
      id: row.id!,
      journeyId: row.journey_id!,
      fromMemberId: row.from_member_id!,
      toMemberId: row.to_member_id!,
      amount: row.amount!,
      currency: row.currency!,
      status: row.status as LegacyExtract["ledgerSettlements"][number]["status"],
      createdAt: new Date(row.created_at!).toISOString(),
    })),
    redactionPresenceCounts: input.redactionPresenceCounts,
  };
}

function assertSourceScope(source: SourceSet, journeyId: string) {
  if (source.trips.length !== 1 || source.trips[0]?.id !== journeyId)
    throw new Error("STAGE9_SOURCE_SCOPE_INVALID");
  if (
    source.journeyMembers.some((row) => row.tripId !== journeyId) ||
    source.journeyLedgers.some((row) => row.journeyId !== journeyId) ||
    source.ledgerEntries.some((row) => row.journeyId !== journeyId) ||
    source.journeyExchangeRates.some((row) => row.journeyId !== journeyId) ||
    source.ledgerSettlements.some((row) => row.journeyId !== journeyId)
  )
    throw new Error("STAGE9_SOURCE_SCOPE_INVALID");
  const entryIds = new Set(source.ledgerEntries.map((row) => row.id));
  const participantIds = new Set<string>();
  let previous = "";
  for (const row of source.ledgerEntryParticipants) {
    const current = `${row.ledgerEntryId}\u001f${row.memberId}`;
    if (
      !entryIds.has(row.ledgerEntryId) ||
      participantIds.has(current) ||
      current <= previous
    )
      throw new Error("STAGE9_SOURCE_SCOPE_INVALID");
    participantIds.add(current);
    previous = current;
  }
}

async function preflightJourney(context: RequestContext, journeyId: string) {
  const parameters = new URLSearchParams({
    select: "id",
    order: "id.asc",
    limit: "2",
    id: `eq.${journeyId}`,
  });
  const result = await getCsv(context, "trips", parameters);
  if (result.total !== 1 || result.rows.length !== 1 || result.rows[0]?.id !== journeyId)
    throw new Error("STAGE9_JOURNEY_NOT_EXACTLY_ONE_VISIBLE");
}

async function scanSourceSet(context: RequestContext, journeyId: string) {
  const tables: Record<SourceTable, CsvRecord[]> = {
    trips: [],
    journey_members: [],
    journey_ledgers: [],
    ledger_entries: [],
    ledger_entry_participants: [],
    journey_exchange_rates: [],
    ledger_settlements: [],
  };
  tables.trips = await scanTable(context, "trips", eqScope("id", journeyId));
  tables.journey_members = await scanTable(
    context,
    "journey_members",
    eqScope("trip_id", journeyId),
  );
  tables.journey_ledgers = await scanTable(
    context,
    "journey_ledgers",
    eqScope("journey_id", journeyId),
  );
  tables.ledger_entries = await scanTable(
    context,
    "ledger_entries",
    eqScope("journey_id", journeyId),
  );
  const entryIds = tables.ledger_entries.map((row) => row.id!).sort();
  for (let index = 0; index < entryIds.length; index += PARTICIPANT_PARENT_CHUNK_SIZE) {
    tables.ledger_entry_participants.push(
      ...(await scanTable(
        context,
        "ledger_entry_participants",
        participantScope(entryIds.slice(index, index + PARTICIPANT_PARENT_CHUNK_SIZE)),
      )),
    );
  }
  tables.journey_exchange_rates = await scanTable(
    context,
    "journey_exchange_rates",
    eqScope("journey_id", journeyId),
  );
  tables.ledger_settlements = await scanTable(
    context,
    "ledger_settlements",
    eqScope("journey_id", journeyId),
  );
  const redactionPresenceCounts: Record<string, number> = {};
  for (const table of tableNames) {
    if (table === "ledger_entry_participants") continue;
    for (const column of STAGE9_SOURCE_ALLOWLIST[table].presenceOnly) {
      redactionPresenceCounts[`${table}.${column}`] = await presenceCount(
        context,
        table,
        column,
        eqScope(specs[table].scopeColumn, journeyId),
      );
    }
  }
  const source = toSourceSet({ tables, redactionPresenceCounts });
  assertSourceScope(source, journeyId);
  return source;
}

function sourceSetSummary(source: SourceSet) {
  const rows: Record<SourceTable, unknown[]> = {
    trips: source.trips,
    journey_members: source.journeyMembers,
    journey_ledgers: source.journeyLedgers,
    ledger_entries: source.ledgerEntries,
    ledger_entry_participants: source.ledgerEntryParticipants,
    journey_exchange_rates: source.journeyExchangeRates,
    ledger_settlements: source.ledgerSettlements,
  };
  const identityKeys: Record<SourceTable, (row: Record<string, unknown>) => string> = {
    trips: (row) => String(row.id),
    journey_members: (row) => String(row.id),
    journey_ledgers: (row) => String(row.journeyId),
    ledger_entries: (row) => String(row.id),
    ledger_entry_participants: (row) => `${row.ledgerEntryId}\u001f${row.memberId}`,
    journey_exchange_rates: (row) => `${row.baseCurrency}\u001f${row.quoteCurrency}`,
    ledger_settlements: (row) => String(row.id),
  };
  const tables = Object.fromEntries(
    tableNames.map((table) => {
      const tableRows = rows[table] as Record<string, unknown>[];
      return [
        table,
        {
          rowCount: tableRows.length,
          identitySha256: sha256(tableRows.map(identityKeys[table]).join("\n")),
          contentSha256: sha256(JSON.stringify(tableRows)),
        } satisfies TableSummary,
      ];
    }),
  ) as Record<SourceTable, TableSummary>;
  return {
    tables,
    presenceCountsSha256: sha256(JSON.stringify(source.redactionPresenceCounts)),
    sourceSetSha256: sha256(JSON.stringify(source)),
  };
}

function ensurePrivateRoot(path: string) {
  const root = resolve(path);
  if (!outsideRepository(root, projectRoot) || !outsideRepository(root, legacyRoot))
    throw new Error("STAGE9_PRIVATE_ROOT_FORBIDDEN");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  const canonical = realpathSync(root);
  const metadata = statSync(canonical);
  if (!metadata.isDirectory() || metadata.mode & 0o077)
    throw new Error("STAGE9_PRIVATE_ROOT_UNSAFE");
  return canonical;
}

function writeCandidate(path: string, value: string) {
  writeFileSync(path, value, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

function syncFileAndReadOnly(path: string) {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  chmodSync(path, 0o400);
}

function syncDirectory(path: string) {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export async function extractStage9Authenticated(input: {
  sourceUrl: string;
  projectRef: string;
  journeyId: string;
  publishableKey: string;
  accessTokenPath: string;
  privateRoot: string;
  estimatedTwoPassSeconds: number;
  nowMs?: number;
}) {
  validateStage9SourceAllowlist();
  const origin = validateStage9RestOrigin(input.sourceUrl, input.projectRef);
  if (!uuidPattern.test(input.journeyId)) throw new Error("STAGE9_JOURNEY_ID_INVALID");
  validatePublishableKey(input.publishableKey);
  const privateRoot = ensurePrivateRoot(input.privateRoot);
  const token = readAndConsumeToken(input.accessTokenPath, privateRoot);
  validateStage9AccessToken({
    token,
    sourceOrigin: origin,
    estimatedTwoPassSeconds: input.estimatedTwoPassSeconds,
    nowMs: input.nowMs,
  });
  const context = {
    origin,
    projectRef: input.projectRef,
    publishableKey: input.publishableKey,
    token,
  };
  const runRoot = join(
    privateRoot,
    `run-${new Date(input.nowMs ?? Date.now()).toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`,
  );
  const candidateRoot = join(runRoot, `.candidate-${randomUUID()}`);
  const rawRoot = join(runRoot, "raw");
  mkdirSync(candidateRoot, { recursive: true, mode: 0o700 });
  try {
    await preflightJourney(context, input.journeyId);
    const passA = await scanSourceSet(context, input.journeyId);
    const extractedAt = new Date(input.nowMs ?? Date.now()).toISOString();
    const raw = legacyExtractSchema.parse({
      sourceProjectRef: input.projectRef,
      sourceEnvironment: "Production",
      extractedAt,
      sourceJourneyId: input.journeyId,
      ...passA,
    });
    const rawPayload = `${JSON.stringify(raw)}\n`;
    const rawPath = join(candidateRoot, "legacy-extract.json");
    writeCandidate(rawPath, rawPayload);
    const summaryA = sourceSetSummary(passA);
    const passB = await scanSourceSet(context, input.journeyId);
    const summaryB = sourceSetSummary(passB);
    if (JSON.stringify(summaryA) !== JSON.stringify(summaryB))
      throw new Error("STAGE9_SOURCE_CHANGED_DURING_EXTRACTION");
    const rawSha256 = sha256(rawPayload);
    if (sha256(readFileSync(rawPath, "utf8")) !== rawSha256)
      throw new Error("STAGE9_CANDIDATE_DIGEST_MISMATCH");
    syncFileAndReadOnly(rawPath);
    const digestPath = join(candidateRoot, "legacy-extract.sha256");
    writeCandidate(digestPath, `${rawSha256}\n`);
    syncFileAndReadOnly(digestPath);
    const receipt = {
      receiptVersion: "stage9-raw-commit-v1",
      state: "COMMITTED",
      committedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
      rawSha256,
      sourceSetSha256: summaryA.sourceSetSha256,
      presenceCountsSha256: summaryA.presenceCountsSha256,
      tables: summaryA.tables,
    } as const;
    const receiptPath = join(candidateRoot, "stage9-raw-commit.json");
    writeCandidate(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    syncFileAndReadOnly(receiptPath);
    chmodSync(candidateRoot, 0o500);
    syncDirectory(candidateRoot);
    renameSync(candidateRoot, rawRoot);
    syncDirectory(runRoot);
    return { rawRoot, rawPath: join(rawRoot, "legacy-extract.json"), receipt };
  } catch (error) {
    if (existsSync(candidateRoot)) {
      chmodSync(candidateRoot, 0o700);
      rmSync(candidateRoot, { recursive: true, force: true });
    }
    if (existsSync(rawRoot)) {
      chmodSync(rawRoot, 0o700);
      rmSync(rawRoot, { recursive: true, force: true });
    }
    throw error;
  }
}

export async function resolveStage9AuthenticatedMember(input: {
  sourceUrl: string;
  projectRef: string;
  journeyId: string;
  publishableKey: string;
  accessTokenPath: string;
  privateRoot: string;
  estimatedOperationSeconds: number;
  nowMs?: number;
}) {
  validateStage9SourceAllowlist();
  const origin = validateStage9RestOrigin(input.sourceUrl, input.projectRef);
  if (!uuidPattern.test(input.journeyId)) throw new Error("STAGE9_JOURNEY_ID_INVALID");
  validatePublishableKey(input.publishableKey);
  const privateRoot = ensurePrivateRoot(input.privateRoot);
  const token = readAndConsumeToken(input.accessTokenPath, privateRoot);
  const { subject } = validateStage9AccessToken({
    token,
    sourceOrigin: origin,
    estimatedTwoPassSeconds: input.estimatedOperationSeconds,
    nowMs: input.nowMs,
  });
  const url = new URL("/rest/v1/journey_members", origin);
  url.search = new URLSearchParams({
    select: "id",
    limit: "2",
    trip_id: `eq.${input.journeyId}`,
    user_id: `eq.${subject}`,
  }).toString();
  const init: RequestInit = {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: "text/csv",
      Prefer: "count=exact",
      apikey: input.publishableKey,
      Authorization: `Bearer ${token}`,
    },
  };
  assertStage9MappingLookupRequest({
    url,
    init,
    projectRef: input.projectRef,
    journeyId: input.journeyId,
    subject,
  });
  const response = await globalThis.fetch(url, init);
  if (response.status >= 300 && response.status < 400)
    throw new Error("STAGE9_REDIRECT_FORBIDDEN");
  if (!response.ok)
    throw new Error(`STAGE9_MAPPING_REST_REQUEST_FAILED:${response.status}`);
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/csv"))
    throw new Error("STAGE9_RESPONSE_MEDIA_TYPE_INVALID");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_PAGE_BYTES) throw new Error("STAGE9_PAGE_TOO_LARGE");
  const total = contentRangeTotal(response.headers.get("content-range"));
  const rows = parseStage9Csv(text, ["id"], total === 0);
  if (total !== 1 || rows.length !== 1 || !uuidPattern.test(rows[0]?.id ?? ""))
    throw new Error("STAGE9_MAPPING_MEMBER_NOT_EXACTLY_ONE");
  return rows[0]!.id!;
}

async function main() {
  const result = await extractStage9Authenticated({
    sourceUrl: required(
      process.env.OTR_STAGE9_SOURCE_SUPABASE_URL,
      "OTR_STAGE9_SOURCE_SUPABASE_URL",
    ),
    projectRef: required(
      process.env.OTR_STAGE9_SOURCE_PROJECT_REF,
      "OTR_STAGE9_SOURCE_PROJECT_REF",
    ),
    journeyId: required(
      process.env.OTR_STAGE9_SOURCE_JOURNEY_ID,
      "OTR_STAGE9_SOURCE_JOURNEY_ID",
    ),
    publishableKey: required(
      process.env.OTR_STAGE9_SOURCE_PUBLISHABLE_KEY,
      "OTR_STAGE9_SOURCE_PUBLISHABLE_KEY",
    ),
    accessTokenPath: required(
      process.env.OTR_STAGE9_SOURCE_ACCESS_TOKEN_FILE,
      "OTR_STAGE9_SOURCE_ACCESS_TOKEN_FILE",
    ),
    privateRoot: required(process.env.OTR_STAGE9_PRIVATE_ROOT, "OTR_STAGE9_PRIVATE_ROOT"),
    estimatedTwoPassSeconds: Number(
      required(
        process.env.OTR_STAGE9_ESTIMATED_TWO_PASS_SECONDS,
        "OTR_STAGE9_ESTIMATED_TWO_PASS_SECONDS",
      ),
    ),
  });
  console.info(
    JSON.stringify({
      state: result.receipt.state,
      rowCounts: Object.fromEntries(
        Object.entries(result.receipt.tables).map(([table, summary]) => [
          table,
          summary.rowCount,
        ]),
      ),
      sourceSetSha256: result.receipt.sourceSetSha256,
      rawSha256: result.receipt.rawSha256,
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "STAGE9_EXTRACTION_FAILED");
    process.exitCode = 1;
  });
}

export { PAGE_SIZE, TOKEN_SAFETY_MARGIN_SECONDS };

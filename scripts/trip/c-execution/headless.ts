/** Fixed QA operator composition. Import/default CLI never performs network or writes. */
import { lstatSync, chmodSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  createAuthRepository,
  type SecureSessionStorage,
} from "../../../src/data/auth/authSessionRepository";
import { createAccountSwitchCoordinator } from "../../../src/data/auth/accountSwitchCoordinator";
import { adoptLegacyAccountState } from "../../../src/data/auth/accountLocalState";
import {
  captureAccountRequestContext,
  captureAccountScope,
  assertAccountRequestContext,
} from "../../../src/data/auth/accountRequestContext";
import { createTripRepository } from "../../../src/data/repositories/tripRepository";
import { createTripCoreV2Repository } from "../../../src/data/repositories/tripCoreV2Repository";
import { tripCoreSha256Hex } from "../../../src/data/repositories/tripCoreSha256";
import { createSyncOperationRepository } from "../../../src/data/sync/syncOperationRepository";
import {
  createTripCreateSyncCoordinator,
  createTripCreateSyncWorker,
} from "../../../src/data/sync/tripCreateSyncWorker";
import {
  createTripMetadataSyncCoordinator,
  createTripMetadataSyncWorker,
} from "../../../src/data/sync/tripMetadataSyncWorker";
import { createTripCreateTransport } from "../../../src/data/sync/tripCreateTransport";
import { createTripMetadataTransport } from "../../../src/data/sync/tripMetadataTransport";
import { createAuthenticatedApiClient } from "../../../src/data/api/authenticatedClient";
import { ledgerBootstrapResponseSchema } from "../../../src/data/api/ledgerReadContracts";
import { createLedgerReadRepository } from "../../../src/data/repositories/ledgerReadRepository";
import type { JourneyCurrencyPreview } from "../../../src/data/api/ledgerCurrencyContracts";
import { createLedgerCurrencyCommands } from "../../../src/data/repositories/ledgerCurrencyRepository";
import { serializeDatabaseTransactions } from "../../../src/data/db/databaseConnection";
import { runMigrations } from "../../../src/data/db/migrationRunner";
import { canonicalCoreJson, type Json } from "../../../src/domain/trip/tripCoreV2Json";
import { tripMetadataV2UpdateSchema } from "../../../src/domain/trip/tripMetadataV2Contract";
import type { LocalSession } from "../../../src/domain/auth/localSession";
import payloads from "./proposed-payloads.json";

export const QA = Object.freeze({
  tripId: "f9d7adff-42fa-5f49-8bea-5d692d2fc1d7",
  createOperationId: "97a101f9-9aed-54bc-8dc2-46f52ed4e7d1",
  metadataOperationId: "ed351197-e39a-5379-84af-89137ca3b0f3",
  currencyOperationId: "4da771da-d687-5b9d-81e6-1071bfc43eab",
});
const emails = {
  A: "otr-meta-qa-20261022-01-a@example.invalid",
  B: "otr-meta-qa-20261022-01-b@example.invalid",
} as const;
export type Label = keyof typeof emails;
export type RunnerWindow = {
  startsAt: string;
  expiresAt: string;
  actorIds: Record<Label, string>;
  mode: "DEV" | "ISOLATED_PROTOCOL_FIXTURE";
};
export const bodyHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const same = (a: unknown, b: unknown) =>
  canonicalCoreJson(a as Json) === canonicalCoreJson(b as Json);
export class CRequestBudget {
  readonly #used = {
    signIns: 0,
    identityReads: 0,
    profileInitializations: 0,
    reads: 0,
    mutations: 0,
    create: 0,
    metadata: 0,
    preview: 0,
    commit: 0,
  };
  readonly #window: RunnerWindow;
  readonly #currencyOnly: boolean;
  get window() {
    return this.#window;
  }
  get counts() {
    return Object.freeze({ ...this.#used });
  }
  constructor(
    window: RunnerWindow,
    readonly now = () => Date.now(),
    previousReadCharges = 0,
    continuation?: "APPROVED_CURRENCY_ONLY_20",
  ) {
    this.#currencyOnly = continuation === "APPROVED_CURRENCY_ONLY_20";
    if (
      !Number.isInteger(previousReadCharges) ||
      previousReadCharges < 0 ||
      previousReadCharges > 16
    )
      throw Error("C_INVALID_PRIOR_READ_CHARGES");
    this.#used.reads = previousReadCharges;
    if (this.#currencyOnly) {
      if (previousReadCharges !== 15) throw Error("C_CURRENCY_PRIOR_CHARGES_REQUIRED");
      this.#used.mutations = 2;
      this.#used.create = 1;
      this.#used.metadata = 1;
    }
    this.#window = Object.freeze({
      ...window,
      actorIds: Object.freeze({ ...window.actorIds }),
    });
    z.iso.datetime({ offset: true }).parse(window.startsAt);
    z.iso.datetime({ offset: true }).parse(window.expiresAt);
    const start = Date.parse(window.startsAt),
      end = Date.parse(window.expiresAt);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end - start > 900000
    )
      throw Error("C_WINDOW_INVALID");
    for (const id of Object.values(window.actorIds)) z.uuid().parse(id);
    if (window.actorIds.A === window.actorIds.B)
      throw Error("C_ACTORS_DISTINCT_REQUIRED");
  }
  assertOpen() {
    if (
      this.now() < Date.parse(this.window.startsAt) ||
      this.now() >= Date.parse(this.window.expiresAt)
    )
      throw Error("C_WINDOW_CLOSED");
  }
  reserve(kind: keyof CRequestBudget["counts"]) {
    this.assertOpen();
    const limits = {
      signIns: 2,
      identityReads: 2,
      profileInitializations: 2,
      reads: this.#currencyOnly ? 20 : 16,
      mutations: 8,
      create: 1,
      metadata: 4,
      preview: 1,
      commit: 2,
    };
    if (this.#used[kind] >= limits[kind]) throw Error("C_BUDGET_EXHAUSTED");
    this.#used[kind]++;
  }
  reserveMutation(kind: "create" | "metadata" | "preview" | "commit") {
    this.assertOpen();
    if (this.#currencyOnly && (kind === "create" || kind === "metadata"))
      throw Error("C_CURRENCY_ONLY_NO_CREATE_EDIT");
    const limits = { create: 1, metadata: 4, preview: 1, commit: 2 };
    if (this.#used[kind] >= limits[kind] || this.#used.mutations >= 8)
      throw Error("C_BUDGET_EXHAUSTED");
    this.#used[kind]++;
    this.#used.mutations++;
  }
}
export function assertExactUndispatchedCreateResume(
  path: string,
  accountId: string,
  receiptOnlyFailure = false,
) {
  path = assertPrivateQaDatabasePath(path, false);
  const sql = new DatabaseSync(path, { readOnly: true });
  try {
    const operations = sql.prepare("SELECT * FROM sync_operations").all();
    const trips = sql.prepare("SELECT * FROM local_trip_containers").all();
    const operation = operations[0],
      trip = trips[0];
    const { operationId: _operationId, ...request } = payloads.create.body;
    if (
      operations.length !== 1 ||
      trips.length !== 1 ||
      !operation ||
      !trip ||
      operation.id !== QA.createOperationId ||
      operation.operation_type !== "CREATE_TRIP" ||
      operation.entity_type !== "TRIP" ||
      operation.entity_id !== QA.tripId ||
      operation.idempotency_key !== QA.createOperationId ||
      operation.base_version !== null ||
      operation.owner_user_id !== accountId ||
      operation.trip_id !== QA.tripId ||
      (receiptOnlyFailure
        ? operation.status !== "RETRYABLE" ||
          operation.attempt_count !== 2 ||
          operation.last_error_code !== "TRIP_CREATE_UNAVAILABLE"
        : !["PENDING", "DEPENDENCY_BLOCKED"].includes(String(operation.status)) ||
          operation.attempt_count !== 0) ||
      !same(JSON.parse(String(operation.payload_json)), request) ||
      trip.account_id !== accountId ||
      trip.id !== QA.tripId ||
      trip.create_operation_id !== QA.createOperationId ||
      trip.accepted_at !== null ||
      trip.owner_person_id !== null ||
      trip.name !== request.name ||
      trip.destination !== request.destination ||
      trip.start_date !== request.startDate ||
      trip.end_date !== request.endDate
    )
      throw Error("C_QA_RESUME_SCOPE_OR_DISPATCH_DRIFT");
  } finally {
    sql.close();
  }
}
export function assertAcceptedQaCurrencyResume(path: string, accountId: string) {
  path = assertPrivateQaDatabasePath(path, false);
  const sql = new DatabaseSync(path, { readOnly: true });
  try {
    const operations = sql.prepare("SELECT * FROM sync_operations").all();
    const trip = sql
      .prepare("SELECT * FROM local_trip_containers WHERE id=? AND account_id=?")
      .get(QA.tripId, accountId);
    const ledger = sql
      .prepare("SELECT * FROM ledger_journeys WHERE journey_id=?")
      .get(QA.tripId);
    if (
      operations.length !== 2 ||
      ![QA.createOperationId, QA.metadataOperationId].every((id) =>
        operations.some(
          (row) =>
            row.id === id &&
            row.status === "COMPLETED" &&
            row.owner_user_id === accountId &&
            row.trip_id === QA.tripId,
        ),
      ) ||
      !trip ||
      !trip.accepted_at ||
      !trip.owner_person_id ||
      trip.name !== payloads.editProposal.body.after.name ||
      trip.destination !== payloads.editProposal.body.after.destination ||
      trip.start_date !== payloads.editProposal.body.after.startDate ||
      trip.end_date !== payloads.editProposal.body.after.endDate ||
      !ledger ||
      ledger.settlement_currency !== "NZD"
    )
      throw Error("C_ACCEPTED_CREATE_EDIT_NZD_REQUIRED");
    const { operationId: _operationId, ...createRequest } = payloads.create.body;
    for (const row of operations) {
      const create = row.id === QA.createOperationId;
      if (
        row.entity_type !== "TRIP" ||
        row.entity_id !== QA.tripId ||
        row.idempotency_key !== row.id ||
        row.operation_type !== (create ? "CREATE_TRIP" : "UPDATE_TRIP_METADATA") ||
        !same(
          JSON.parse(String(row.payload_json)),
          create ? createRequest : payloads.editProposal.body,
        )
      )
        throw Error("C_CURRENCY_ORIGINAL_REQUEST_DRIFT");
    }
  } finally {
    sql.close();
  }
}
function assertPrivateQaDatabasePath(path: string, allowCreate: boolean) {
  // Only an operator-owned, dedicated private QA directory. Never an App DB or symlink.
  path = resolve(path);
  const dir = dirname(path);
  if (basename(path) !== "qa-state.sqlite" || !basename(dir).startsWith("otr-c-qa-"))
    throw Error("C_PRIVATE_QA_DATABASE_REQUIRED");
  if (allowCreate) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = lstatSync(dir);
  if (
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o777) !== 0o700 ||
    realpathSync(dir) !== dir
  )
    throw Error("C_PRIVATE_QA_DATABASE_REQUIRED");
  try {
    const file = lstatSync(path);
    if (!file.isFile() || file.isSymbolicLink() || file.uid !== process.getuid?.())
      throw Error("C_DB_INVALID");
  } catch (e) {
    if (!allowCreate || (e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return path;
}
export async function openQaDatabase(path: string) {
  path = assertPrivateQaDatabasePath(path, true);
  const sql = new DatabaseSync(path);
  const database = serializeDatabaseTransactions({
    async execAsync(text: string) {
      sql.exec(text);
    },
    async getFirstAsync<T>(text: string, ...args: unknown[]) {
      return (sql.prepare(text).get(...(args as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(text: string, ...args: unknown[]) {
      return sql.prepare(text).all(...(args as never[])) as T[];
    },
    async runAsync(text: string, ...args: unknown[]) {
      return sql.prepare(text).run(...(args as never[])) as never;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  });
  chmodSync(path, 0o600);
  await runMigrations(database);
  return { sql, database, close: () => sql.close() };
}
export async function createAuthenticatedHeadlessRunner(input: {
  window: RunnerWindow;
  databasePath: string;
  publishableKey: string;
  authOrigin: string;
  backendOrigin: string;
  previousReadCharges?: number;
  currencyOnlyContinuation?: "APPROVED_CURRENCY_ONLY_20";
  fetchImplementation?: typeof fetch;
  now?: () => number;
}) {
  const currencyOnly = input.currencyOnlyContinuation === "APPROVED_CURRENCY_ONLY_20";
  const budget = new CRequestBudget(
      input.window,
      input.now,
      input.previousReadCharges,
      input.currencyOnlyContinuation,
    ),
    now = input.now ?? (() => Date.now());
  const window = budget.window;
  const databasePath = resolve(input.databasePath);
  const authOrigin = new URL(input.authOrigin).origin,
    backendOrigin = new URL(input.backendOrigin).origin;
  if (window.mode === "DEV") {
    if (
      authOrigin !== "https://tuqigdxrvrerfewsxqgm.supabase.co" ||
      backendOrigin !== "https://api-dev.xoery.art"
    )
      throw Error("C_TARGET_FORBIDDEN");
  } else if (
    ![authOrigin, backendOrigin].every((v) => new URL(v).hostname === "127.0.0.1")
  )
    throw Error("C_FIXTURE_LOOPBACK_REQUIRED");
  const wire = input.fetchImplementation ?? fetch;
  const authAttempts = new Set<string>();
  const authFetch: typeof fetch = async (url, options) => {
    const req = new Request(url, options),
      u = new URL(req.url);
    if (u.origin !== authOrigin) throw Error("C_AUTH_TARGET_FORBIDDEN");
    if (
      u.pathname === "/auth/v1/token" &&
      u.search === "?grant_type=password" &&
      req.method === "POST"
    ) {
      const body = await req.clone().json();
      if (!Object.values(emails).includes(body.email) || authAttempts.has(body.email))
        throw Error("C_AUTH_RETRY_FORBIDDEN");
      authAttempts.add(body.email);
      budget.reserve("signIns");
    } else if (u.pathname === "/auth/v1/user" && req.method === "GET" && !u.search)
      budget.reserve("identityReads");
    else if (u.pathname === "/rest/v1/profiles") {
      const authorization = req.headers.get("Authorization");
      if (!authorization?.startsWith("Bearer ")) throw Error("C_PROFILE_AUTH_REQUIRED");
      if (
        req.method === "GET" &&
        u.searchParams.get("select") === "id,account_role" &&
        Object.values(window.actorIds).some(
          (id) => u.searchParams.get("id") === `eq.${id}`,
        ) &&
        [...u.searchParams.keys()].every((k) => ["select", "id"].includes(k))
      )
        budget.reserve("reads");
      else if (req.method === "POST" && !u.search) {
        if (currencyOnly) throw Error("C_EXISTING_PROFILE_REQUIRED");
        const body = await req.clone().json();
        if (
          !Object.values(window.actorIds).includes(body.id) ||
          body.account_role !== "free_user" ||
          !Object.keys(body).every((k) =>
            ["id", "account_role", "display_name"].includes(k),
          ) ||
          !["A", "B"].some(
            (label) =>
              body.display_name === `DEV-METADATA-QA-20261022-01-${label}` &&
              body.id === window.actorIds[label as Label],
          ) ||
          req.headers.get("Prefer")?.includes("resolution=")
        )
          throw Error("C_PROFILE_SCOPE_FORBIDDEN");
        budget.reserve("profileInitializations");
      } else throw Error("C_PROFILE_REQUEST_FORBIDDEN");
    } else throw Error("C_AUTH_REQUEST_FORBIDDEN");
    return wire(req);
  };
  const auth = createClient(authOrigin, input.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: authFetch },
  });
  const memory = new Map<string, string>();
  const storage: SecureSessionStorage = {
    getItem: async (k) => memory.get(k) ?? null,
    setItem: async (k, v) => {
      memory.set(k, v);
    },
    deleteItem: async (k) => {
      memory.delete(k);
    },
  };
  const sessions = createAuthRepository(storage);
  const verified = new Map<Label, LocalSession>();
  let active: Label | undefined,
    closed = false,
    online = true;
  let db = await openQaDatabase(databasePath);
  const account = async () => {
    budget.assertOpen();
    if (closed || !active) throw Error("C_ACCOUNT_UNAVAILABLE");
    const s = await sessions.readAdoptedLocalSession();
    if (
      s?.identity?.userId !== window.actorIds[active] ||
      s.accessToken !== verified.get(active)?.accessToken
    )
      throw Error("C_ACCOUNT_NOT_VERIFIED");
    return s.identity.userId;
  };
  const switcher = createAccountSwitchCoordinator({
    pauseSync: async () => {},
    restartSync: async () => {},
    readSession: sessions.readLocalSession,
    writeSession: sessions.writeLocalSession,
    clearSession: sessions.clearLocalSession,
    selectAccount: sessions.selectAccount,
    adoptLocalState: async (id) => {
      await adoptLegacyAccountState(db.database, id);
    },
    clearInMemoryState: async () => {},
    bootstrapAccount: async () => {},
  });
  const tokenProvider = async (request?: {
    forceRefresh?: boolean;
    rejectedToken?: string;
  }) => {
    if (request?.forceRefresh || request?.rejectedToken)
      throw Error("C_AUTH_REVALIDATION_REQUIRES_NEW_GATE");
    const id = await account();
    const s = verified.get(active!)!;
    if (!s.accessToken || Date.parse(s.expiresAt!) <= now())
      throw Error("C_AUTH_EXPIRED");
    return { token: s.accessToken, userId: id };
  };
  const requestFetch: typeof fetch = async (url, options) => {
    const req = new Request(url, options),
      u = new URL(req.url);
    budget.assertOpen();
    if (!online) throw Error("C_OFFLINE");
    if (u.origin !== backendOrigin || u.search) throw Error("C_BACKEND_TARGET_FORBIDDEN");
    const createReceipt = `/v2/trip-create-operations/${QA.createOperationId}`,
      metaReceipt = `/v2/trip-metadata-operations/${QA.metadataOperationId}`,
      meta = `/v2/trips/${QA.tripId}/metadata`,
      currency = `/v2/trips/${QA.tripId}/ledger/journey-currency/`;
    if (
      currencyOnly &&
      ![
        currency + "preview",
        currency + "commit",
        `/v2/trips/${QA.tripId}/ledger/bootstrap`,
      ].includes(u.pathname)
    )
      throw Error("C_CURRENCY_ONLY_ROUTE_REQUIRED");
    if (
      req.method === "GET" &&
      [
        createReceipt,
        metaReceipt,
        meta,
        `/v2/trips/${QA.tripId}/ledger/bootstrap`,
      ].includes(u.pathname)
    )
      budget.reserve("reads");
    else if (req.method === "POST") {
      const value = await req.clone().json();
      let kind: "create" | "metadata" | "preview" | "commit";
      if (
        u.pathname === "/v2/trips" &&
        same(value, payloads.create.body) &&
        req.headers.get("Idempotency-Key") === QA.createOperationId
      )
        kind = "create";
      else if (
        u.pathname === meta &&
        value.operationId === QA.metadataOperationId &&
        value.tripId === QA.tripId &&
        req.headers.get("Idempotency-Key") === QA.metadataOperationId &&
        req.headers.get("OTR-Trip-Metadata-Version") === "2"
      )
        kind = "metadata";
      else if (
        u.pathname === currency + "preview" &&
        same(value, payloads.currencyPreview.body)
      )
        kind = "preview";
      else if (
        u.pathname === currency + "commit" &&
        req.headers.get("Idempotency-Key") === QA.currencyOperationId &&
        value.proposedCurrency === "USD"
      )
        kind = "commit";
      else throw Error("C_MUTATION_SCOPE_FORBIDDEN");
      // Reserve the category and total BEFORE dispatch; a thrown/denied/unknown response consumes both.
      budget.reserveMutation(kind);
    } else throw Error("C_REQUEST_FORBIDDEN");
    return wire(req);
  };
  const options = { baseUrl: backendOrigin, fetchImplementation: requestFetch };
  let receiptOnlyRecovery = false;
  const observed: { create?: unknown; metadata?: unknown } = {};
  const rawCreate = createTripCreateTransport(account, options, tokenProvider);
  const rawMetadata = createTripMetadataTransport(account, options, tokenProvider);
  const createTransport = {
    async create(...args: Parameters<typeof rawCreate.create>) {
      if (receiptOnlyRecovery)
        throw Error("C_UNKNOWN_OUTCOME_RECEIPT_REQUIRED_NO_REPOST");
      const r = await rawCreate.create(...args);
      observed.create = r;
      return r;
    },
    async receipt(...args: Parameters<typeof rawCreate.receipt>) {
      const r = await rawCreate.receipt(...args);
      if (r) observed.create = r;
      return r;
    },
  };
  const metadataTransport = {
    ...rawMetadata,
    async update(...args: Parameters<typeof rawMetadata.update>) {
      if (receiptOnlyRecovery)
        throw Error("C_UNKNOWN_OUTCOME_RECEIPT_REQUIRED_NO_REPOST");
      const r = await rawMetadata.update(...args);
      observed.metadata = r;
      return r;
    },
    async receipt(...args: Parameters<typeof rawMetadata.receipt>) {
      const r = await rawMetadata.receipt(...args);
      if (r) observed.metadata = r;
      return r;
    },
  };
  function repository() {
    const core = createTripCoreV2Repository(db.database, account, tripCoreSha256Hex);
    return createTripRepository(
      db.database,
      account,
      core,
      () => new Date(now()).toISOString(),
      async (id) =>
        (await sessions.readAdoptedLocalSession())?.identity?.displayName ?? id,
    );
  }
  let preview: JourneyCurrencyPreview | undefined;
  const currency = async () => {
    const scope = await captureAccountRequestContext(QA.tripId, account);
    return createLedgerCurrencyCommands(
      async () => createAuthenticatedApiClient(options, tokenProvider, scope),
      async () => {
        const response = await createAuthenticatedApiClient(
          options,
          tokenProvider,
          scope,
        ).get(`/v2/trips/${QA.tripId}/ledger/bootstrap`, ledgerBootstrapResponseSchema);
        await assertAccountRequestContext(scope, account);
        await createLedgerReadRepository(db.database, account).applyBootstrap(
          response,
          scope,
        );
      },
    );
  };
  const target = (op: string) => ({
    accountId: window.actorIds.A,
    tripId: QA.tripId,
    operationId: op,
  });
  return {
    budget,
    receipts() {
      return JSON.parse(JSON.stringify(observed)) as {
        create?: import("../../../src/domain/trip/tripCreateContract").TripCreateResult;
        metadata?: import("../../../src/domain/trip/tripMetadataV2Contract").TripMetadataWireReceipt;
      };
    },
    async login(
      label: Label,
      password: string,
      adminReceipt: { id: string; email: string },
    ) {
      budget.assertOpen();
      if (currencyOnly && label !== "A") throw Error("C_CURRENCY_ONLY_ACTOR_A");
      if (
        verified.has(label) ||
        adminReceipt.id !== window.actorIds[label] ||
        adminReceipt.email !== emails[label]
      )
        throw Error("C_ADMIN_IDENTITY_MISMATCH");
      const signed = await auth.auth.signInWithPassword({
        email: emails[label],
        password,
      });
      if (signed.error || !signed.data.session || signed.data.user.id !== adminReceipt.id)
        throw Error("C_NORMAL_LOGIN_FAILED");
      const proof = await auth.auth.getUser(signed.data.session.access_token);
      if (
        proof.error ||
        proof.data.user.id !== adminReceipt.id ||
        proof.data.user.email !== adminReceipt.email
      )
        throw Error("C_SERVER_IDENTITY_MISMATCH");
      const session: LocalSession = {
        accessToken: signed.data.session.access_token,
        refreshToken: null,
        expiresAt: new Date((signed.data.session.expires_at ?? 0) * 1000).toISOString(),
        identity: {
          userId: proof.data.user.id,
          email: proof.data.user.email!,
          displayName: `DEV-METADATA-QA-20261022-01-${label}`,
        },
      };
      if (Date.parse(session.expiresAt!) <= Date.parse(window.expiresAt))
        throw Error("C_SESSION_WINDOW_INSUFFICIENT");
      budget.assertOpen();
      // Existing authenticated self-profile INSERT policy only; no admin upsert or invitation RPC.
      const { data: profile, error: readError } = await auth
        .from("profiles")
        .select("id,account_role")
        .eq("id", adminReceipt.id)
        .maybeSingle();
      if (
        readError ||
        (profile &&
          (profile.id !== adminReceipt.id || profile.account_role !== "free_user"))
      )
        throw Error("C_SELF_PROFILE_UNAVAILABLE");
      if (!profile) {
        const { error } = await auth.from("profiles").insert({
          id: adminReceipt.id,
          display_name: session.identity!.displayName,
          account_role: "free_user",
        });
        if (error) throw Error("C_SELF_PROFILE_INITIALIZATION_FAILED");
      }
      budget.assertOpen();
      verified.set(label, session);
      await switcher.activateSession(session);
      active = label;
      await account();
      return { label, id: proof.data.user.id, serverVerified: true };
    },
    async select(label: Label) {
      if (!verified.has(label)) throw Error("C_ACCOUNT_NOT_VERIFIED");
      await switcher.switchAccount(window.actorIds[label]);
      active = label;
      await account();
    },
    setOnline(value: boolean) {
      online = value;
    },
    async reopen() {
      await account();
      db.close();
      db = await openQaDatabase(databasePath);
      await account();
    },
    async saveCreate() {
      if (active !== "A") throw Error("C_ACTOR_A_REQUIRED");
      return repository().createTrip(payloads.create.body);
    },
    async dispatchCreate() {
      return createTripCreateSyncCoordinator(
        createSyncOperationRepository(db.database, account),
        createTripCreateSyncWorker(repository(), createTransport, account),
        repository(),
        () => !closed && online,
        target(QA.createOperationId),
      ).run(online ? "AUTHENTICATED_ONLINE" : "AUTHENTICATED_OFFLINE");
    },
    async saveEdit() {
      if (active !== "A") throw Error("C_ACTOR_A_REQUIRED");
      const scope = await captureAccountScope(account);
      const snapshot = await metadataTransport.snapshot(
        scope,
        QA.tripId,
        QA.metadataOperationId,
      );
      if (
        snapshot.metadataRevision !== 0 ||
        !same(snapshot.metadata, payloads.editProposal.body.before)
      )
        throw Error("C_BASELINE_DRIFT_NO_REBASE");
      const request = tripMetadataV2UpdateSchema.parse({
        ...payloads.editProposal.body,
        before: snapshot.metadata,
        expectedMetadataRevision: snapshot.metadataRevision,
      });
      await repository().updateMetadata(request);
      return request;
    },
    async dispatchEdit() {
      return createTripMetadataSyncCoordinator(
        createSyncOperationRepository(db.database, account),
        createTripMetadataSyncWorker(repository(), metadataTransport, account),
        repository(),
        () => !closed && online,
        target(QA.metadataOperationId),
      ).run(online ? "AUTHENTICATED_ONLINE" : "AUTHENTICATED_OFFLINE");
    },
    async replayEdit() {
      const scope = await captureAccountScope(account);
      return metadataTransport.update(
        scope,
        tripMetadataV2UpdateSchema.parse(payloads.editProposal.body),
      );
    },
    async collisionEdit() {
      const scope = await captureAccountScope(account);
      return metadataTransport.update(
        scope,
        tripMetadataV2UpdateSchema.parse({
          ...payloads.editProposal.body,
          after: { ...payloads.editProposal.body.after, name: "FORBIDDEN-COLLISION" },
        }),
      );
    },
    async originalCreateReceipt() {
      return createTransport.receipt(
        await captureAccountScope(account),
        QA.createOperationId,
      );
    },
    async previewCurrency() {
      if (active !== "A") throw Error("C_ACTOR_A_REQUIRED");
      const value = await (await currency()).preview(QA.tripId, "USD");
      const counts = Object.entries(value).filter(
        ([k]) => k.endsWith("Count") || k === "affectedExpenses",
      );
      if (
        value.currentCurrency !== "NZD" ||
        value.proposedCurrency !== "USD" ||
        counts.some(([, v]) => v !== 0) ||
        value.requiresAbandonPreview ||
        !/^[a-f0-9]{64}$/.test(value.previewDigest)
      )
        throw Error("C_UNEXPECTED_CURRENCY_DEMAND");
      preview = Object.freeze({ ...value });
      return { ...value };
    },
    async commitCurrency() {
      if (active !== "A" || !preview) throw Error("C_LEGITIMATE_PREVIEW_REQUIRED");
      return (await currency()).commit(QA.tripId, preview, QA.currencyOperationId);
    },
    localState() {
      return {
        trip: db.sql
          .prepare("SELECT * FROM local_trip_containers WHERE id = ? AND account_id = ?")
          .get(QA.tripId, window.actorIds[active!]),
        ledger: db.sql
          .prepare("SELECT * FROM ledger_journeys WHERE journey_id = ?")
          .get(QA.tripId),
      };
    },
    async recoverQueuedReceipt(kind: "create" | "metadata") {
      if (active !== "A") throw Error("C_ACTOR_A_REQUIRED");
      const operationId =
        kind === "create" ? QA.createOperationId : QA.metadataOperationId;
      const row = db.sql
        .prepare(
          "SELECT status,next_attempt_at FROM sync_operations WHERE id=? AND owner_user_id=?",
        )
        .get(operationId, window.actorIds.A);
      if (row?.status === "COMPLETED") return;
      if (row?.status !== "RETRYABLE" || typeof row.next_attempt_at !== "string")
        throw Error("C_UNKNOWN_OUTCOME_NOT_RECOVERABLE");
      const wait = Date.parse(row.next_attempt_at) - now();
      if (
        !Number.isFinite(wait) ||
        wait > 46000 ||
        now() + Math.max(0, wait) + 10000 >= Date.parse(window.expiresAt)
      )
        throw Error("C_RECOVERY_WINDOW_INSUFFICIENT");
      if (wait > 0) await new Promise((r) => setTimeout(r, wait + 20));
      await account();
      receiptOnlyRecovery = true;
      try {
        const repo = repository(),
          queue = createSyncOperationRepository(db.database, account);
        if (kind === "create")
          await createTripCreateSyncCoordinator(
            queue,
            createTripCreateSyncWorker(repo, createTransport, account),
            repo,
            () => online && !closed,
            target(operationId),
          ).run("AUTHENTICATED_ONLINE");
        else
          await createTripMetadataSyncCoordinator(
            queue,
            createTripMetadataSyncWorker(repo, metadataTransport, account),
            repo,
            () => online && !closed,
            target(operationId),
          ).run("AUTHENTICATED_ONLINE");
      } finally {
        receiptOnlyRecovery = false;
      }
    },
    queueState() {
      return db.sql
        .prepare(
          "SELECT id,status,payload_json FROM sync_operations WHERE id IN (?,?) ORDER BY id",
        )
        .all(QA.createOperationId, QA.metadataOperationId);
    },
    async close() {
      if (!closed) {
        closed = true;
        memory.clear();
        verified.clear();
        db.close();
      }
    },
  };
}

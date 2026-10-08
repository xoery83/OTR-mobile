import { createRequestBoundary, RequestBoundaryError } from "@/data/api/requestBoundary";
import { z } from "zod";
import type * as SQLite from "expo-sqlite";
import {
  tripImportCatalogSchemas,
  tripImportSnapshotSchema,
  type TripImportCatalogName,
} from "@/data/api/tripImportCatalogContracts";
import {
  parsePublicationMembership,
  sealPublicationMembership,
} from "@/data/api/tripPublicationMembershipContracts";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { flightRunInputDigest } from "@/data/interpretation/flightInterpretation";
import {
  canonicalEventJson,
  parseEventJson,
  type Json,
} from "@/domain/trip/eventIntentJson";
import { flightInputSchema, type ImportHash } from "@/domain/trip/flightImportReview";
import type {
  ImportAdmissionDatabase,
  createTripImportAdmissionRepository,
} from "./tripImportAdmissionRepository";
import { importCatalogKeys, validateImportSnapshot } from "./tripImportCatalogRecovery";
import { createCaptureSourceBindingTransactionStore } from "./captureSourceAdmissionRepository";

type Catalog = z.infer<typeof tripImportSnapshotSchema> & {
  [K in TripImportCatalogName]: z.infer<(typeof tripImportCatalogSchemas)[K]>[];
};
type Row = Record<string, unknown>;
export type PublicationMembershipDatabase = ImportAdmissionDatabase &
  Pick<SQLite.SQLiteDatabase, "isInTransactionAsync">;
type ImportStore = ReturnType<
  typeof createTripImportAdmissionRepository
>["transactionStore"];
const json = (value: unknown) => canonicalEventJson(value as Json);
function fail(code = "PUBLICATION_MEMBERSHIP_INTEGRITY"): never {
  throw new Error(code);
}
function catalog(raw: string): Catalog {
  if (typeof raw !== "string") fail();
  return tripImportSnapshotSchema.parse(parseEventJson(raw, 4194304)) as Catalog;
}
async function project(snapshot: Catalog, runId: string, hash: ImportHash) {
  await validateImportSnapshot(
    snapshot.actor_account_id,
    snapshot.trip_id,
    snapshot,
    hash,
  );
  const run = snapshot.trip_source_runs.find((r) => r.id === runId);
  if (!run || run.state !== "READY" || run.retention_state !== "RETAINED")
    fail("PUBLICATION_MEMBERSHIP_UNAVAILABLE");
  const inputs = snapshot.trip_source_inputs
    .filter((i) => i.run_id === runId)
    .map((i) =>
      flightInputSchema.parse(
        Object.fromEntries(
          Object.keys(flightInputSchema.shape).map((k) => [k, i[k as keyof typeof i]]),
        ),
      ),
    );
  if (inputs.length === 0 || inputs.length > 64) fail();
  const roots: Record<string, string[]> = {};
  for (const input of inputs) {
    if (!run.scope_source_ids.includes(input.source_id)) fail();
    const source = snapshot.trip_sources.find((s) => s.id === input.source_id);
    const manifest = snapshot.trip_source_revisions.find(
      (r) =>
        r.source_id === input.source_id &&
        r.material_revision === input.material_revision,
    );
    const selected = snapshot.trip_source_representations.find(
      (r) => r.id === input.representation_id,
    );
    if (
      !source ||
      !manifest ||
      !selected ||
      manifest.retention_state !== "RETAINED" ||
      selected.payload_sha256 !== input.payload_sha256 ||
      selected.byte_count !== input.byte_count
    )
      fail("INPUT_STALE");
    const visited = new Set<string>(),
      originals = new Set<string>();
    function ancestry(id: string, path: Set<string>) {
      if (path.has(id)) fail();
      if (visited.has(id)) return;
      visited.add(id);
      if (visited.size > 64) fail("PUBLICATION_MEMBERSHIP_RESOURCE_LIMIT");
      const r = snapshot.trip_source_representations.find((r) => r.id === id);
      if (
        !r ||
        r.source_id !== input.source_id ||
        r.retention_state !== "RETAINED" ||
        r.introduced_revision > input.material_revision ||
        (r.material_kind === "BINARY" && r.remote_state !== "VERIFIED")
      )
        fail("INPUT_STALE");
      if (r.role === "ORIGINAL") {
        if (r.parent_ids.length || !manifest!.original_representation_ids.includes(id))
          fail();
        originals.add(id);
      } else {
        if (r.parent_ids.length === 0) fail();
        for (const parent of r.parent_ids) ancestry(parent, new Set([...path, id]));
      }
    }
    ancestry(input.representation_id, new Set());
    roots[input.id] = [...originals].sort();
  }
  if (
    (await flightRunInputDigest(
      inputs.map((pin) => ({ pin })),
      snapshot.trip_source_representations,
      hash,
    )) !== run.input_sha256
  )
    fail("PUBLICATION_MEMBERSHIP_INPUT_DIGEST");
  const candidates = snapshot.trip_source_candidates.filter((p) => p.run_id === runId);
  if (candidates.some((p) => p.retention_state !== "RETAINED" || p.proposal === null))
    fail("PUBLICATION_MEMBERSHIP_UNAVAILABLE");
  const {
    id,
    actor_account_id,
    trip_id,
    operation_key,
    scope_source_ids,
    scope_sha256,
    generation,
    input_sha256,
    extractor_key,
    extractor_version,
    extractor_options_sha256,
  } = run;
  const membership = await sealPublicationMembership(
    {
      version: 1,
      run_id: id,
      actor_account_id,
      trip_id,
      operation_key,
      scope_source_ids,
      scope_sha256,
      generation,
      input_sha256,
      extractor_key,
      extractor_version,
      extractor_options_sha256,
      candidates: candidates
        .map(
          ({ id, candidate_key, candidate_kind, proposal_version, proposal_sha256 }) => ({
            id,
            candidate_key,
            candidate_kind,
            proposal_version,
            proposal_sha256,
          }),
        )
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    },
    hash,
  );
  return { membership, roots };
}

export type ClosedPublicationRead = Readonly<{ memberships: readonly string[] }>;
const admittedReads = new WeakMap<
  ClosedPublicationRead,
  { raw: string; context: AccountRequestContext; signal?: AbortSignal }
>();

// Inject only the existing dedicated Track C private read gateway. No default
// credentials/transport or publisher is installed; ordinary caller rows cannot mint a handle.
export function createClosedPublicationMembershipReader(deps: {
  mode: "CLOSED";
  rpc:
    | ((
        routine: "trip_source_read_import_catalogs",
        parameters: { actor: string; trip: string },
      ) => Promise<string>)
    | null;
  getAccountId(): Promise<string>;
  sha256: ImportHash;
}) {
  if (deps.mode !== "CLOSED") fail("PUBLICATION_MEMBERSHIP_CLOSED");
  return {
    async read(
      context: AccountRequestContext,
      signal?: AbortSignal,
    ): Promise<ClosedPublicationRead> {
      const boundary = signal
        ? createRequestBoundary(30000, signal, () =>
            assertAccountRequestGeneration(context),
          )
        : null;
      const operation = async () => {
        const requestSignal = boundary?.signal ?? signal;
        const assertNotCanceled = () => {
          if (requestSignal?.aborted) fail("PUBLICATION_MEMBERSHIP_CANCELED");
        };
        assertNotCanceled();
        context = Object.freeze({ ...context });
        await assertAccountRequestContext(context, deps.getAccountId);
        if (!deps.rpc) fail("PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE");
        const raw = await deps.rpc("trip_source_read_import_catalogs", {
          actor: context.accountId,
          trip: context.tripId,
        });
        assertNotCanceled();
        const snapshot = catalog(raw);
        if (
          snapshot.actor_account_id !== context.accountId ||
          snapshot.trip_id !== context.tripId
        )
          fail();
        const memberships: string[] = [];
        for (const run of snapshot.trip_source_runs) {
          if (run.state === "READY" && run.retention_state === "RETAINED")
            memberships.push((await project(snapshot, run.id, deps.sha256)).membership);
        }
        // Validate even an empty/FAILED-only projection; neither means complete semantic success.
        await validateImportSnapshot(
          context.accountId,
          context.tripId,
          snapshot,
          deps.sha256,
        );
        await assertAccountRequestContext(context, deps.getAccountId);
        assertNotCanceled();
        const handle = Object.freeze({ memberships: Object.freeze(memberships.sort()) });
        admittedReads.set(handle, {
          raw: json(snapshot),
          context,
          signal,
        });
        return handle;
      };
      try {
        return boundary ? await boundary.run(operation) : await operation();
      } catch (error) {
        if (error instanceof RequestBoundaryError)
          fail(
            error.code === "REQUEST_TIMEOUT"
              ? "PUBLICATION_MEMBERSHIP_TIMEOUT"
              : "PUBLICATION_MEMBERSHIP_CANCELED",
          );
        throw error;
      } finally {
        boundary?.close();
      }
    },
  };
}

const jsonColumns = new Set([
  "scope_source_ids",
  "original_representation_ids",
  "parent_ids",
  "proposal",
  "reviewed_payload",
  "support_payload",
]);
const booleanColumns = new Set(["historical_selection", "create_claim_active"]);
const sourceScope =
  "SELECT id FROM trip_sources WHERE cache_account_id=? AND trip_id=? AND acquired_by=?";
const runScope =
  "SELECT id FROM trip_source_runs WHERE cache_account_id=? AND trip_id=? AND actor_account_id=?";
const confirmationScope =
  "SELECT id FROM trip_source_confirmations WHERE cache_account_id=? AND trip_id=? AND actor_account_id=?";
const candidateScope = `SELECT id FROM trip_source_candidates WHERE cache_account_id=? AND run_id IN (${runScope})`;
const slotScope = `SELECT slot_id FROM trip_source_output_slots WHERE cache_account_id=? AND confirmation_id IN (${confirmationScope})`;
const scopes: Record<TripImportCatalogName, string> = {
  trip_sources: "trip_id=? AND acquired_by=?",
  trip_source_runs: "trip_id=? AND actor_account_id=?",
  trip_source_confirmations: "trip_id=? AND actor_account_id=?",
  trip_source_revisions: `source_id IN (${sourceScope})`,
  trip_source_representations: `source_id IN (${sourceScope})`,
  trip_source_associations: `source_id IN (${sourceScope})`,
  trip_source_inputs: `run_id IN (${runScope}) OR confirmation_id IN (${confirmationScope})`,
  trip_source_candidates: `run_id IN (${runScope})`,
  trip_source_output_slots: `confirmation_id IN (${confirmationScope})`,
  trip_source_run_predecessors: `child_run_id IN (${runScope})`,
  trip_source_candidate_lineage: `child_candidate_id IN (${candidateScope})`,
  trip_source_slot_lineage_dispositions: `slot_id IN (${slotScope})`,
  trip_source_slot_dependencies: `slot_id IN (${slotScope})`,
};

export function createPublicationMembershipTransactionStore(
  database: PublicationMembershipDatabase,
  importStore: ImportStore,
  getAccountId: () => Promise<string>,
  hash: ImportHash,
) {
  if (importStore.database !== database) fail("PUBLICATION_MEMBERSHIP_DATABASE_MISMATCH");
  async function admitted(context: AccountRequestContext) {
    if (!(await database.isInTransactionAsync()))
      fail("PUBLICATION_MEMBERSHIP_TRANSACTION_REQUIRED");
    await assertAccountRequestContext(context, getAccountId);
    if (
      !(await database.getFirstAsync(
        "SELECT 1 FROM ledger_actor_context WHERE user_id=? AND journey_id=?",
        context.accountId,
        context.tripId,
      ))
    )
      fail("IMPORT_TRIP_ACCESS");
    const columns = await database.getAllAsync<{ name: string }>(
      "PRAGMA table_info(trip_source_runs)",
    );
    if (!columns.some((c) => c.name === "publication_membership"))
      fail("PUBLICATION_MEMBERSHIP_SCHEMA_UNAVAILABLE");
  }
  async function currentCatalog(context: AccountRequestContext, runId: string) {
    const result: Record<string, unknown> = {
      version: 1,
      trip_id: context.tripId,
      actor_account_id: context.accountId,
    };
    for (const table of Object.keys(importCatalogKeys) as TripImportCatalogName[]) {
      const where = scopes[table];
      // Parameters follow the fixed scope templates, never caller SQL.
      const args: string[] = [context.accountId];
      if (
        table === "trip_sources" ||
        table === "trip_source_runs" ||
        table === "trip_source_confirmations"
      )
        args.push(context.tripId, context.accountId);
      else {
        if (where.includes(candidateScope) || where.includes(slotScope))
          args.push(context.accountId);
        args.push(context.accountId, context.tripId, context.accountId);
        if (table === "trip_source_inputs")
          args.push(context.accountId, context.tripId, context.accountId);
      }
      const rows = await database.getAllAsync<Row>(
        `SELECT * FROM ${table} WHERE cache_account_id=? AND (${where}) LIMIT 65`,
        ...args,
      );
      if (rows.length > 64) fail("PUBLICATION_MEMBERSHIP_RESOURCE_LIMIT");
      rows.sort((a, b) => {
        const left = json(importCatalogKeys[table].map((key) => a[key]));
        const right = json(importCatalogKeys[table].map((key) => b[key]));
        return left < right ? -1 : left > right ? 1 : 0;
      });
      for (const r of rows) {
        if (
          (table !== "trip_source_candidates" || r.run_id === runId) &&
          r.registration_state !== "REGISTERED"
        )
          fail("PUBLICATION_MEMBERSHIP_UNREGISTERED");
      }
      result[table] = rows.map((row) =>
        Object.fromEntries(
          Object.keys(tripImportCatalogSchemas[table].shape).map((key) => {
            const value = row[key];
            if (booleanColumns.has(key)) {
              if (value !== 0 && value !== 1) fail();
              return [key, value === 1];
            }
            return [
              key,
              jsonColumns.has(key) && value !== null
                ? parseEventJson(z.string().parse(value), 262144)
                : value,
            ];
          }),
        ),
      );
    }
    return catalog(json(result));
  }
  async function readRetained(context: AccountRequestContext, runId: string) {
    await admitted(context);
    tripImportCatalogSchemas.trip_source_runs.shape.id.parse(runId);
    const row = await database.getFirstAsync<{ publication_membership: string | null }>(
      "SELECT publication_membership FROM trip_source_runs WHERE cache_account_id=? AND trip_id=? AND actor_account_id=? AND id=?",
      context.accountId,
      context.tripId,
      context.accountId,
      runId,
    );
    if (!row?.publication_membership) fail("PUBLICATION_MEMBERSHIP_UNAVAILABLE");
    const membership = await parsePublicationMembership(row.publication_membership, hash);
    const snapshot = await currentCatalog(context, runId);
    const projected = await project(snapshot, runId, hash);
    if (projected.membership !== row.publication_membership) fail();
    await assertAccountRequestContext(context, getAccountId);
    return {
      membership,
      roots: projected.roots,
      readSet: json({ membership, snapshot, roots: projected.roots }),
      snapshot,
    };
  }
  async function read(context: AccountRequestContext, runId: string) {
    const { snapshot, ...retained } = await readRetained(context, runId);
    for (const pin of snapshot.trip_source_inputs.filter((i) => i.run_id === runId))
      await importStore.assertInput(
        context,
        flightInputSchema.parse(
          Object.fromEntries(
            Object.keys(flightInputSchema.shape).map((k) => [
              k,
              pin[k as keyof typeof pin],
            ]),
          ),
        ),
      );
    await assertAccountRequestContext(context, getAccountId);
    return retained;
  }
  return {
    // The caller owns one serialized transaction and Account apply gate for all methods.
    read,
    async assertCurrent(
      context: AccountRequestContext,
      runId: string,
      expectedReadSet: string,
    ) {
      const value = await read(context, runId);
      if (value.readSet !== expectedReadSet) fail("PUBLICATION_MEMBERSHIP_STALE");
      return value;
    },
    async install(context: AccountRequestContext, handle: ClosedPublicationRead) {
      await admitted(context);
      const retained = admittedReads.get(handle);
      if (!retained || json(retained.context) !== json(context))
        fail("PUBLICATION_MEMBERSHIP_UNTRUSTED_HANDOFF");
      if (retained.signal?.aborted) fail("PUBLICATION_MEMBERSHIP_CANCELED");
      await assertAccountRequestContext(retained.context, getAccountId);
      await importStore.applyCatalogs(context, retained.raw);
      for (const raw of handle.memberships) {
        const membership = await parsePublicationMembership(raw, hash);
        const { run_id } = membership.body;
        const row = await database.getFirstAsync<{
          publication_membership: string | null;
        }>(
          "SELECT publication_membership FROM trip_source_runs WHERE cache_account_id=? AND id=?",
          context.accountId,
          run_id,
        );
        if (!row) fail();
        if (row.publication_membership !== null && row.publication_membership !== raw)
          fail();
        if (row.publication_membership === null) {
          const written = await database.runAsync(
            "UPDATE trip_source_runs SET publication_membership=? WHERE cache_account_id=? AND id=? AND publication_membership IS NULL",
            raw,
            context.accountId,
            run_id,
          );
          if (written.changes !== 1) fail();
        }
        await readRetained(context, run_id);
      }
      await assertAccountRequestContext(context, getAccountId);
      if (retained.signal?.aborted) fail("PUBLICATION_MEMBERSHIP_CANCELED");
    },
    async readCaptureSupport(
      context: AccountRequestContext,
      runId: string,
      inputId: string,
      bindingId: string,
    ) {
      const publication = await read(context, runId);
      const input = await database.getFirstAsync<{
        source_id: string;
        material_revision: number;
      }>(
        "SELECT source_id,material_revision FROM trip_source_inputs WHERE cache_account_id=? AND run_id=? AND id=?",
        context.accountId,
        runId,
        inputId,
      );
      if (!input || !publication.roots[inputId]) fail("CAPTURE_SOURCE_STALE");
      if (publication.roots[inputId].length !== 1)
        fail("CAPTURE_SOURCE_AMBIGUOUS_ORIGINAL");
      const captureReadSet = await createCaptureSourceBindingTransactionStore(
        database,
        getAccountId,
        hash,
      ).assertCurrent(context, bindingId, {
        sourceId: input.source_id,
        materialRevision: input.material_revision,
        originalIds: publication.roots[inputId],
      });
      return { publication, captureReadSet };
    },
  };
}

export function createDormantPublicationMembershipRepository(
  database: PublicationMembershipDatabase,
  importStore: ImportStore,
  getAccountId: () => Promise<string>,
  hash: ImportHash,
) {
  const store = createPublicationMembershipTransactionStore(
    database,
    importStore,
    getAccountId,
    hash,
  );
  async function scoped<T>(
    context: AccountRequestContext,
    work: () => Promise<T>,
    signal?: AbortSignal,
  ) {
    return withAccountApplyGate(async () => {
      let result!: T;
      await database.withTransactionAsync(async () => {
        await assertAccountRequestContext(context, getAccountId);
        result = await work();
        await assertAccountRequestContext(context, getAccountId);
        if (signal?.aborted) fail("PUBLICATION_MEMBERSHIP_CANCELED");
      });
      assertAccountRequestGeneration(context);
      return result;
    });
  }
  return {
    transactionStore: store,
    read: (context: AccountRequestContext, runId: string) =>
      scoped(context, () => store.read(context, runId)),
    install: (context: AccountRequestContext, handle: ClosedPublicationRead) =>
      scoped(
        context,
        () => store.install(context, handle),
        admittedReads.get(handle)?.signal,
      ),
  };
}

// Isolated synthetic runtime acceptance. Never imported by a deployed server.
import assert from "node:assert/strict";
import { registeredUniversalModelProfile } from "../universalModelProfile";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs/promises";
import { join } from "node:path";
import { migrations } from "../../../src/data/db/migrations";
import {
  createIntelligenceContinuationRepository,
  type ContinuationDatabase,
} from "../../../src/data/repositories/intelligenceContinuationRepository";
import { captureAccountRequestContext } from "../../../src/data/auth/accountRequestContext";
import { attemptSchema, taskSchema } from "../../../src/domain/intelligence/persistence";
import { canonicalEventJson, type Json } from "../../../src/domain/trip/eventIntentJson";
import { createFlightPrivateCustody } from "../flightPrivateCustody";
import { createUniversalContinuationHost } from "../universalContinuationHost";
import {
  createUniversalPort,
  prepareUniversalDispatch,
  UNIVERSAL_IMPORT_VERSION,
  type UniversalManifest,
} from "../universalImport";
import { bootstrapUniversalTask } from "../universalTaskBootstrap";
import { intelligenceWakeIdentity } from "../../../src/data/sync/syncOperationRepository";
import { createTripImportAdmissionRepository } from "../../../src/data/repositories/tripImportAdmissionRepository";
import { createLedgerReadRepository } from "../../../src/data/repositories/ledgerReadRepository";
import { ledgerBootstrapResponseSchema } from "../../../src/data/api/ledgerReadContracts";
import { createDevBackendHandler, type DevBackendGateway } from "../app";

const sha = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
const jsonHash = (v: unknown) => sha(Buffer.from(canonicalEventJson(v as Json)));
export async function runUniversalContinuationFixture(
  base: string,
  sourceFixture?: {
    catalog: Record<string, unknown>;
    manifest: {
      accountId: string;
      tripId: string;
      batchId: string;
      taskId: string;
      runId: string;
      submissionSha256: string;
      representations: {
        sourceId: string;
        representationId: string;
        inputId: string;
        revision: number;
        sha256: string;
        mime: string;
        text: string;
        byteCount: number;
      }[];
    };
  },
) {
  assert.equal(process.platform, "linux", "Actual anchored custody requires Linux");
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  const directory = await fs.mkdtemp(join(base, "universal-"));
  const root = join(directory, "custody");
  await fs.mkdir(root, { mode: 0o700 });
  const st = await fs.stat(root, { bigint: true });
  const identity = {
    store_id: randomUUID(),
    device: String(st.dev),
    inode: String(st.ino),
  };
  await fs.writeFile(
    join(root, "store-identity.json"),
    JSON.stringify({ version: 1, store_id: identity.store_id }),
    { mode: 0o600 },
  );
  let stores = await createFlightPrivateCustody(root, identity);
  let sql = new DatabaseSync(join(directory, "continuations.db"));
  const checks: string[] = [];
  try {
    for (const m of migrations) sql.exec(m.sql);
    sql.exec("PRAGMA foreign_keys=ON");
    const account = sourceFixture?.manifest.accountId ?? randomUUID(),
      trip = sourceFixture?.manifest.tripId ?? randomUUID(),
      batch = sourceFixture?.manifest.batchId ?? randomUUID(),
      taskId = sourceFixture?.manifest.taskId ?? randomUUID(),
      run = sourceFixture?.manifest.runId ?? randomUUID(),
      now = new Date().toISOString();
    const representations = sourceFixture
      ? sourceFixture.manifest.representations.map((r) => ({
          ...r,
          accountId: account,
          tripId: trip,
          batchId: batch,
          originalSha256: r.sha256,
          bytes: Buffer.from(r.text),
        }))
      : ["Museum walk", "Grand Hotel"].map((text) => ({
          accountId: account,
          tripId: trip,
          batchId: batch,
          inputId: randomUUID(),
          sourceId: randomUUID(),
          representationId: randomUUID(),
          revision: 1,
          originalSha256: sha(Buffer.from(text)),
          mime: "text/plain",
          bytes: Buffer.from(text),
        }));
    const manifest: UniversalManifest = {
      accountId: account,
      tripId: trip,
      batchId: batch,
      representations,
    };
    const inputPins = representations.map((r) => ({
      kind: "SOURCE" as const,
      source_id: r.sourceId,
      material_revision: 1,
      representation_id: r.representationId,
      payload_sha256: r.originalSha256,
      byte_count: r.bytes.length,
      input_id: r.inputId,
      transform_sha256: null,
    }));
    if (!sourceFixture) {
      sql.exec("BEGIN");
      for (const r of representations) {
        sql
          .prepare(
            "INSERT INTO trip_sources(cache_account_id,id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,current_material_revision,row_revision) VALUES(?,?,?,?,?,?,'TEXT','PASTE','UNKNOWN',1,1)",
          )
          .run(account, r.sourceId, trip, account, r.sourceId, r.originalSha256);
        sql
          .prepare(
            "INSERT INTO trip_source_revisions(cache_account_id,source_id,material_revision,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) VALUES(?,?,1,?,?,?,?,'AS_SUPPLIED','ACQUISITION')",
          )
          .run(
            account,
            r.sourceId,
            account,
            r.sourceId,
            r.originalSha256,
            JSON.stringify([r.representationId]),
          );
        sql
          .prepare(
            "INSERT INTO trip_source_representations(cache_account_id,id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,regenerability,remote_state,local_state,local_verified_at,transfer_state) VALUES(?,?,1,?,1,'ORIGINAL','TEXT','UTF-8',?,?,?,'NOT_APPLICABLE','NOT_APPLICABLE','VERIFIED',?,'NOT_REQUIRED')",
          )
          .run(
            account,
            r.representationId,
            r.sourceId,
            r.originalSha256,
            r.bytes.length,
            r.bytes.toString(),
            now,
          );
      }
      sql
        .prepare(
          "INSERT INTO trip_source_runs(cache_account_id,id,row_revision,trip_id,actor_account_id,operation_key,scope_source_ids,scope_sha256,generation,input_sha256,extractor_key,extractor_version,extractor_options_sha256,state) VALUES(?,?,1,?,?,?,?,?,1,?,'synthetic-universal','1',?,'PENDING')",
        )
        .run(
          account,
          run,
          trip,
          account,
          run,
          JSON.stringify(representations.map((r) => r.sourceId)),
          jsonHash(inputPins),
          jsonHash(inputPins),
          jsonHash(inputPins),
        );
      for (const r of representations)
        sql
          .prepare(
            "INSERT INTO trip_source_inputs(cache_account_id,id,run_id,source_id,material_revision,representation_id,payload_sha256,byte_count,observed_source_row_revision) VALUES(?,?,?,?,1,?,?,?,1)",
          )
          .run(
            account,
            r.inputId,
            run,
            r.sourceId,
            r.representationId,
            r.originalSha256,
            r.bytes.length,
          );
      sql.exec("COMMIT");
    }
    const db: ContinuationDatabase = {
      async getFirstAsync<T>(q: string, ...p: unknown[]) {
        return (sql.prepare(q).get(...(p as never[])) ?? null) as T | null;
      },
      async getAllAsync<T>(q: string, ...p: unknown[]) {
        return sql.prepare(q).all(...(p as never[])) as T[];
      },
      async runAsync(q: string, ...p: unknown[]) {
        return sql.prepare(q).run(...(p as never[])) as never;
      },
      async withTransactionAsync(work) {
        sql.exec("BEGIN");
        try {
          await work();
          sql.exec("COMMIT");
        } catch (e) {
          sql.exec("ROLLBACK");
          throw e;
        }
      },
    };
    let authorized = true;
    const context = await captureAccountRequestContext(trip, async () => account);
    if (sourceFixture) {
      const ledger = ledgerBootstrapResponseSchema.parse({
        journey: {
          id: trip,
          title: "Synthetic catalog fixture",
          startDate: null,
          endDate: null,
          settlementCurrency: "NZD",
          settlementScale: 2,
          valuationPolicy: "REFERENCE_RATE",
          updatedAt: now,
        },
        members: [],
        households: [],
        expenses: [],
        corrections: [],
        rateQuotes: [],
        actor: {
          userId: account,
          memberId: null,
          role: "owner",
          capabilities: {
            canRead: true,
            canCreateExpense: false,
            canEditOwnExpense: false,
            canCorrectAnyExpense: false,
            canSuggestCorrection: false,
            canResolveOwnExpenseConflict: false,
          },
        },
        cursor: null,
        serverTime: now,
      });
      await createLedgerReadRepository(db, async () => account).applyBootstrap(
        ledger,
        context,
      );
      await createTripImportAdmissionRepository(
        db,
        async () => account,
        async (v) => sha(v),
        () => now,
        randomUUID,
      ).applyUniversalCatalogs(
        context,
        JSON.stringify({ ...sourceFixture.catalog, version: 2 }),
      );
      checks.push(
        "actual PostgreSQL owning PENDING catalog -> existing repository validated SQLite cache (no manual Source inserts)",
      );
    }
    let repo = createIntelligenceContinuationRepository(db, {
      getAccountId: async () => account,
      now: () => now,
      sha256: async (bytes) => sha(bytes),
      async validateAdmission() {
        assert(authorized, "CURRENT_SOURCE_RIGHT_REVOKED");
      },
      async validateAttemptAdmission() {},
      async eligibleWait() {
        return false;
      },
      async verifyRecovery() {
        throw Error("EXACT_RECOVERY_REQUIRED");
      },
    });
    const policy = {
      version: 1,
      privacy: "LOCAL_ONLY",
      network_required: false,
      region: "DEVICE",
      budget_currency: null,
      budget_nanos: null,
      route: "DETERMINISTIC",
      max_attempts: 1,
      deadline: null,
    };
    const task = taskSchema.parse({
      account_id: account,
      task_id: taskId,
      format_version: 1,
      import_id: batch,
      manifest_version: 1,
      manifest_sha256: sourceFixture?.manifest.submissionSha256 ?? jsonHash(inputPins),
      trip_id: trip,
      stage: "INTERPRETATION",
      logical_request_id: randomUUID(),
      logical_idempotency_key: randomUUID(),
      input_pins: inputPins,
      input_sha256: jsonHash(inputPins),
      consumer_id: "import",
      schema_id: "UNIVERSAL_IMPORT_V1",
      schema_dialect: "OTR_TYPED_V1",
      consumer_version: 1,
      schema_version: 1,
      schema_sha256: registeredUniversalModelProfile.output_schema_sha256,
      capability_requirements: ["EXTRACT"],
      policy_snapshot: policy,
      policy_sha256: jsonHash(policy),
      run_id: run,
      expected_run_generation: 1,
      candidate_id: null,
      expected_candidate_sha256: null,
      event_id: null,
      expected_event_revision: null,
      created_at: now,
      creation_clock: "SERVER_OBSERVED",
      row_revision: 1,
      publication_fence: 1,
      current_pass_complete: false,
      work_disposition: "PENDING",
      wait_reason: null,
      wait_reasons: [],
      sync_operation_id: null,
      dependencies: [],
      current_attempt_id: null,
      cancellation_disposition: "NONE",
      safe_reason: null,
      publication_id: null,
      publication_sha256: null,
      result_sha256: null,
      updated_at: now,
      update_clock: "SERVER_OBSERVED",
      completed_at: null,
    });
    let queue = sourceFixture
      ? await intelligenceWakeIdentity(
          {
            version: 1,
            account_id: account,
            task_id: taskId,
            expected_publication_fence: 1,
            wake_reason: "REEVALUATE",
          },
          async (v) => sha(v),
        )
      : randomUUID();
    let bound = task;
    if (!sourceFixture) {
      await repo.create(context, task);
      sql
        .prepare(
          "INSERT INTO sync_operations(id,owner_user_id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,status,created_at,updated_at) VALUES(?,?,?,'INTELLIGENCE_CONTINUATION',?,'CP14_CLOSED',?,'{}','PROCESSING',?,?)",
        )
        .run(queue, account, trip, taskId, randomUUID(), now, now);
      bound = await repo.bindQueue(context, taskId, 1, queue);
    }
    const request = { version: UNIVERSAL_IMPORT_VERSION, tripId: trip, taskId };
    const plan = prepareUniversalDispatch(account, batch, request, manifest);
    const bytes = Buffer.from(JSON.stringify(plan.dispatchMarker));
    const admission = { version: 1, policy_sha256: task.policy_sha256, allowed: true };
    const attempt = attemptSchema.parse({
      account_id: account,
      attempt_id: randomUUID(),
      task_id: taskId,
      attempt_sequence: 1,
      format_version: 1,
      request_id: randomUUID(),
      idempotency_key: randomUUID(),
      request_sha256: plan.requestSha256,
      request_material_reference: randomUUID(),
      request_material_sha256: sha(bytes),
      predecessor_attempt_id: null,
      predecessor_request_id: null,
      integration_id: null,
      provider_id: null,
      model_id: null,
      model_version: null,
      adapter_version: null,
      provider_config_id: null,
      config_version: null,
      configuration_sha256: null,
      descriptor_snapshot: {
        version: 1,
        provider_class: "DETERMINISTIC",
        replay_support: "UNSUPPORTED",
        capabilities: ["EXTRACT"],
        modalities: ["TEXT"],
        network_required: false,
      },
      policy_admission: admission,
      policy_admission_sha256: jsonHash(admission),
      task_publication_fence: bound.publication_fence,
      sync_operation_id: queue,
      usage_correlation_id: null,
      fallback_chain_id: randomUUID(),
      shadow: false,
      shadow_of_attempt_id: null,
      created_at: now,
      creation_clock: "SERVER_OBSERVED",
      row_revision: 1,
      execution_observation: "NOT_STARTED",
      execution_outcome: null,
      result_install_disposition: "NONE",
      metering_disposition: "NOT_REQUIRED",
      safe_failure_code: null,
      response_material_reference: null,
      response_material_sha256: null,
      response_sha256: null,
      publication_sha256: null,
      started_at: null,
      ended_at: null,
      latency_ms: null,
      reported_usage_summary: null,
      updated_at: now,
      update_clock: "SERVER_OBSERVED",
    });
    if (sourceFixture) {
      const ledger = ledgerBootstrapResponseSchema.parse({
        journey: {
          id: trip,
          title: "Synthetic catalog fixture",
          startDate: null,
          endDate: null,
          settlementCurrency: "NZD",
          settlementScale: 2,
          valuationPolicy: "REFERENCE_RATE",
          updatedAt: now,
        },
        members: [],
        households: [],
        expenses: [],
        corrections: [],
        rateQuotes: [],
        actor: {
          userId: account,
          memberId: null,
          role: "owner",
          capabilities: {
            canRead: true,
            canCreateExpense: false,
            canEditOwnExpense: false,
            canCorrectAnyExpense: false,
            canSuggestCorrection: false,
            canResolveOwnExpenseConflict: false,
          },
        },
        cursor: null,
        serverTime: now,
      });
      const boot = await bootstrapUniversalTask({
        db: db as never,
        task,
        attempt,
        catalog: JSON.stringify({ ...sourceFixture.catalog, version: 2 }),
        ledger,
        getAccountId: async () => account,
        assertCurrent() {
          assert(authorized, "CURRENT_SOURCE_RIGHT_REVOKED");
        },
      });
      repo = boot.repository;
      checks.push(
        "finite bootstrap reuses actual Task Repository + signalIntelligenceWake + claim (no manual Task/Queue rows)",
      );
    }
    const makeHost = () =>
      createUniversalContinuationHost({
        context,
        batchId: batch,
        taskId,
        repository: repo,
        custody: stores.custody,
        retained: stores.retained,
        requestMaterialByteCount: bytes.length,
        readSourceManifest: async () => manifest,
        attempt,
        async assertDurableStart() {},
        async assertCompletion(r) {
          assert.equal(r.providerOutcome, "LOCAL_FIXTURE");
        },
      });
    let dispatches = 0;
    const provider = {
      mode: "LOCAL_FIXTURE" as const,
      async interpret() {
        dispatches++;
        return {
          output: {
            v: 2,
            items: [
              {
                id: "i1",
                kind: "P1",
                subtype: "ACTIVITY",
                f: [[0, "activity.name", "Museum walk"]],
              },
              {
                id: "i2",
                kind: "P3",
                subtype: "ACCOMMODATION",
                f: [[sourceFixture ? 0 : 1, "property.name", "Grand Hotel"]],
              },
            ],
            bookings: [],
            tickets: [],
            links: [],
            issues: [],
          },
          providerReceipt: { outcome: "LOCAL_FIXTURE" as const, requestId: null },
        };
      },
    };
    const url = `http://local/v2/import-batches/${batch}/interpretations`;
    const gateway = {
      validateAccessToken: async (token: string) =>
        token === "synthetic" ? { id: account } : null,
      canReadTrip: async (a: string, t: string) => a === account && t === trip,
    } as unknown as DevBackendGateway;
    const handler = () =>
      createDevBackendHandler({
        gateway,
        universalImportPort: createUniversalPort(makeHost(), provider),
      });
    const post = () =>
      new Request(url, {
        method: "POST",
        headers: { Authorization: "Bearer synthetic", "Idempotency-Key": taskId },
        body: JSON.stringify(request),
      });
    const response = await handler()(post());
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, "CANDIDATES_READY");
    assert.deepEqual(
      result.candidates.map((c: { kind: string }) => c.kind),
      ["P1", "P3"],
    );
    assert.equal(
      (await repo.snapshot(context, taskId)).task.work_disposition,
      "PUBLISHED",
    );
    checks.push(
      "real SQLite continuation + anchored private custody + HTTP mixed-candidate publication",
    );
    await stores.close();
    sql.close();
    sql = new DatabaseSync(join(directory, "continuations.db"));
    sql.exec("PRAGMA foreign_keys=ON");
    stores = await createFlightPrivateCustody(root, identity);
    assert.equal((await handler()(post())).status, 200);
    assert.equal(dispatches, 1);
    checks.push(
      "cold SQLite/custody reopen replays exact result without Provider redispatch",
    );
    const get = () =>
      new Request(`${url}/${taskId}?tripId=${trip}`, {
        headers: { Authorization: "Bearer synthetic" },
      });
    assert.equal((await handler()(get())).status, 200);
    authorized = false;
    assert.equal((await handler()(get())).status, 503);
    checks.push("revoked current Source admission withholds retained result");
    assert.equal(
      (await handler()(new Request(url, { method: "POST", body: "{}" }))).status,
      401,
    );
    checks.push("HTTP authentication enforced");
    return {
      status: "LOCAL_CONTINUATION_CUSTODY_PASS",
      provider: "SYNTHETIC_LOCAL_FIXTURE",
      realProviderCalls: 0,
      checks,
    };
  } finally {
    sql.close();
    await stores.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

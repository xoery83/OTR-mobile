import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { session } from "./__fixtures__/tripCoreV2Sql";
import { createClosedPersistenceGateway } from "./externalIntegrationPersistence";
import { initializeUniversalTaskDatabase } from "./universalTaskBootstrap";
import { createUniversalV3Intake, universalV3IntakeBoundary } from "./universalV3Intake";
import { createUniversalV3Execution } from "./universalV3Execution";
import { universalProviderPgTransaction } from "./universalPg";
import { universalContinuousSelectionSchema } from "./universalRegisteredTaskDraft";
import { coreCapabilitiesSchema } from "../../src/domain/trip/tripCoreV2Commands";
import { localImportDocumentId } from "../../src/domain/trip/universalImportIdentity";
import { universalV3ExecutionStatus } from "../../src/data/api/universalV3Contracts";
import type { CaptureJobReadModel } from "../../src/domain/capture/captureSubmission";
import { planUniversalV3Review } from "../../src/data/operations/universalV3Review";
import { runMigrations } from "../../src/data/db/migrationRunner";
import { serializeDatabaseTransactions } from "../../src/data/db/databaseConnection";
import {
  createTripCoreV2Repository,
  type CoreDatabase,
} from "../../src/data/repositories/tripCoreV2Repository";
import {
  createCoreV2SyncCoordinator,
  createCoreV2SyncWorker,
} from "../../src/data/sync/tripCoreV2SyncWorker";
import { createSyncOperationRepository } from "../../src/data/sync/syncOperationRepository";
import { executeCoreCommandV2 } from "./tripCoreV2Commands";
import { createCorePgReader } from "./tripCoreV2PgRead";
import { createCorePgStorage, readCorePgOperation } from "./tripCoreV2PgStorage";
import type { Attempt } from "../../src/domain/intelligence/persistence";

vi.mock("react-native", () => ({ AppState: { currentState: "active" } }));

async function saveAndReopen(
  fixtureName: string,
  accountId: string,
  tripId: string,
  localPath: string,
  candidate: Extract<
    ReturnType<typeof universalV3ExecutionStatus.parse>,
    { state: "REVIEW_READY" }
  >["candidates"][number],
  files: readonly { length: number; sha256: string; mediaType: string }[],
) {
  const writer = session(fixtureName);
  const reader = session(fixtureName);
  let native = new DatabaseSync(localPath);
  const hash = async (bytes: Uint8Array) => sha(bytes);
  const account = async () => accountId;
  try {
    await writer.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
    await reader.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
    const connect = ({ lease }: typeof writer) => ({
      withLease: async <T>(work: (current: typeof lease) => Promise<T>) => work(lease),
    });
    const mode = { sustainedDev: true as const };
    const mutation = createCorePgStorage(connect(writer), hash, undefined, mode);
    const independent = createCorePgStorage(connect(reader), hash, undefined, mode);
    const collections = createCorePgReader(connect(reader), hash, undefined, mode);
    const transport = {
      capabilities: async () =>
        coreCapabilitiesSchema.parse(await collections.capabilities(accountId, tripId)),
      collection: () => collections.collection(accountId, tripId, undefined, true),
      receipt: (_context: unknown, operationId: string) =>
        readCorePgOperation(independent, accountId, tripId, operationId, hash),
      submit: (_context: unknown, command: unknown) =>
        executeCoreCommandV2(mutation, accountId, tripId, command, hash),
    };
    const openCore = (database: DatabaseSync) => {
      const conn = serializeDatabaseTransactions({
        async execAsync(query: string) {
          database.exec(query);
        },
        async getFirstAsync<T>(query: string, ...params: unknown[]) {
          return (database.prepare(query).get(...(params as never[])) ??
            null) as T | null;
        },
        async getAllAsync<T>(query: string, ...params: unknown[]) {
          return database.prepare(query).all(...(params as never[])) as T[];
        },
        async runAsync(query: string, ...params: unknown[]) {
          return database.prepare(query).run(...(params as never[])) as never;
        },
        async withTransactionAsync(work: () => Promise<void>) {
          database.exec("BEGIN");
          try {
            await work();
            database.exec("COMMIT");
          } catch (error) {
            database.exec("ROLLBACK");
            throw error;
          }
        },
      });
      return {
        conn,
        repository: createTripCoreV2Repository(
          conn satisfies CoreDatabase,
          account,
          hash,
        ),
      };
    };
    const { conn, repository } = openCore(native);
    await runMigrations(conn);
    const ctx = await repository.captureContext(tripId);
    await repository.refresh(ctx, transport);
    const snapshot = await repository.acceptedSnapshot(ctx);
    if (!snapshot) throw Error("FIXTURE_CORE_SNAPSHOT_MISSING");
    const model = {
      batch: { accountId, context: { tripPrior: { id: tripId } } },
      inputs: files.map((file) => ({
        kind: file.mediaType === "text/plain" ? "TEXT" : "DOCUMENT",
        state: "ACCEPTED",
        originalFilename: null,
        contentByteCount: file.length,
        contentSha256: file.sha256,
        declaredContentType: file.mediaType,
      })),
    } as unknown as CaptureJobReadModel;
    const plan = planUniversalV3Review({
      model,
      candidate,
      decision: { action: "NEW" },
      capabilities: await transport.capabilities(),
      snapshot,
    });
    expect(plan.commands.map(({ command }) => command)).toEqual([
      "CREATE_ITEM",
      "CREATE_DOCUMENT_METADATA",
      "CREATE_DOCUMENT_METADATA",
      "CREATE_DOCUMENT_METADATA",
      "RECONCILE_ITEM_DOCUMENTS",
    ]);
    const operations = await repository.enqueueConfirmedItemDocuments(ctx, plan.commands);
    const worker = createCoreV2SyncWorker(repository, transport, account, hash);
    for (const [index, operationId] of operations.entries()) {
      const queue = createSyncOperationRepository(conn, account, undefined, {
        accountId,
        tripId,
        operationId,
      });
      let dispatchError: unknown;
      await createCoreV2SyncCoordinator(
        queue,
        {
          async push(operation) {
            try {
              await worker.push(operation);
            } catch (error) {
              dispatchError = error;
              throw error;
            }
          },
        },
        repository,
        tripId,
        operationId,
      ).run("AUTHENTICATED_ONLINE");
      const receipt = await transport.receipt(ctx, operationId);
      const queueState = native
        .prepare("SELECT status, last_error_code FROM sync_operations WHERE id=?")
        .get(operationId);
      expect(
        receipt,
        JSON.stringify({
          command: plan.commands[index].command,
          queueState,
          dispatchError: String(dispatchError),
        }),
      ).toMatchObject({
        projection: "FULL",
        receipt: { operationId, outcome: "APPLIED" },
      });
    }
    await repository.refresh(ctx, transport);
    native.close();
    native = new DatabaseSync(localPath);
    const reopened = openCore(native).repository;
    const coldCtx = await reopened.captureContext(tripId);
    const restored = await reopened.acceptedSnapshot(coldCtx);
    expect(restored?.graph.itinerary_events).toEqual([
      expect.objectContaining({
        id: plan.targetId,
        title: "Rail museum",
        start_local_date: "2026-12-14",
      }),
    ]);
    expect(restored?.graph.trip_operational_documents).toHaveLength(3);
    expect(
      restored?.graph.trip_operational_documents.every(
        (row) => row.custody === "LOCAL_ONLY" && row.storage_object_key === null,
      ),
    ).toBe(true);
    expect(
      restored?.graph.trip_item_document_links.map((edge) => edge.document_id).sort(),
    ).toEqual([...candidate.documentIds].sort());
    expect(
      native.prepare("SELECT count(*) AS count FROM sync_operations").get()?.count,
    ).toBe(5);
  } finally {
    native.close();
    writer.close();
    reader.close();
  }
}

const fixture = process.env.OTR_V3_PROVIDER_FIXTURE;
const actor = process.env.OTR_V3_FIXTURE_ACTOR;
const trip = process.env.OTR_V3_FIXTURE_TRIP;
const integration = process.env.OTR_V3_FIXTURE_INTEGRATION;
const priceId = process.env.OTR_V3_FIXTURE_PRICE;
const priced = !!priceId;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

it.skipIf(!fixture || !actor || !trip || !integration)(
  priced
    ? "settles one priced multi-image V3 call with independent receipt, immutable price and hold"
    : "runs mixed V3 HTTP input through durable Wake, synthetic Provider, Core Save and SQLite reopen",
  async () => {
    if (!/^otr-trip-sustained-[a-f0-9]{12}$/.test(fixture!))
      throw Error("OWNED_FIXTURE_REQUIRED");
    const pg = session(fixture!);
    const root = await mkdtemp(join(tmpdir(), "otr-v3-pg-http-"));
    const local = new DatabaseSync(join(root, "task.db"));
    try {
      await pg.lease.query(
        "SET SESSION AUTHORIZATION otr_external_integration_call_gateway",
      );
      const connection = {
        async withLease<T>(work: (lease: typeof pg.lease) => Promise<T>) {
          return work(pg.lease);
        },
      };
      const gateway = createClosedPersistenceGateway({
        gatewayIdentity: "otr_external_integration_call_gateway",
        now: () => new Date().toISOString(),
        async verify(request) {
          const stamp = new Date();
          return {
            version: 1,
            principal_kind: "TRUSTED_WORKLOAD",
            verified_actor_id: actor!,
            verified_account_id: actor!,
            verified_client_identity: null,
            verified_external_subject: null,
            verified_environment: "DEV",
            auth_source: "SUPABASE_DEV_USER",
            auth_config_version: 1,
            auth_session_reference: "vault:otr/dev/auth-request/" + randomUUID(),
            verified_at: stamp.toISOString(),
            expires_at: new Date(stamp.getTime() + 60000).toISOString(),
            revoked: false,
            request_id: request.requestId,
            request_sha256: request.requestSha256,
            command_kind: request.command,
            gateway_identity: "otr_external_integration_call_gateway",
          };
        },
        async execute(kind, context, command) {
          return universalProviderPgTransaction(
            connection,
            priced,
            async (lease) =>
              (
                await lease.query(`SELECT public.${kind}($1::jsonb,$2::jsonb) AS value`, [
                  JSON.stringify(context),
                  JSON.stringify(command),
                ])
              ).rows[0]?.value,
          );
        },
      });
      const db = initializeUniversalTaskDatabase(local);
      const intake = createUniversalV3Intake(db, join(root, "spool"));
      const bytesByReference = new Map<string, Uint8Array>();
      const retainedByAttempt = new Map<
        string,
        { reference: string; sha256: string; byteCount: number }
      >();
      const send = vi.fn(async (request: { body: string }) => {
        const parts = JSON.parse(request.body).messages[1].content;
        expect(parts).toHaveLength(priced ? 7 : 5);
        if (priced) {
          const images = parts.filter(
            (part: { type: string }) => part.type === "image_url",
          );
          expect(images).toHaveLength(2);
          expect(
            new Set(
              images.map((part: { image_url: { url: string } }) => part.image_url.url),
            ).size,
          ).toBe(2);
        }
        return {
          status: 200,
          redirected: false,
          body: (async function* () {
            yield Buffer.from(
              JSON.stringify({
                id: "local-synthetic",
                model: "deepseek-flash",
                choices: [
                  {
                    finish_reason: "stop",
                    message: {
                      content: JSON.stringify({
                        items: [
                          {
                            kind: "P1",
                            subtype: "ACTIVITY",
                            fields: {
                              "activity.name": "Rail museum",
                              "activity.date": "2026-12-14",
                            },
                            inputs: priced ? [0, 1, 2, 3] : [0, 1, 2],
                          },
                        ],
                      }),
                    },
                  },
                ],
                usage: {
                  prompt_tokens: 100,
                  completion_tokens: 20,
                  total_tokens: 120,
                  prompt_cache_hit_tokens: 0,
                },
              }),
            );
          })(),
        };
      });
      const execution = createUniversalV3Execution({
        intake,
        db,
        stores: {
          custody: {
            async put(input: {
              reservationId: string;
              bytes: Uint8Array;
              sha256: string;
            }) {
              expect(sha(input.bytes)).toBe(input.sha256);
              bytesByReference.set(input.reservationId, input.bytes);
            },
            async read(input: { reference: string; sha256: string }) {
              const bytes = bytesByReference.get(input.reference);
              if (!bytes || sha(bytes) !== input.sha256)
                throw Error("FIXTURE_PRIVATE_CUSTODY");
              return bytes;
            },
          },
          retained: {
            async put(
              attempt: Attempt,
              pin: { reference: string; sha256: string; byteCount: number },
            ) {
              retainedByAttempt.set(attempt.attempt_id, pin);
            },
            async read(attempt: Attempt) {
              return retainedByAttempt.get(attempt.attempt_id);
            },
          },
          async retainRaw() {},
        } as unknown as Parameters<typeof createUniversalV3Execution>[0]["stores"],
        async validateImage(_mime, bytes) {
          return { mediaType: "image/png", bytes };
        },
        extractPdf: (async () => ({
          text: "PDF page 1\fPDF page 2",
        })) as unknown as NonNullable<
          Parameters<typeof createUniversalV3Execution>[0]["extractPdf"]
        >,
        async provision(scope) {
          expect(scope.accountId).toBe(actor);
          expect(scope.tripId).toBe(trip);
          return {
            async assertCurrent() {},
            async selectProvider() {
              const raw = await universalProviderPgTransaction(
                connection,
                priced,
                async (lease) =>
                  (
                    await lease.query(
                      "SELECT public.universal_import_select_v3($1::uuid,$2::uuid,$3) AS value",
                      [actor, trip, integration],
                    )
                  ).rows[0]?.value,
              );
              return universalContinuousSelectionSchema.strip().parse(raw);
            },
            persistence: {
              gateway,
              connection,
              costGuardEnabled: priced,
              environment: (key) =>
                key === "OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT" ? "enabled" : "fixture-only",
            },
          };
        },
        send,
      });
      const analysis = randomUUID();
      const materials = [
        { mediaType: "text/plain", original: Buffer.from("Arriving at the rail museum") },
        { mediaType: "application/pdf", original: Buffer.from("%PDF-synthetic") },
        {
          mediaType: "image/png",
          original: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgaDgBAAHMAUm4iA/rAAAAAElFTkSuQmCC",
            "base64",
          ),
        },
      ];
      if (priced)
        materials.push({
          mediaType: "image/png",
          original: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4oRAAAALsATlZGIz1AAAAAElFTkSuQmCC",
            "base64",
          ),
        });
      const files = materials.map(({ mediaType, original }) => ({
        fileId: randomUUID(),
        documentId: localImportDocumentId(actor!, trip!, sha(original)),
        mediaType,
        sha256: sha(original),
        length: original.length,
      }));
      const base =
        "http://localhost/v2/import-batches/" + analysis + "/interpretations/intake";
      const query = "?tripId=" + trip;
      const call = (request: Request) =>
        universalV3IntakeBoundary(
          request,
          actor!,
          async (a, t) => a === actor && t === trip,
          intake,
          execution,
        );
      expect(
        await (await call(new Request(base + "/capability" + query))).json(),
      ).toEqual({
        localFirst: true,
        existing: null,
      });
      const start = () =>
        call(
          new Request(base + query, {
            method: "POST",
            headers: { "Idempotency-Key": analysis },
            body: JSON.stringify({
              version: "otr.import.local-first/1",
              tripId: trip,
              mode: "UNIVERSAL",
              files,
            }),
          }),
        );
      expect((await start()).status).toBe(202);
      for (const [i, file] of files.entries()) {
        const upload = await call(
          new Request(base + "/files/" + file.fileId + query, {
            method: "PUT",
            headers: {
              "content-type": "application/octet-stream",
              "content-length": String(file.length),
            },
            body: new Uint8Array(materials[i].original),
          }),
        );
        expect(upload.status).toBe(204);
      }
      await vi.waitFor(
        async () => {
          const result = await (
            await call(new Request(base + query + "&execution=1"))
          ).json();
          expect(result).toMatchObject({
            state: "REVIEW_READY",
            candidates: [
              {
                fields: { "activity.name": "Rail museum", "activity.date": "2026-12-14" },
                documentIds: files.map(({ documentId }) => documentId),
              },
            ],
          });
        },
        { timeout: 8000, interval: 100 },
      );
      const ready = universalV3ExecutionStatus.parse(
        await (await call(new Request(base + query + "&execution=1"))).json(),
      );
      if (ready.state !== "REVIEW_READY") throw Error("FIXTURE_V3_REVIEW_MISSING");
      if (priced) {
        const privileged = session(fixture!);
        const independent = session(fixture!);
        try {
          const { rows } = await privileged.lease.query(
            `SELECT c.call_id,c.attempt_id,c.dispatch_state,c.row_revision,
                h.price_schedule_id,h.worst_cost_nanos::text AS worst
              FROM public.external_integration_calls c
              JOIN public.flight_call_resource_holds h USING (call_id)
              WHERE c.task_id=$1::uuid`,
            [ready.taskId],
          );
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({
            dispatch_state: "TERMINAL",
            row_revision: 3,
            price_schedule_id: priceId,
            worst: "14745600",
          });
          const { attempt_id, call_id } = rows[0];
          const args = [actor, ready.taskId, attempt_id, call_id];
          await independent.lease.query(
            "SET SESSION AUTHORIZATION otr_external_integration_call_gateway",
          );
          const settled = (
            await independent.lease.query(
              `SELECT r->'completion'->>'cost_nanos' AS cost,
                r->'completion'->>'input_tokens' AS input, r->'completion'->>'output_tokens' AS output,
                r->'call'->>'price_schedule_id' AS price, r->'call'->>'dispatch_state' AS state,
                r->'admission'->'profile_snapshot'->>'execution_scope' AS profile
              FROM public.model_task_read_universal_v3_receipt($1::uuid,$2::uuid,$3::uuid,$4::uuid) r`,
              args,
            )
          ).rows;
          expect(settled).toEqual([
            {
              cost: "54000",
              input: "100",
              output: "20",
              price: priceId,
              state: "TERMINAL",
              profile: "UNIVERSAL_IMPORT_LOCAL_FIRST_V3",
            },
          ]);
          expect(
            (
              await independent.lease.query(
                "SELECT jsonb_array_length(public.universal_import_read_admitted_price($1::uuid,$2::uuid,$3::uuid,$4::uuid)) AS units",
                args,
              )
            ).rows,
          ).toEqual([{ units: 3 }]);
          console.log(
            JSON.stringify({
              singleDispatch: true,
              worstCostNanos: rows[0].worst,
              ...settled[0],
            }),
          );
        } finally {
          privileged.close();
          independent.close();
        }
      } else {
        await saveAndReopen(
          fixture!,
          actor!,
          trip!,
          join(root, "native.sqlite"),
          ready.candidates[0],
          files,
        );
      }
      expect((await start()).status).toBe(202);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      local.close();
      pg.close();
      await rm(root, { recursive: true, force: true });
    }
  },
  15000,
);

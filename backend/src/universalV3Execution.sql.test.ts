import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { expect, it, vi } from "vitest";
import { session } from "./__fixtures__/tripCoreV2Sql";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import { createClosedPersistenceGateway } from "./externalIntegrationPersistence";
import { initializeUniversalTaskDatabase } from "./universalTaskBootstrap";
import { createUniversalV3Intake } from "./universalV3Intake";
import { createUniversalV3Execution } from "./universalV3Execution";
import { universalProviderPgTransaction } from "./universalPg";
import { universalContinuousSelectionSchema } from "./universalRegisteredTaskDraft";
import { coreCapabilitiesSchema } from "../../src/domain/trip/tripCoreV2Commands";
import { localImportDocumentId } from "../../src/domain/trip/universalImportIdentity";
import { universalV3ExecutionStatus } from "../../src/data/api/universalV3Contracts";
import { createUniversalImportTransport } from "../../src/data/api/universalImportTransport";
import { createCoreV2Transport } from "../../src/data/api/tripCoreV2Transport";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
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
import { createCorePgReader } from "./tripCoreV2PgRead";
import { createCorePgStorage, readCorePgOperation } from "./tripCoreV2PgStorage";
import type { Attempt } from "../../src/domain/intelligence/persistence";

vi.mock("react-native", () => ({ AppState: { currentState: "active" } }));
vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));
vi.mock("../../src/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));

async function saveAndReopen(
  transport: ReturnType<typeof createCoreV2Transport>,
  accountId: string,
  tripId: string,
  localPath: string,
  candidate: Extract<
    ReturnType<typeof universalV3ExecutionStatus.parse>,
    { state: "REVIEW_READY" }
  >["candidates"][number],
  files: readonly { length: number; sha256: string; mediaType: string }[],
) {
  let native = new DatabaseSync(localPath);
  const hash = async (bytes: Uint8Array) => sha(bytes);
  const account = async () => accountId;
  try {
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
      capabilities: coreCapabilitiesSchema.parse(await transport.capabilities(ctx)),
      snapshot,
    });
    expect(plan.commands.map(({ command }) => command)).toEqual([
      "CREATE_ITEM",
      ...files.map(() => "CREATE_DOCUMENT_METADATA"),
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
    expect(restored?.graph.trip_operational_documents).toHaveLength(files.length);
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
    ).toBe(files.length + 2);
  } finally {
    native.close();
  }
}

const fixture = process.env.OTR_V3_PROVIDER_FIXTURE;
const actor = process.env.OTR_V3_FIXTURE_ACTOR;
const trip = process.env.OTR_V3_FIXTURE_TRIP;
const integration = process.env.OTR_V3_FIXTURE_INTEGRATION;
const priceId = process.env.OTR_V3_FIXTURE_PRICE;
const priced = !!priceId;
const decoderImage = process.env.OTR_V3_FIXTURE_DECODER_IMAGE;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function isolatedDecoders(image: string) {
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error("PINNED_DECODER_REQUIRED");
  const entry = buildSync({
    stdin: {
      resolveDir: fileURLToPath(new URL(".", import.meta.url)),
      contents: `
        import { extractUniversalV3Pdf, normalizeUniversalV3Image } from './universalV3Decoders';
        const [mime, input] = process.argv.slice(2);
        const bytes = Buffer.from(input, 'base64');
        if (mime === 'application/pdf') {
          console.log(JSON.stringify(await extractUniversalV3Pdf(bytes)));
        } else {
          const normalized = await normalizeUniversalV3Image(mime, bytes);
          console.log(JSON.stringify({ mediaType: normalized.mediaType, bytes: normalized.bytes.toString('base64') }));
        }
      `,
    },
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    write: false,
  }).outputFiles[0].text;
  const decode = (mime: string, bytes: Uint8Array) =>
    JSON.parse(execFileSync("docker", [
      "run", "--rm", "--pull=never", "--network=none", "--read-only",
      "--tmpfs", "/tmp:rw,size=16m,mode=1777", "--user", "10001:999",
      "--cap-drop=ALL", "--security-opt=no-new-privileges", "-i",
      "--entrypoint", "/usr/local/bin/node", image, "--input-type=module", "-",
      mime, Buffer.from(bytes).toString("base64"),
    ], { input: entry, encoding: "utf8", timeout: 6000 }));
  return {
    async validateImage(mime: string, bytes: Buffer) {
      const result = decode(mime, bytes);
      return { mediaType: result.mediaType, bytes: Buffer.from(result.bytes, "base64") };
    },
    async extractPdf(bytes: Uint8Array) {
      const result = decode("application/pdf", bytes);
      expect(sha(Buffer.from(result.text))).toBe("3b123e3e614785e19e6fa993b32a81aff7e2cbbb578e4baaa3fb5156fbaaf413");
      return result;
    },
  } satisfies Pick<Parameters<typeof createUniversalV3Execution>[0], "validateImage" | "extractPdf">;
}

it.skipIf(!fixture || !actor || !trip || !integration)(
  priced
    ? "runs one priced multi-image V3 Analyze through Core Save and SQLite reopen"
    : "runs mixed V3 HTTP input through durable Wake, synthetic Provider, Core Save and SQLite reopen",
  async () => {
    if (!/^otr-trip-sustained-[a-f0-9]{12}$/.test(fixture!))
      throw Error("OWNED_FIXTURE_REQUIRED");
    const pg = session(fixture!);
    const coreWriter = session(fixture!);
    const coreReader = session(fixture!);
    const root = await mkdtemp(join(tmpdir(), "otr-v3-pg-http-"));
    const local = new DatabaseSync(join(root, "task.db"));
    try {
      await pg.lease.query(
        "SET SESSION AUTHORIZATION otr_external_integration_call_gateway",
      );
      await coreWriter.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      await coreReader.lease.query("SET SESSION AUTHORIZATION otr_trip_core_v2_gateway");
      const connect = ({ lease }: typeof coreWriter) => ({
        withLease: async <T>(work: (current: typeof lease) => Promise<T>) => work(lease),
      });
      const hash = async (bytes: Uint8Array) => sha(bytes);
      const mode = { sustainedDev: true as const };
      const independent = createCorePgStorage(connect(coreReader), hash, undefined, mode);
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
        ...(decoderImage ? isolatedDecoders(decoderImage) : {}),
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
      const materials: { mediaType: "text/plain" | "application/pdf" | "image/png"; original: Buffer }[] = [
        { mediaType: "text/plain", original: Buffer.from("Arriving at the rail museum") },
        {
          mediaType: "application/pdf",
          original: decoderImage
            ? await readFile(new URL("./__fixtures__/source-pdf/synthetic-roundtrip.pdf", import.meta.url))
            : Buffer.from("%PDF-synthetic"),
        },
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
      const auth = {
        validateAccessToken: async (token: string) =>
          token === "fixture-only" ? { id: actor, accountClass: "NORMAL_ACCOUNT" } : null,
        canReadTrip: async (a: string, t: string) => a === actor && t === trip,
      } as unknown as DevBackendGateway;
      const handler = createDevBackendHandler({
        gateway: auth, universalV3Intake: intake, universalV3Execution: execution,
        coreConnection: {
          hash,
          commands: createCorePgStorage(connect(coreWriter), hash, undefined, mode),
          read: createCorePgReader(connect(coreReader), hash, undefined, mode),
          readOperation: (a, t, operation) => readCorePgOperation(independent, a, t, operation, hash),
        },
      });
      const account = async () => actor!;
      const api = {
        baseUrl: "https://import-v3.fixture.invalid",
        fetchImplementation: ((input, init) => handler(new Request(input, init))) as typeof fetch,
      };
      const tokenProvider = async () => ({ userId: actor!, token: "fixture-only" });
      const transport = createUniversalImportTransport(account, { ...api, tokenProvider });
      const ctx = await captureAccountRequestContext(trip!, account);
      expect(await transport.localFirstCapability(ctx, analysis)).toEqual({
        localFirst: true,
        existing: null,
      });
      const start = () => transport.startLocalFirst(ctx, analysis, {
        version: "otr.import.local-first/1", tripId: trip!, mode: "UNIVERSAL", files,
      });
      expect(await start()).toEqual({ analysisId: analysis, missingFiles: files.map((file) => file.fileId) });
      for (const [i, file] of files.entries()) {
        await transport.uploadLocalFirst(ctx, analysis, file.fileId, new Uint8Array(materials[i].original));
      }
      await vi.waitFor(
        async () => {
          const result = await transport.readLocalFirstExecution(ctx, analysis);
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
      const ready = await transport.readLocalFirstExecution(ctx, analysis);
      if (ready?.state !== "REVIEW_READY") throw Error("FIXTURE_V3_REVIEW_MISSING");
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
      }
      await saveAndReopen(
        createCoreV2Transport(account, hash, api, tokenProvider),
        actor!,
        trip!,
        join(root, "native.sqlite"),
        ready.candidates[0],
        files,
      );
      const spool = join(root, "spool");
      await vi.waitFor(async () => expect(await readdir(spool)).toEqual([]));
      expect(await start()).toEqual({ analysisId: analysis, missingFiles: [] });
      await transport.uploadLocalFirst(ctx, analysis, files[0].fileId, new Uint8Array(materials[0].original));
      expect(await readdir(spool)).toEqual([]);
      expect(await transport.readLocalFirstExecution(ctx, analysis)).toEqual(ready);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      local.close();
      pg.close();
      coreWriter.close();
      coreReader.close();
      await rm(root, { recursive: true, force: true });
    }
  },
  15000,
);

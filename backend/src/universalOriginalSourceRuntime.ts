import { createPublicationCatalogPgConnection } from "./tripPublicationCatalogPgConnection";
import { z } from "zod";
import { createHash } from "node:crypto";
import {
  readUniversalFiniteConfig,
  assertUniversalFiniteCurrent,
  universalFiniteConfigSchema,
} from "./universalFiniteConfig";
import { createSourcePgConnection } from "./tripCoreV2PgConnection";
import { createSupabaseDevGateway } from "./supabaseGateway";
import {
  createUniversalOriginalSourceConnection,
  universalOriginalAcquisitionSchema,
} from "./universalOriginalSource";
import { universalPgTransaction } from "./universalPg";
import { createUniversalSourceReader } from "./universalSourceRead";
import { canonicalEventJson, type Json } from "../../src/domain/trip/eventIntentJson";
import type { CorePgConnection } from "./tripCoreV2PgStorage";

type Config = z.infer<typeof universalFiniteConfigSchema>;
// This phase does not open Task SQLite, require an existing Run, or instantiate Provider.
// A configured port is not a SQL-eligibility claim; the existing exact RPC remains fail-closed.
export function createUniversalOriginalSourceRuntime(
  config: Config,
  environment: Record<string, string | undefined>,
  deps: {
    connection: CorePgConnection;
    gateway: Pick<
      ReturnType<typeof createSupabaseDevGateway>,
      "validateAccessToken" | "canReadTrip"
    >;
  },
) {
  let closed = false;
  const assertCurrent = () => {
    if (closed) throw new Error("UNIVERSAL_RUNTIME_CLOSED");
    assertUniversalFiniteCurrent(config, environment);
  };
  const pins = config.task.input_pins;
  if (
    !config.task.trip_id ||
    !config.task.run_id ||
    !pins.length ||
    pins.some((p) => p.kind !== "SOURCE" || !p.input_id || p.material_revision !== 1)
  )
    throw new Error("UNIVERSAL_SOURCE_INPUT_PINS_INVALID");
  const trip = config.task.trip_id;
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const source = createUniversalOriginalSourceConnection(deps.connection, hash);
  async function authorize(actor: string, requestedTrip: string) {
    assertCurrent();
    if (actor !== config.actorId || requestedTrip !== trip)
      throw new Error("SOURCE_ACCESS_DENIED");
    const user = await deps.gateway.validateAccessToken(config.bearer);
    assertCurrent();
    if (
      !user ||
      user.id !== config.actorId ||
      !(await deps.gateway.canReadTrip(actor, trip))
    )
      throw new Error("SOURCE_ACCESS_DENIED");
    assertCurrent();
  }
  async function input(actor: string, requestedTrip: string, raw: unknown) {
    await authorize(actor, requestedTrip);
    const q = universalOriginalAcquisitionSchema.parse(raw);
    if (
      q.actor_account_id !== actor ||
      q.trip_id !== trip ||
      !pins.some(
        (p) =>
          p.kind === "SOURCE" &&
          p.source_id === q.source_id &&
          p.representation_id === q.payload.original.id &&
          p.payload_sha256 === q.payload.original.payload_sha256 &&
          p.byte_count === q.payload.original.byte_count,
      )
    )
      throw new Error("UNIVERSAL_SOURCE_INPUT_PINS_INVALID");
    return q;
  }
  const timer = setTimeout(
    () => {
      closed = true;
    },
    Date.parse(config.expiresAt) - Date.now(),
  );
  timer.unref();
  return {
    universalOriginalSourcePort: {
      async acquire(actor: string, requestedTrip: string, raw: unknown) {
        const q = await input(actor, requestedTrip, raw);
        const result = await source.acquire(actor, requestedTrip, q);
        await authorize(actor, requestedTrip);
        return result;
      },
      async lookup(actor: string, requestedTrip: string, raw: unknown) {
        const q = await input(actor, requestedTrip, raw);
        const result = await source.lookup(actor, requestedTrip, q);
        await authorize(actor, requestedTrip);
        return result;
      },
    },
    // Existing owning read only: independently reconciles the fixed Run after an uncertain begin.
    // The current finite original profile supports retained UTF8; binary is never relabeled as text.
    async readPreparedInputs() {
      await authorize(config.actorId, trip);
      const manifest = await createUniversalSourceReader({
        connection: deps.connection,
        async readBinary() {
          throw new Error("UNIVERSAL_SOURCE_BINARY_PROFILE_UNAVAILABLE");
        },
      })(config.task);
      await authorize(config.actorId, trip);
      return manifest;
    },
    // Trusted Operator only. Never mounted as a Native endpoint and never invoked by startup.
    // Real Sources must already exist; the owning command validates the finite scope/input hash.
    async prepareInputs() {
      await authorize(config.actorId, trip);
      const inputs = pins.map((p) => {
        if (p.kind !== "SOURCE") throw new Error("UNIVERSAL_SOURCE_INPUT_PINS_INVALID");
        return {
          id: p.input_id,
          source_id: p.source_id,
          material_revision: p.material_revision,
          representation_id: p.representation_id,
          payload_sha256: p.payload_sha256,
          byte_count: p.byte_count,
          observed_source_row_revision: 1,
          historical_selection: false,
        };
      });
      const request = {
        runId: config.task.run_id,
        batchId: config.task.import_id,
        taskId: config.task.task_id,
        submissionSha256: config.task.manifest_sha256,
        inputs,
      };
      const result = (await universalPgTransaction(
        deps.connection,
        async (lease) =>
          (
            await lease.query(
              "SELECT public.trip_source_begin_universal_inputs($1::uuid,$2::uuid,$3) AS result",
              [config.actorId, trip, canonicalEventJson(request as Json)],
            )
          ).rows[0]?.result,
      )) as Record<string, unknown> | undefined;
      await authorize(config.actorId, trip);
      if (
        !result ||
        result.id !== config.task.run_id ||
        result.trip_id !== trip ||
        result.actor_account_id !== config.actorId ||
        result.state !== "PENDING"
      )
        throw new Error("UNIVERSAL_SOURCE_BINDING_INVALID");
      return result;
    },
    close() {
      closed = true;
      clearTimeout(timer);
    },
  };
}
export async function loadDevUniversalOriginalSourceRuntime(
  environment: Record<string, string | undefined>,
  sharedCatalog?: ReturnType<typeof createPublicationCatalogPgConnection>,
) {
  const config = await readUniversalFiniteConfig(environment);
  if (!config) return undefined;
  const gateway = createSupabaseDevGateway({
    url: environment.OTR_DEV_SUPABASE_URL!,
    publishableKey: environment.OTR_DEV_SUPABASE_PUBLISHABLE_KEY ?? "",
    secretKey: environment.OTR_DEV_SUPABASE_SECRET_KEY ?? "",
  });
  const catalogConnection =
    sharedCatalog ?? createPublicationCatalogPgConnection(config.catalogPg);
  try {
    const runtime = createUniversalOriginalSourceRuntime(config, environment, {
      connection: createSourcePgConnection(config.sourcePg),
      gateway,
    });
    const close = async () => {
      runtime.close();
      if (!sharedCatalog) await catalogConnection.close();
    };
    const timer = setTimeout(
      () => {
        void close().catch(() => {});
      },
      Date.parse(config.expiresAt) - Date.now(),
    );
    timer.unref();
    return {
      ...runtime,
      catalogConnection,
      async close() {
        clearTimeout(timer);
        await close();
      },
    };
  } catch (error) {
    if (!sharedCatalog) await catalogConnection.close();
    throw error;
  }
}

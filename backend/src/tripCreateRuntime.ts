import { composeClaimResolutionPg, composeClaimOriginPg, composeGeneralInvitePg } from "./tripClaimResolutionPg";
import { createDirectedClaimResolutionSqlEffects, createClaimResolutionSqlEffects } from "./tripClaimResolutionCore";
import { composeDirectedInviteReader } from "./tripDirectedInviteReadPg";
import type { DirectedInviteReadPort } from "./tripDirectedInviteReadHttp";
import { createManagedOAuthConsent } from "./auth/managedOAuthConsent";
import {
  createTripPersonSelfNicknamePgPort,
  SelfNicknamePgError,
} from "./tripPersonSelfNicknamePg";
import { loadDevGuestAdoptionRuntime } from "./guestAdoptionRuntime";
import type { PublishedUniversalP1Reader } from "./universalP1SourcePg";
import { createHash } from "node:crypto";
import { createSustainedDevTripPorts } from "./tripSustainedRuntime";
import { createTripPersonCloudCreatePgPort } from "./tripPersonCloudCreatePg";
import { createTripMemberClaimPgPort } from "./tripMemberClaimPg";
import type { MemberClaimAuthorityPort } from "./tripMemberClaimAuthority";
import {
  PersonCloudCreateError,
  type TripPersonCloudCreatePort,
} from "./tripPersonCloudCreateHttp";
import {
  createNormalDevTripPorts,
  normalDevTripRuntimeSchema,
} from "./tripNormalRuntime";
import {
  createTripPgConnection,
  createTripMetadataPgConnection,
  createCorePgConnection,
  createMcpOperationApprovalPgConnection,
  createPersonPgConnection,
} from "./tripCoreV2PgConnection";
import { createTripMetadataV2PgStorage } from "./tripMetadataV2PgStorage";
import { createTripLifecyclePgStorage } from "./tripLifecycle";
import { createMcpL3LifecyclePort } from "./mcpL3LifecycleAdmission";
import { createCorePgHttpConnection } from "./tripCoreV2PgHttpConnection";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { z } from "zod";
import { tripCreateWireRequestSchema as tripCreateRequestSchema } from "../../src/domain/trip/tripCreateWireContract";
import { TripCreateError, type TripCreatePort } from "./tripCreate";
import {
  createTripPgStorage,
  createTripParentReceiptPgReader,
} from "./tripCreatePgStorage";

// Proposed private mount only; loading it cannot provision a principal or open SQL gates.
export const tripCreateRuntimePath = "/run/otr/trip-create-runtime.json";
const finiteTripCreateRuntimeSchema = z.strictObject({
  version: z.literal(1),
  enabled: z.literal(true),
  expiresAt: z.iso.datetime({ offset: true }),
  actorAccountId: z.uuid(),
  request: tripCreateRequestSchema,
  tripPg: z.strictObject({
    host: z.literal("db.tuqigdxrvrerfewsxqgm.supabase.co"),
    port: z.literal(5432),
    database: z.literal("postgres"),
    password: z.string().min(1),
    ca: z.string().min(1).optional(),
  }),
});

// Same private owning mount; disjoint version, never reinterpret a finite request.
const pgConfig = finiteTripCreateRuntimeSchema.shape.tripPg;
const normalTripCreateRuntimeSchema = z
  .strictObject({
    version: z.literal(2),
    enabled: z.literal(true),
    expiresAt: z.iso.datetime(),
    actorAccountId: z.uuid(),
    adoptionCutoff: z.iso.datetime(),
    startsAt: z.iso.datetime(),
    tripPg: pgConfig,
    metadataPg: pgConfig,
    corePg: pgConfig,
  })
  .superRefine((v, ctx) => {
    if (
      !normalDevTripRuntimeSchema.safeParse({
        version: 1,
        actorAccountId: v.actorAccountId,
        adoptionCutoff: v.adoptionCutoff,
        startsAt: v.startsAt,
        expiresAt: v.expiresAt,
      }).success
    )
      ctx.addIssue({ code: "custom", message: "INVALID_NORMAL_DEV_SCOPE" });
  });
const sustainedTripCreateRuntimeSchema = z.strictObject({
  version: z.literal(3),
  enabled: z.literal(true),
  tripPg: pgConfig,
  metadataPg: pgConfig,
  corePg: pgConfig,
  personPg: pgConfig,
  mcpApprovalPg: pgConfig.optional(),
});
export const tripCreateRuntimeSchema = z.union([
  finiteTripCreateRuntimeSchema,
  normalTripCreateRuntimeSchema,
  sustainedTripCreateRuntimeSchema,
]);

export async function loadDevTripCreateRuntime(
  environment: Record<string, string | undefined>,
  readUniversalP1?: PublishedUniversalP1Reader,
  options?: Readonly<{
    memberClaim?: Readonly<{ inviteExpiresAt: string }>;
    directedInviteRead?: true;
    memberAccess?: true;
    claimResolution?: true;
    claimGeneralOrigin?: true;
    selfTripNickname?: true;
    retainedPng?: import("./tripCoreV2RetainedPngRead").RetainedPngReader;
  }>,
) {
  let file;
  try {
    file = await open(
      tripCreateRuntimePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("TRIP_CREATE_RUNTIME_UNAVAILABLE");
  }
  let config: z.infer<typeof tripCreateRuntimeSchema>;
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.uid !== 0 ||
      stat.gid !== 999 ||
      (stat.mode & 0o777) !== 0o440 ||
      stat.nlink !== 1 ||
      stat.size > 139264
    )
      throw 0;
    const body = await file.readFile("utf8");
    if (Buffer.byteLength(body) > 139264) throw 0;
    config = tripCreateRuntimeSchema.parse(JSON.parse(body));
    if (
      config.version === 1 &&
      !("formatVersion" in config.request) &&
      (stat.size > 16384 || Buffer.byteLength(body) > 16384)
    )
      throw 0;
    const remaining =
      config.version === 3 ? null : Date.parse(config.expiresAt) - Date.now();
    // Keep the existing finite activation's maximum 15-minute window; no automatic renewal.
    if (
      (remaining !== null &&
        (remaining <= 0 || remaining > (config.version === 2 ? 86400000 : 900000))) ||
      environment.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
      environment.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co"
    )
      throw 0;
  } catch {
    throw new Error("TRIP_CREATE_RUNTIME_UNAVAILABLE");
  } finally {
    await file.close();
  }
  if (config.version === 3) {
    const rawCoreConnection = createCorePgConnection(config.corePg);
    const managedConfig = environment.OTR_DEV_MCP_MANAGED_DEV_CONFIG;
    const managedMcpApprovalConnection =
      managedConfig !== undefined && config.mcpApprovalPg
        ? createMcpOperationApprovalPgConnection(config.mcpApprovalPg)
        : undefined;
    let managedNativeConsent;
    if (managedConfig !== undefined) {
      try {
        const { consentPolicy, expiresAt } = JSON.parse(managedConfig);
        const policy = {
          policyId: consentPolicy.policy.id,
          policyVersion: consentPolicy.policy.version,
          policyHash: consentPolicy.policyHash,
          expiresAt: expiresAt === null ? Number.MAX_SAFE_INTEGER : expiresAt,
          ...(expiresAt === null ? { grantTtlSeconds: consentPolicy.policy.grant_ttl_seconds } : {}),
        };
        managedNativeConsent = createManagedOAuthConsent(rawCoreConnection, () => policy);
      } catch {
        console.info("MCP_MANAGED_CONSENT_CLOSED");
      }
    }

    const guestAdoptionRuntime = loadDevGuestAdoptionRuntime(
      environment,
      rawCoreConnection,
    );
    const tripConnection = createTripPgConnection(config.tripPg);
    const createPort = createTripPgStorage(tripConnection);
    if (environment.OTR_DEV_TRIP_PARENT_RECEIPT_READ_ENABLED === "1")
      createPort.parentReceipt = createTripParentReceiptPgReader(tripConnection);
    const metadataConnection = createTripMetadataPgConnection(config.metadataPg);
    const enableLifecycle = environment.OTR_DEV_MCP_BETA_LAYER1_ENABLED === "1";
    const sustained = createSustainedDevTripPorts(
      {
        create: createPort,
        metadata: createTripMetadataV2PgStorage(metadataConnection),
        ...(enableLifecycle
          ? { lifecycle: createTripLifecyclePgStorage(metadataConnection) }
          : {}),
        core: createCorePgHttpConnection(
          rawCoreConnection,
          async (bytes) => createHash("sha256").update(bytes).digest("hex"),
          undefined,
          {
            sustainedDev: true,
            ...(enableLifecycle ? { betaLifecycle: true as const } : {}),
            ...(readUniversalP1 ? { reviewedP1: true as const } : {}),
          },
          readUniversalP1,
          ...(options?.retainedPng || options?.memberAccess === true ? [{
            ...(options?.retainedPng ? { retainedPng: options.retainedPng } : {}),
            ...(options?.memberAccess === true ? { memberAccess: true as const } : {}),
          }] as const : []),
        ),
      },
      true,
    );
    if (!sustained) throw new Error("TRIP_CREATE_RUNTIME_UNAVAILABLE");
    const managedTripLifecycleForGrant = enableLifecycle
      ? (grant: Parameters<typeof createMcpL3LifecyclePort>[1]) =>
          createMcpL3LifecyclePort(metadataConnection, grant)
      : undefined;
    const person = createTripPersonCloudCreatePgPort(
      createPersonPgConnection(config.personPg),
    );
    let closed = false;
    const guard = () => {
      if (closed) throw new PersonCloudCreateError(503, "PERSON_CREATE_CLOSED");
    };
    // Internal trusted server selection only; no existing mount/Env selects this port.
    const claim = options?.memberClaim
      ? createTripMemberClaimPgPort(rawCoreConnection, options.memberClaim)
      : undefined;
    // Explicit internal composition only; config/connection presence never selects it.
    const selfTripNicknamePort =
      options?.selfTripNickname === true
        ? createTripPersonSelfNicknamePgPort(rawCoreConnection, () => {
            if (closed)
              throw new SelfNicknamePgError(503, "SELF_NICKNAME_RUNTIME_CLOSED");
          })
        : undefined;
    const claimGuard = () => {
      if (closed) throw Error("MEMBER_CLAIM_RUNTIME_CLOSED");
    };
    const resolution = options?.claimResolution === true
      ? composeClaimResolutionPg(rawCoreConnection, options?.claimGeneralOrigin === true
        ? createClaimResolutionSqlEffects(true) : createDirectedClaimResolutionSqlEffects(true), true, claimGuard)
      : undefined;
    // Provisional reads remain unavailable in this composition; owning SQL effects are unchanged.
    const claimResolutionPort = resolution && (() => {
      const { readProvisionalView: _readProvisionalView, ...port } = resolution;
      return port;
    })();
    const claimOriginPort = options?.claimGeneralOrigin === true
      ? composeClaimOriginPg(rawCoreConnection, true, claimGuard) : undefined;
    const generalInvitePort = options?.claimGeneralOrigin === true
      ? composeGeneralInvitePg(rawCoreConnection, true, claimGuard) : undefined;
    const reader = options?.directedInviteRead === true
      ? composeDirectedInviteReader(rawCoreConnection, { enabled: true })
      : undefined;
    const readGuard = () => {
      if (closed) throw Error("DIRECTED_INVITE_READ_CLOSED");
    };
    const directedInviteReadPort: DirectedInviteReadPort | undefined = reader && {
      ...(reader.incoming ? {
        async incoming(scope: { accountId: string }) {
          readGuard();
          const result = await reader.incoming!(scope);
          readGuard();
          return result;
        },
      } : {}),
      async recipients(scope) {
        readGuard();
        const result = await reader.recipients(scope);
        readGuard();
        return result;
      },
      async invitation(scope) {
        readGuard();
        const result = await reader.invitation(scope);
        readGuard();
        return result;
      },
    };
    const memberClaimPort: MemberClaimAuthorityPort | undefined = claim && {
      async atomic(scope, work) {
        claimGuard();
        const result = await claim.atomic(scope, async (tx) => {
          claimGuard();
          const value = await work(tx);
          claimGuard();
          return value;
        });
        claimGuard();
        return result;
      },
    };
    const tripPersonCloudCreatePort: TripPersonCloudCreatePort = {
      async create(actor, request) {
        guard();
        const result = await person.create(actor, request);
        guard();
        return result;
      },
      async receipt(actor, trip, operation) {
        guard();
        const result = await person.receipt(actor, trip, operation);
        guard();
        return result;
      },
    };
    return {
      ...sustained,
      managedNativeConsent,
      managedMcpApprovalConnection,
      managedTripLifecycleForGrant,
      guestAdoptionRuntime,
      ...(memberClaimPort ? { memberClaimPort } : {}),
      ...(claimResolutionPort ? { claimResolutionPort } : {}),
      ...(claimOriginPort ? { claimOriginPort } : {}),
      ...(generalInvitePort ? { generalInvitePort } : {}),
      ...(directedInviteReadPort ? { directedInviteReadPort } : {}),
      ...(selfTripNicknamePort ? { selfTripNicknamePort } : {}),
      tripPersonCloudCreatePort,
      async close() {
        closed = true;
        await rawCoreConnection.close();
        await managedMcpApprovalConnection?.close();
        sustained.close();
      },
    };
  }
  if (config.version === 2) {
    const normal = createNormalDevTripPorts(
      {
        version: 1,
        actorAccountId: config.actorAccountId,
        adoptionCutoff: config.adoptionCutoff,
        startsAt: config.startsAt,
        expiresAt: config.expiresAt,
      },
      {
        create: createTripPgStorage(createTripPgConnection(config.tripPg)),
        metadata: createTripMetadataV2PgStorage(
          createTripMetadataPgConnection(config.metadataPg),
        ),
        core: createCorePgHttpConnection(
          createCorePgConnection(config.corePg),
          async (bytes) => createHash("sha256").update(bytes).digest("hex"),
        ),
      },
    );
    return {
      ...normal,
      async close() {
        normal.close();
      },
    };
  }
  const storage = createTripPgStorage(createTripPgConnection(config.tripPg));
  let closed = false;
  const scope = (actor: string, operationId: string) => {
    if (closed || Date.now() >= Date.parse(config.expiresAt))
      throw new TripCreateError(503, "TRIP_CREATE_CLOSED");
    if (actor !== config.actorAccountId || operationId !== config.request.operationId)
      throw new TripCreateError(403, "TRIP_CREATE_FORBIDDEN");
  };
  const tripCreatePort: TripCreatePort = {
    async create(actor, request, ...admission) {
      scope(actor, request.operationId);
      const checked = tripCreateRequestSchema.parse(request);
      if (
        checked.tripId !== config.request.tripId ||
        checked.name !== config.request.name ||
        checked.destination !== config.request.destination ||
        checked.startDate !== config.request.startDate ||
        checked.endDate !== config.request.endDate ||
        JSON.stringify(checked) !== JSON.stringify(config.request)
      )
        throw new TripCreateError(409, "TRIP_CREATE_COLLISION");
      const result = await storage.create(actor, checked, ...admission);
      scope(actor, checked.operationId);
      return result;
    },
    async receipt(actor, operationId) {
      scope(actor, operationId);
      const result = await storage.receipt(actor, operationId);
      scope(actor, operationId);
      if (result && result.tripId !== config.request.tripId)
        throw new TripCreateError(503, "TRIP_CREATE_RESULT_MISMATCH");
      return result;
    },
  };
  return {
    tripCreatePort,
    async close() {
      closed = true;
    },
  };
}

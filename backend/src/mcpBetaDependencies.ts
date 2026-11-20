import { createHash } from "node:crypto";
import type { BackendDependencies, DevBackendGateway } from "./app";
import {
  createTripPgStorage,
  createTripParentReceiptPgReader,
} from "./tripCreatePgStorage";
import { createCorePgHttpConnection } from "./tripCoreV2PgHttpConnection";
import {
  createCorePgConnection,
  createPersonPgConnection,
  createTripPgConnection,
  createTripMetadataPgConnection,
  type CorePgConfig,
} from "./tripCoreV2PgConnection";
import { createTripLifecyclePgStorage } from "./tripLifecycle";
import { createTripMetadataV2PgStorage } from "./tripMetadataV2PgStorage";
import { createTripPersonCloudCreatePgPort } from "./tripPersonCloudCreatePg";
import { createTripMemberClaimPgPort } from "./tripMemberClaimPg";
import type { CorePgConnection } from "./tripCoreV2PgStorage";

export function createMcpBetaDependencies(
  gateway: DevBackendGateway,
  pg: CorePgConfig,
  wrap: (connection: CorePgConnection) => CorePgConnection = (connection) => connection,
): BackendDependencies {
  return {
    gateway,
    tripCreatePort: {
      ...createTripPgStorage(wrap(createTripPgConnection(pg))),
      parentReceipt: createTripParentReceiptPgReader(createTripPgConnection(pg)),
    },
    tripMetadataV2Port: createTripMetadataV2PgStorage(createTripMetadataPgConnection(pg)),
    tripLifecyclePort: createTripLifecyclePgStorage(createTripMetadataPgConnection(pg)),
    tripPersonCloudCreatePort: createTripPersonCloudCreatePgPort(
      createPersonPgConnection(pg),
    ),
    memberClaimPort: createTripMemberClaimPgPort(createCorePgConnection(pg), {
      inviteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    }),
    coreConnection: createCorePgHttpConnection(
      wrap(createCorePgConnection(pg)),
      async (bytes) => createHash("sha256").update(bytes).digest("hex"),
      undefined,
      { sustainedDev: true, betaLifecycle: true },
    ),
  };
}

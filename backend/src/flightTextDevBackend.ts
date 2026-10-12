import { createHash } from "node:crypto";
import { createDevBackendHandler, type BackendDependencies } from "./app";
import {
  createCorePgConnection,
  createSourcePgConnection,
  type CorePgConfig,
} from "./tripCoreV2PgConnection";
import { createCorePgHttpConnection } from "./tripCoreV2PgHttpConnection";
import { createFlightTextSourceConnection } from "./flightTextSource";

// Explicit CLOSED composition only; server startup supplies neither config nor credentials.
export function createFlightTextDevBackend(
  dependencies: Omit<
    BackendDependencies,
    "coreConnection" | "flightTextSourceConnection"
  >,
  configs: { core: CorePgConfig; source: CorePgConfig },
) {
  const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  return createDevBackendHandler({
    ...dependencies,
    coreConnection: createCorePgHttpConnection(
      createCorePgConnection(configs.core),
      hash,
    ),
    flightTextSourceConnection: createFlightTextSourceConnection(
      createSourcePgConnection(configs.source),
      hash,
    ),
  });
}

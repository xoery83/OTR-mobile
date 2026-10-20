import * as Network from "expo-network";

import { readLocalSession } from "@/data/auth/authRepository";

import { getDefaultDataHealthCoordinator } from "./defaultDataHealthCoordinator";
import { createDataHealthScheduler } from "./dataHealthScheduler";

let scheduler: ReturnType<typeof createDataHealthScheduler> | null = null;

export function getDefaultDataHealthScheduler() {
  if (!scheduler)
    scheduler = createDataHealthScheduler({
      getCoordinator: getDefaultDataHealthCoordinator,
      networkPermitsConvergence: async () => {
        const [network, session] = await Promise.all([
          Network.getNetworkStateAsync(),
          readLocalSession(),
        ]);
        return Boolean(
          session?.identity?.userId &&
          network.isConnected !== false &&
          network.isInternetReachable !== false,
        );
      },
    });
  return scheduler;
}

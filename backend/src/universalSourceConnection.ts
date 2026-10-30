import { createRequestBoundary } from "../../src/data/api/requestBoundary";
import type { CorePgConnection } from "./tripCoreV2PgStorage";

// The existing Source principal permits one session; wait without widening its quota.
export function serializeUniversalSourceConnection(
  connection: CorePgConnection,
  assertCurrent: () => void,
): CorePgConnection {
  return serializeUniversalSourceConnections([connection], assertCurrent)[0];
}

// Normal/PDF budgets share the same existing principal's FIFO and backlog quota.
export function serializeUniversalSourceConnections(
  connections: readonly CorePgConnection[],
  assertCurrent: () => void,
): CorePgConnection[] {
  let tail = Promise.resolve(),
    pending = 0;
  return connections.map((connection) => ({
    async withLease(work) {
      if (pending >= 4) throw Error("CORE_CONNECTION_BUSY");
      pending++;
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      const wait = createRequestBoundary(10000);
      try {
        await wait.run(() => previous);
        wait.close();
        assertCurrent();
        return await connection.withLease(work);
      } finally {
        wait.close();
        // A timed-out waiter cannot release another request's active lease.
        void previous.then(() => {
          pending--;
          release();
        });
      }
    },
  }));
}

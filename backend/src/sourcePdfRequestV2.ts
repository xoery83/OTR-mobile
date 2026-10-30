import { authenticate, type DevBackendGateway } from "./app";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import type { PdfSourceRequestIoGuard } from "./sourcePdfStorageProducer";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import type { SourcePdfCustodyReader } from "./sourcePdfAuthority";
import type { PdfCausalOwner } from "./sourcePdfCausalAuthority";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { createSourcePdfRequestScope } from "./sourcePdfRequestScope";
import { createSourcePdfV2Authority } from "./sourcePdfV2Authority";
import { createSourcePdfV2Registration } from "./sourcePdfV2Registration";
import { runSourcePdfV2LinuxWorker } from "./sourcePdfV2LinuxWorker";

// A closed request can always roll back; it cannot send another owning statement.
export function guardPdfRequestConnection(
  connection: CorePgConnection,
  guard: PdfSourceRequestIoGuard,
): CorePgConnection {
  return {
    async withLease(work) {
      await guard.assertCurrent();
      guard.assertRequestCurrent();
      return connection.withLease(async (lease) => {
        guard.assertRequestCurrent();
        await guard.assertCurrent();
        guard.assertRequestCurrent();
        return work({
          retire: () => lease.retire(),
          async query(sql, parameters) {
            if (sql === "ROLLBACK") return lease.query(sql, parameters);
            if (sql === "COMMIT") await guard.assertCurrent();
            guard.assertRequestCurrent();
            const value = await lease.query(sql, parameters);
            try {
              guard.assertRequestCurrent();
            } catch (error) {
              // The caller has not set its began flag until BEGIN returns.
              if (/^BEGIN(?:\s|$)/.test(sql)) {
                try {
                  await lease.query("ROLLBACK");
                } catch {
                  lease.retire();
                }
              }
              throw error;
            }
            return value;
          },
        });
      });
    },
  };
}

// Optional trusted composition, never startup activation or a persistent Session epoch.
export function createSourcePdfRequestV2(deps: {
  gateway: DevBackendGateway;
  connection: CorePgConnection;
  hash: ImportHash;
  workload: Pick<PdfCausalOwner, "ownerRun" | "producerId" | "providerInstanceSha256">;
  readOriginalForRequest(guard: PdfSourceRequestIoGuard): SourcePdfCustodyReader;
  runWorker?: typeof runSourcePdfV2LinuxWorker;
  assertEnabled(): void;
}) {
  return async (request: Request, actorId: string) => {
    deps.assertEnabled();
    const route =
      /^\/v2\/trips\/([^/]+)\/sources\/pdf-v2\/(verify-original|register-derived|seal)$/.exec(
        new URL(request.url).pathname,
      );
    if (!route) throw Error("PDF_SCOPE_FORBIDDEN");
    const tripId = coreUuid.parse(route[1]);
    const scope = createSourcePdfRequestScope({
      actorId,
      tripId,
      signal: request.signal,
      workload: deps.workload,
      async readCurrentAccess() {
        deps.assertEnabled();
        const actor = await authenticate(request, deps.gateway);
        const canReadTrip = await deps.gateway.canReadTrip(actor.id, tripId);
        deps.assertEnabled();
        return { actorId: actor.id, tripId, canReadTrip };
      },
    });
    const guard: PdfSourceRequestIoGuard = {
      signal: request.signal,
      assertRequestCurrent() {
        scope.owner.assertRequestCurrent!();
      },
      async assertCurrent() {
        await scope.owner.accountGeneration(actorId);
      },
    };
    try {
      await guard.assertCurrent();
      const read = deps.readOriginalForRequest(guard);
      const reader: SourcePdfCustodyReader = async (pins) => {
        if (pins.accountId !== actorId || pins.tripId !== tripId)
          throw Error("PDF_SCOPE_FORBIDDEN");
        await guard.assertCurrent();
        guard.assertRequestCurrent();
        const bytes = await read(pins);
        guard.assertRequestCurrent();
        await guard.assertCurrent();
        return bytes;
      };
      const worker: typeof runSourcePdfV2LinuxWorker = async (bytes) => {
        await guard.assertCurrent();
        guard.assertRequestCurrent();
        const result = await (deps.runWorker ?? runSourcePdfV2LinuxWorker)(bytes);
        guard.assertRequestCurrent();
        await guard.assertCurrent();
        return result;
      };
      const connection = guardPdfRequestConnection(deps.connection, guard);
      const options = { continuousSourceScope: true as const };
      const registration = createSourcePdfV2Registration(
        connection,
        deps.hash,
        reader,
        worker,
        options,
      );
      const authority = createSourcePdfV2Authority(
        connection,
        deps.hash,
        reader,
        worker,
        options,
      );
      return { port: { ...registration, seal: authority.seal }, close: scope.close };
    } catch (error) {
      scope.close();
      throw error;
    }
  };
}

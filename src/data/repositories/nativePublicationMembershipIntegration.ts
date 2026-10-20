import { createTripPublicationCatalogTransport } from "@/data/api/tripPublicationCatalogTransport";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import type { ImportHash } from "@/domain/trip/flightImportReview";
import {
  createPublicationCatalogNativeFetch,
  PUBLICATION_CATALOG_DEV_ORIGIN,
} from "@/native/publicationCatalogReceive";
import type { createTripImportAdmissionRepository } from "./tripImportAdmissionRepository";
import {
  createClosedPublicationMembershipReader,
  createDormantPublicationMembershipRepository,
  type PublicationMembershipDatabase,
} from "./tripPublicationMembershipRepository";

// Explicit read/install only; no startup, scheduler, Composer or command activation.
export async function createNativePublicationMembershipIntegration(
  database: PublicationMembershipDatabase,
  importStore: ReturnType<typeof createTripImportAdmissionRepository>["transactionStore"],
  getAccountId: () => Promise<string>,
  sha256: ImportHash,
  tokenProvider?: Parameters<typeof createTripPublicationCatalogTransport>[2],
) {
  const repository = createDormantPublicationMembershipRepository(
    database,
    importStore,
    getAccountId,
    sha256,
  );
  const transport = createTripPublicationCatalogTransport(
    getAccountId,
    {
      baseUrl: PUBLICATION_CATALOG_DEV_ORIGIN,
      fetchImplementation: await createPublicationCatalogNativeFetch(),
    },
    tokenProvider,
  );
  const reader = createClosedPublicationMembershipReader({
    mode: "CLOSED",
    rpc: (_routine, _parameters, context, signal) => transport.read(context, signal),
    getAccountId,
    sha256,
  });
  return {
    captureContext: transport.captureContext,
    async install(context: AccountRequestContext, signal?: AbortSignal) {
      const handle = await reader.read(context, signal);
      await repository.install(context, handle);
      return handle.memberships.length;
    },
    read: repository.read,
  };
}

import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { subscribeAccountGeneration } from "../auth/accountGeneration";
import { ApiClientError } from "../api/client";
import type { CoreAuthorizedVersionTransport } from "../api/tripCoreV2Transport";
import type { CoreAcceptedCertificate } from "../repositories/tripCoreV2Repository";
import {
  authorizedTripVersionFromCollection,
  authorizedTripVersionSchema,
} from "@/domain/trip/tripAuthorizedVersion";
import type { ImportHash } from "@/domain/trip/flightImportReview";
import {
  acceptedVisibleVersion,
  sameVisibleVersion,
  sameAcceptedCertificate,
  type CoreVisibleVersionRead,
} from "./tripVisibleVersionRead";

const key = (context: AccountRequestContext) =>
  JSON.stringify([context.accountId, context.tripId, context.generation]);
const unavailable = (error: unknown) =>
  error instanceof ApiClientError &&
  (error.kind === "timeout" ||
    error.kind === "network" ||
    (error.status === 503 &&
      [
        "CORE_READ_UNAVAILABLE",
        "CORE_EXECUTION_UNAVAILABLE",
        "CORE_CAPABILITY_CLOSED",
      ].includes(error.code ?? "")));

// Process-only read optimization. No token is installed from an unpaired version GET.
export function createTripAuthorizedVersionConsumer(deps: {
  account(): Promise<string>;
  transport: CoreAuthorizedVersionTransport;
  hash: ImportHash;
}) {
  const baselines = new Map<
    string,
    { certificate: CoreAcceptedCertificate; token: string }
  >();
  let disposed = false;
  const unlisten = subscribeAccountGeneration(() => baselines.clear());
  const read: CoreVisibleVersionRead = async (context, compared, certificate) => {
    if (disposed) throw Error("CORE_VERSION_CONSUMER_DISPOSED");
    await assertAccountRequestContext(context, deps.account);
    const id = key(context),
      baseline = baselines.get(id);
    if (
      !certificate ||
      !baseline ||
      !sameAcceptedCertificate(certificate, baseline.certificate) ||
      !sameVisibleVersion(compared, acceptedVisibleVersion(certificate))
    ) {
      baselines.delete(id);
      return { context, compared, unchanged: false };
    }
    try {
      const version = authorizedTripVersionSchema.parse(
        await deps.transport.authorizedVersion(
          context,
          certificate.ordinary_order_version === 1 ? 1 : undefined,
        ),
      );
      await assertAccountRequestContext(context, deps.account);
      if (disposed) throw Error("CORE_VERSION_CONSUMER_DISPOSED");
      if (
        version.actorAccountId !== context.accountId ||
        version.tripId !== context.tripId
      )
        throw Error("CORE_AUTHORIZED_VERSION_SCOPE_MISMATCH");
      return {
        context,
        compared,
        unchanged: baselines.get(id) === baseline && version.token === baseline.token,
      };
    } catch (error) {
      baselines.delete(id);
      if (!unavailable(error)) throw error;
      await assertAccountRequestContext(context, deps.account);
      return { context, compared, unchanged: false };
    }
  };
  read.observeAccepted = async (context, certificate, collection, isCurrent) => {
    if (disposed) return;
    context = Object.freeze({ ...context });
    certificate = Object.freeze({ ...certificate });
    const id = key(context);
    baselines.delete(id);
    await assertAccountRequestContext(context, deps.account);
    const version = await authorizedTripVersionFromCollection(
      collection,
      context.accountId,
      context.tripId,
      deps.hash,
    );
    const manifest = collection.manifest;
    if (
      manifest.manifestSha256 !== certificate.manifest_sha256 ||
      !sameVisibleVersion(acceptedVisibleVersion(certificate), {
        epoch: manifest.epoch,
        revision: manifest.revision,
        accessRevision: manifest.accessRevision,
        actorPersonBindingHash: manifest.actorPersonBindingHash,
        participatingRosterHash: manifest.participatingRosterHash,
        ordinaryOrderVersion: manifest.ordinaryOrderVersion ?? 0,
      })
    )
      throw Error("CORE_AUTHORIZED_VERSION_ACCEPTED_MISMATCH");
    await assertAccountRequestContext(context, deps.account);
    if (!(await isCurrent())) return;
    assertAccountRequestGeneration(context);
    if (disposed) return;
    baselines.set(id, {
      certificate: Object.freeze({ ...certificate }),
      token: version.token,
    });
  };
  return Object.assign(read, {
    dispose() {
      disposed = true;
      unlisten();
      baselines.clear();
    },
  });
}

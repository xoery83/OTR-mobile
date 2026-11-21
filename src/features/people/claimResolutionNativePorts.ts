import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { readNativeDirectedInvitePorts } from "@/data/auth/authRepository";
import { readTripPreparationSetupRepository } from "@/data/repositories/tripPreparationSetupRepository";
import type { ClaimResolutionControllerPorts } from "./claimResolutionController";

const sameScope = (a: AccountRequestContext, b: AccountRequestContext) =>
  a.accountId === b.accountId && a.tripId === b.tripId && a.generation === b.generation;

// Composition only: the coordinator owns Pull; Auth owns fresh resolver/request provenance.
export async function createClaimResolutionNativePorts(
  input: AccountRequestContext,
): Promise<ClaimResolutionControllerPorts> {
  const context = Object.freeze({ ...input });
  const ports = await readNativeDirectedInvitePorts();
  const guard = () => assertAccountRequestContext(context, ports.account);
  await guard();
  return {
    account: ports.account,
    reader: ports.resolutionReader,
    attempts: ports.attempts,
    async readPeople(origin) {
      if (!sameScope(origin, context)) throw Error("CLAIM_PEOPLE_SCOPE_MISMATCH");
      await guard();
      const read = await ports.refreshAndReadPeople(context);
      await guard();
      if (!sameScope(read.context, context)) throw Error("CLAIM_PEOPLE_SCOPE_MISMATCH");
      if (read.status !== "EXECUTED") return { ...read, labels: [] };
      if (
        !read.accepted ||
        !Number.isSafeInteger(read.refreshGeneration) ||
        read.refreshGeneration < 1 ||
        read.accepted?.certificate.applied_generation !== read.refreshGeneration
      )
        throw Error("CLAIM_PEOPLE_CERTIFICATE_REQUIRED");
      const setup = await (
        await readTripPreparationSetupRepository()
      ).read(context.tripId);
      await guard();
      if (!sameScope(setup.context, context) || setup.members.state !== "AVAILABLE")
        throw Error("CLAIM_PEOPLE_LABELS_UNAVAILABLE");
      const acceptedIds = new Set(read.accepted.people.map((person) => person.personId));
      const labels = setup.members.people
        .filter(
          (person) =>
            person.localState !== "LOCAL_PENDING" && acceptedIds.has(person.personId),
        )
        .map(({ personId, displayName }) => ({ personId, displayName }));
      return { ...read, labels };
    },
    async prepareNewPerson(origin, displayName, requestId, expectedRevision) {
      if (!sameScope(origin, context)) throw Error("CLAIM_PERSON_INTENT_SCOPE");
      await guard();
      const intent = await ports.prepareNewResolutionPerson(
        context,
        displayName,
        requestId,
        expectedRevision,
      );
      await guard();
      return intent;
    },
  };
}

import type { SecureSessionStorage } from "../auth/authSessionRepository";
import { requireAdoptedUserId } from "../auth/authRepository";
import { createDirectedInviteReadRepository } from "../repositories/directedInviteReadRepository";
import { createMemberClaimAttemptRepository } from "../repositories/memberClaimAttemptRepository";
import { createIncomingInvitationSelection } from "@/data/repositories/incomingInvitationSelection";
import { refreshDirectedClaimPeople } from "../sync/tripDownstreamCoordinator";
import { createClaimResolutionRepository } from "../repositories/claimResolutionRepository";
import { personCloudCreateSchema } from "@/domain/trip/tripPersonCloudCreate";
import { createUuid } from "@/domain/localId";
import type { AccountRequestContext } from "../auth/accountRequestContext";

// Uses the normal Auth token path and Auth's existing durable original-attempt store.
export function createNativeDirectedInvitePorts(storage: SecureSessionStorage) {
  const resolutionReader = createClaimResolutionRepository(requireAdoptedUserId);
  const attempts = createMemberClaimAttemptRepository(storage, requireAdoptedUserId);
  return {
    account: requireAdoptedUserId,
    reader: createDirectedInviteReadRepository(requireAdoptedUserId),
    attempts,
    resolutionReader,
    async prepareNewResolutionPerson(
      context: AccountRequestContext,
      displayName: string,
      requestId: string,
      expectedRevision: number,
    ) {
      // Current resolver/request proof; never substitute the Original Owner's identity.
      const parent = await resolutionReader.createPersonContext(context, requestId);
      if (!parent || parent.requestRevision !== expectedRevision)
        throw Error("CLAIM_PERSON_CONTEXT_CHANGED");
      return personCloudCreateSchema.parse({
        version: 1,
        operationId: createUuid(),
        personId: createUuid(),
        tripId: context.tripId,
        tripCreateOperationId: parent.tripCreateOperationId,
        dataOwnership: "CLOUD_SHARED_AUTHORED",
        displayName,
      });
    },
    selection: createIncomingInvitationSelection(storage, requireAdoptedUserId),
    refreshAndReadPeople: refreshDirectedClaimPeople,
  };
}

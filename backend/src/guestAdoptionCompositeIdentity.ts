import { z } from "zod";
import { prepareGuestAdoptionCompositePlan } from "./guestAdoptionCompositePlan";
import type { AuthenticatedAccount } from "./authAccountQualification";
import { guestAdoptionPreparationSchema } from "../../src/data/auth/guestAdoptionPreparation";
import { verifyGuestSourceCheckpoint } from "../../src/data/auth/guestTripP1SourceSchema";
import { tripCreateWireResultSchema } from "../../src/domain/trip/tripCreateWireContract";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { validateCoreCommand } from "../../src/domain/trip/tripCoreV2Commands";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";

const canonical = (value: unknown) => canonicalCoreJson(value as Json);

// Owning transaction readbacks only. This pure candidate never connects an Account
// or qualifies a receipt supplied by a client as trusted server evidence.
export async function prepareGuestAdoptionCompositeIdentity(
  user: AuthenticatedAccount,
  owningStaging: unknown,
  checkpoint: unknown,
  owningTripCreateReadbacks: unknown,
) {
  const receipts = z.array(tripCreateWireResultSchema).parse(owningTripCreateReadbacks);
  const plan = await prepareGuestAdoptionCompositePlan(user, owningStaging, checkpoint);
  const sealed = JSON.parse(plan.canonicalText);
  const preparation = guestAdoptionPreparationSchema.parse(
    JSON.parse(sealed.preparation.canonicalText),
  );
  if (!preparation.source) throw Error("GUEST_ADOPTION_IDENTITY_SOURCE_REQUIRED");
  const source = await verifyGuestSourceCheckpoint(preparation.source, preparation);
  const fail = () => {
    throw Error("GUEST_ADOPTION_IDENTITY_READBACK_MISMATCH");
  };
  if (
    receipts.length !== source.trips.length ||
    new Set(receipts.map((r) => r.tripId)).size !== receipts.length
  )
    fail();
  const sourcePeople = new Set(
    source.trips.flatMap((t) => [t.creator.personId, ...t.people.map((p) => p.personId)]),
  );
  const targets = new Set<string>();
  const trips = [];
  for (const trip of source.trips) {
    const receipt = receipts.find((r) => r.tripId === trip.create.tripId);
    if (!receipt) throw Error("GUEST_ADOPTION_IDENTITY_READBACK_MISMATCH");
    // Compare every retained creation field, including structured destinations.
    const { operationId, tripId, ...initial } = trip.create;
    const {
      actorAccountId,
      ownerPersonId,
      coreEpoch: _epoch,
      coreRevision: _revision,
      coreAccessRevision: _access,
      ...created
    } = receipt;
    if (
      actorAccountId !== preparation.targetAccountId ||
      canonical(created) !==
        canonical({
          operationId,
          tripId,
          ...initial,
          ...("formatVersion" in trip.create ? { metadataRevision: 0 } : {}),
        }) ||
      (sourcePeople.has(ownerPersonId) && ownerPersonId !== trip.creator.personId)
    )
      fail();
    const mappings = [
      { sourcePersonId: trip.creator.personId, targetPersonId: ownerPersonId },
      ...trip.people.map((p) => ({
        sourcePersonId: p.personId,
        targetPersonId: p.personId,
      })),
    ];
    for (const mapping of mappings) {
      if (targets.has(mapping.targetPersonId)) fail();
      targets.add(mapping.targetPersonId);
    }
    const map = new Map(mappings.map((m) => [m.sourcePersonId, m.targetPersonId]));
    const person = (id: string) => {
      const target = map.get(id);
      if (!target) throw Error("GUEST_ADOPTION_IDENTITY_PERSON_MISMATCH");
      return target;
    };
    const intents = [];
    for (const original of trip.coreIntents) {
      const command = structuredClone(original.command);
      const payload = command.payload as {
        participation?: { people: string[]; selfPersonId: string | null };
        acl?: { people: string[] };
      };
      if (payload.participation) {
        payload.participation.people = payload.participation.people.map(person);
        if (payload.participation.selfPersonId !== null)
          payload.participation.selfPersonId = person(payload.participation.selfPersonId);
      }
      if (payload.acl) payload.acl.people = payload.acl.people.map(person);
      const mapped = validateCoreCommand(command);
      intents.push({
        operationId: mapped.operationId,
        sourceIntentSha256: original.sha256,
        mappedCanonicalText: canonical(mapped),
        mappedIntentSha256: await coreHashValue(
          "otr-trip-core-intent-v2",
          mapped,
          tripCoreSha256Hex,
        ),
      });
    }
    trips.push({ tripId, createReceipt: receipt, mappings, intents });
  }
  if (Date.parse(sealed.grant.expiresAt) <= Date.now())
    throw Error("GUEST_ADOPTION_GRANT_EXPIRED");
  // Drafts stay in the exact original plan; these saved-intent maps do not qualify restore.
  const canonicalText = canonical({
    schemaId: "otr.auth.guest-composite-identity/1",
    authority: "NONE",
    planSha256: plan.sha256,
    trips,
  });
  const sha256 = await tripCoreSha256Hex(new TextEncoder().encode(canonicalText));
  if (Date.parse(sealed.grant.expiresAt) <= Date.now())
    throw Error("GUEST_ADOPTION_GRANT_EXPIRED");
  return Object.freeze({
    canonicalText,
    sha256,
    authority: "NONE" as const,
  });
}

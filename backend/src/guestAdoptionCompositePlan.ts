import { z } from "zod";
import {
  guestTripDraftSnapshotSchema,
  guestTripDraftHasOnlyStaticCovers,
} from "../../src/domain/auth/guestTripDraft";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { guestAdoptionPreflightGrantSchema } from "../../src/domain/auth/guestAdoptionPreflight";
import {
  guestSourceCheckpointSchema,
  verifyGuestSourceCheckpoint,
} from "../../src/data/auth/guestTripP1SourceSchema";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";
import { isNormalAccount, type AuthenticatedAccount } from "./authAccountQualification";

import {
  guestAdoptionPreparationSchema,
  verifyGuestAdoptionDrafts,
} from "../../src/data/auth/guestAdoptionPreparation";

const canonical = (value: unknown) => canonicalCoreJson(value as Json);

// Internal review candidate only: no writer, grant creation, route or runtime consumer.
export async function prepareGuestAdoptionCompositePlan(
  user: AuthenticatedAccount,
  persistedStaging: unknown,
  preparedCheckpoint: unknown,
) {
  if (!isNormalAccount(user)) throw Error("NORMAL_ACCOUNT_REQUIRED");
  const actorAccountId = user.id;
  // Must come from the owning locked staging row, never the client payload.
  const staging = z
    .strictObject({
      grant: guestAdoptionPreflightGrantSchema,
      preparationSha256: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .parse(persistedStaging);
  const grant = staging.grant;
  const checkpoint = guestSourceCheckpointSchema.parse(preparedCheckpoint);
  if (checkpoint.sha256 !== staging.preparationSha256)
    throw Error("GUEST_ADOPTION_STAGING_SOURCE_MISMATCH");
  const input = guestAdoptionPreparationSchema.parse(
    JSON.parse(checkpoint.canonicalText),
  );
  if (input.schemaId !== "otr.auth.guest-adoption-recovery/3" || !input.source)
    throw Error("GUEST_ADOPTION_PREPARATION_VERSION_REQUIRED");
  if (
    canonical(input) !== checkpoint.canonicalText ||
    new TextEncoder().encode(checkpoint.canonicalText).byteLength !== checkpoint.bytes
  )
    throw Error("GUEST_ADOPTION_PREPARATION_INVALID");
  if (
    input.adoptionId !== grant.adoptionId ||
    input.targetAccountId !== grant.targetAccountId ||
    input.sourceGuestLocalId !== grant.sourceGuestLocalId ||
    input.inventorySha256 !== grant.inventorySha256
  )
    throw Error("GUEST_ADOPTION_PREPARATION_BINDING_MISMATCH");
  if (grant.targetAccountId !== actorAccountId)
    throw Error("GUEST_ADOPTION_TARGET_MISMATCH");
  const assertUnexpired = () => {
    if (Date.parse(grant.expiresAt) <= Date.now())
      throw Error("GUEST_ADOPTION_GRANT_EXPIRED");
  };
  assertUnexpired();
  if (grant.resources.files || grant.resources.fileBytes)
    throw Error("GUEST_ADOPTION_COMPOSITE_UNSUPPORTED_DATASET");
  if (
    (await tripCoreSha256Hex(new TextEncoder().encode(checkpoint.canonicalText))) !==
    checkpoint.sha256
  )
    throw Error("GUEST_ADOPTION_PREPARATION_INVALID");
  await verifyGuestAdoptionDrafts(input);
  for (const entry of input.drafts) {
    const tripDraft = guestTripDraftSnapshotSchema.safeParse(
      JSON.parse(entry.canonicalText),
    );
    if (tripDraft.success && !guestTripDraftHasOnlyStaticCovers(tripDraft.data))
      throw Error("GUEST_ADOPTION_COMPOSITE_UNSUPPORTED_DATASET");
  }
  const source = await verifyGuestSourceCheckpoint(input.source, {
    sourceGuestLocalId: grant.sourceGuestLocalId,
    tripIds: input.tripIds,
  });
  if (
    grant.resources.trips !== source.totals.trips ||
    grant.resources.people !== source.totals.people ||
    grant.resources.items !== source.totals.p1Items ||
    grant.resources.liveDrafts !== input.drafts.length
  )
    throw Error("GUEST_ADOPTION_RESOURCE_MISMATCH");
  for (const trip of source.trips) {
    const people = new Set([
      trip.creator.personId,
      ...trip.people.map((p) => p.personId),
    ]);
    for (const { command } of trip.coreIntents) {
      // Only known Person-bearing leaves; never recursively replace matching strings.
      const payload = command.payload as {
        participation?: { people: string[]; selfPersonId: string | null };
        acl?: { people: string[] };
      };
      const references = [
        ...(payload.participation?.people ?? []),
        ...(payload.acl?.people ?? []),
        ...(payload.participation?.selfPersonId
          ? [payload.participation.selfPersonId]
          : []),
      ];
      if (references.some((id) => !people.has(id)))
        throw Error("GUEST_ADOPTION_PERSON_REFERENCE_MISMATCH");
    }
  }
  // Exact source bytes retain original operations, dependencies, names and Ledger settings.
  const canonicalText = canonical({
    schemaId: input.drafts.length
      ? "otr.auth.guest-composite-plan/2"
      : "otr.auth.guest-composite-plan/1",
    authority: "NONE",
    grant,
    preparation: checkpoint,
  });
  const sha256 = await tripCoreSha256Hex(new TextEncoder().encode(canonicalText));
  assertUnexpired();
  return Object.freeze({ canonicalText, sha256, authority: "NONE" as const });
}

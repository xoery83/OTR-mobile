import { z } from "zod";
import { coreReadManifestSchema } from "@/domain/trip/tripCoreV2Read";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import type { AccountRequestContext } from "../auth/accountRequestContext";
import type { CoreAcceptedCertificate } from "../repositories/tripCoreV2Repository";

const stampSchema = coreReadManifestSchema
  .pick({
    epoch: true,
    revision: true,
    accessRevision: true,
    actorPersonBindingHash: true,
    participatingRosterHash: true,
  })
  .extend({ ordinaryOrderVersion: z.union([z.literal(0), z.literal(1)]) });
export type CoreVisibleVersionStamp = Readonly<z.infer<typeof stampSchema>>;
export const coreVisibleVersionResultSchema = z.strictObject({
  context: z.strictObject({
    accountId: coreUuid,
    tripId: coreUuid,
    generation: z.number().int().nonnegative(),
  }),
  compared: stampSchema,
  unchanged: z.boolean(),
});

// Owning adapter must check current per-Actor visibility, not a Trip-global counter.
export type CoreVisibleVersionRead = (
  context: AccountRequestContext,
  accepted: CoreVisibleVersionStamp,
) => Promise<unknown>;

export function acceptedVisibleVersion(certificate: CoreAcceptedCertificate) {
  return Object.freeze(
    stampSchema.parse({
      epoch: certificate.epoch,
      revision: JSON.parse(certificate.revision),
      accessRevision: certificate.access_revision,
      actorPersonBindingHash: certificate.actor_person_binding_hash,
      participatingRosterHash: certificate.roster_hash,
      ordinaryOrderVersion: certificate.ordinary_order_version,
    }),
  );
}
export function sameVisibleVersion(
  a: CoreVisibleVersionStamp,
  b: CoreVisibleVersionStamp,
) {
  return (Object.keys(a) as (keyof CoreVisibleVersionStamp)[]).every(
    (key) => a[key] === b[key],
  );
}

// No server comparison is qualified yet. Existing full reads remain the default.
export const tripVisibleVersionRead: CoreVisibleVersionRead | undefined = undefined;

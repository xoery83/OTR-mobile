import { z } from "zod";
import { coreUuid, coreText } from "@/domain/trip/tripCoreV2";
import type { ClaimResolutionScope } from "./claimResolutionContracts";

// Opaque input only. The HTTP body ceiling is not a product token-length specification.
export const claimOriginVerificationInputSchema = z.strictObject({
  requestId: coreUuid, inviteId: coreUuid, purpose: z.literal("PERSON_CLAIM"), token: z.string().min(1),
});
export const claimOriginVerificationSchema = z.strictObject({
  accountId: coreUuid, tripId: coreUuid, requestId: coreUuid, inviteId: coreUuid,
  purpose: z.literal("PERSON_CLAIM"), expiresAt: z.iso.datetime({ offset: true }), verified: z.literal(true),
});
export const claimGeneralInitialPersonsInputSchema = z.strictObject({
  requestId: coreUuid, inviteId: coreUuid, afterPersonId: coreUuid.nullable(),
});
export const claimGeneralInitialPersonsSchema = z.strictObject({
  version: z.literal(1), accountId: coreUuid, tripId: coreUuid, requestId: coreUuid, inviteId: coreUuid, tripName: coreText(256),
  expiresAt: z.iso.datetime({ offset: true }),
  persons: z.array(z.strictObject({ personId: coreUuid, displayName: coreText(256).refine(v => v.trim().length > 0) })).max(50),
  nextPersonId: coreUuid.nullable(),
}).superRefine((v, c) => {
  const ids = v.persons.map(p => p.personId);
  if (new Set(ids).size !== ids.length || (v.nextPersonId !== null && (ids.length !== 50 || v.nextPersonId !== ids.at(-1))))
    c.addIssue({ code: "custom", message: "CLAIM_GENERAL_PERSON_INDEX_BINDING" });
});
export interface ClaimOriginAuthority {
  initialPersons?(scope: ClaimResolutionScope, input: z.infer<typeof claimGeneralInitialPersonsInputSchema>):
    Promise<z.infer<typeof claimGeneralInitialPersonsSchema> | null>;
  // Must verify an owning issuer's actual purpose/token/lifecycle; requested purpose is not authority.
  verify(scope: ClaimResolutionScope, input: z.infer<typeof claimOriginVerificationInputSchema>):
    Promise<z.infer<typeof claimOriginVerificationSchema> | null>;
}

import { z } from "zod";
import { tripImportCatalogSchemas } from "./tripImportCatalogContracts";
import {
  canonicalEventJson,
  parseEventJson,
  type Json,
} from "@/domain/trip/eventIntentJson";
import { importDigest, type ImportHash } from "@/domain/trip/flightImportReview";

const run = tripImportCatalogSchemas.trip_source_runs;
export const publicationMembershipBodySchema = run
  .pick({
    actor_account_id: true,
    trip_id: true,
    operation_key: true,
    scope_source_ids: true,
    scope_sha256: true,
    generation: true,
    input_sha256: true,
    extractor_key: true,
    extractor_version: true,
    extractor_options_sha256: true,
  })
  .extend({
    version: z.literal(1),
    run_id: run.shape.id,
    candidates: z
      .array(
        tripImportCatalogSchemas.trip_source_candidates.pick({
          id: true,
          candidate_key: true,
          candidate_kind: true,
          proposal_version: true,
          proposal_sha256: true,
        }),
      )
      .max(64)
      .refine(
        (rows) =>
          new Set(rows.map((r) => r.candidate_key)).size === rows.length &&
          rows.every((r, i) => i === 0 || rows[i - 1].id < r.id),
      ),
  });
export const publicationMembershipEnvelopeSchema = z.strictObject({
  body: publicationMembershipBodySchema,
  body_sha256: run.shape.input_sha256,
});
export type PublicationMembership = z.infer<typeof publicationMembershipEnvelopeSchema>;
export const PUBLICATION_MEMBERSHIP_BYTES = 32768;
export async function sealPublicationMembership(
  body: z.infer<typeof publicationMembershipBodySchema>,
  hash: ImportHash,
) {
  body = publicationMembershipBodySchema.parse(body);
  const envelope = {
    body,
    body_sha256: await importDigest(
      "otr-source-run-publication-membership-v1",
      body as Json,
      hash,
    ),
  };
  const raw = canonicalEventJson(envelope as Json);
  if (new TextEncoder().encode(raw).byteLength > PUBLICATION_MEMBERSHIP_BYTES)
    throw new Error("PUBLICATION_MEMBERSHIP_RESOURCE_LIMIT");
  return raw;
}
export async function parsePublicationMembership(raw: string, hash: ImportHash) {
  if (typeof raw !== "string") throw new Error("PUBLICATION_MEMBERSHIP_INTEGRITY");
  const value = publicationMembershipEnvelopeSchema.parse(
    parseEventJson(raw, PUBLICATION_MEMBERSHIP_BYTES),
  );
  if ((await sealPublicationMembership(value.body, hash)) !== raw)
    throw new Error("PUBLICATION_MEMBERSHIP_INTEGRITY");
  return value;
}

import { importImageBytes } from "../../src/domain/trip/importImageEvidence";
import { universalPreparedText } from "../../src/domain/capture/universalPreparedText";
import { universalP1Identity } from "../../src/domain/trip/universalImportIdentity";
import { z } from "zod";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../../src/data/auth/accountRequestContext";
import { universalResultSchema } from "../../src/data/api/universalImportContracts";
import {
  qualifyImportLifecycleProposals,
  type ImportLifecycleSnapshot,
  type ImportLifecycleRequest,
} from "../../src/data/operations/importLifecycleProposal";
import { coreSourcePrepareV2Schema } from "../../src/domain/trip/tripCoreV2SourceContract";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import { coreDefaults, corePlaceSchema } from "../../src/domain/trip/tripCoreV2";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
import type { CoreActor, CoreGraph } from "../../src/domain/trip/tripCoreV2Mutation";
import { fieldRef } from "../../src/domain/trip/tripCoreV2CandidatePublication";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import type { CoreSourceCatalogV2 } from "./tripCoreV2Source";
import type { UniversalResult } from "./universalImport";
import {
  universalItemSourceReviewSchema,
  sourceReviewCivilDate,
} from "../../src/domain/trip/universalP1SourceReview";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const selectionSchema = z.strictObject({
  action: z.enum([
    "CONFIRM_NEW_P1",
    "CONFIRM_NEW_P3",
    "CONFIRM_NEW_P4",
    "CONFIRM_NEW_P5",
    "CONFIRM_NEW_P6",
  ]),
  token: z.string().min(1).max(128),
  resultSha256: digest,
  sourceReview: universalItemSourceReviewSchema.optional(),
});
export { universalP1Identity } from "../../src/domain/trip/universalImportIdentity";
// Typed adapter only. Callers supply owning current Source/Task/custody/Actor reads.
export async function projectUniversalP1Selection(
  input: {
    context: AccountRequestContext;
    snapshot: ImportLifecycleSnapshot;
    catalog: CoreSourceCatalogV2;
    runId: string;
    result: UniversalResult;
    resultSha256: string;
    selection: unknown;
    // Trusted owning lifecycle read only. Interpreter fields/user selection are not this qualification.
    // No runtime reader currently supplies it; omission must keep formal Source Save closed.
    owningLifecycleRelationships?: ImportLifecycleRequest["relationships"];
  },
  deps: { hash: ImportHash; getAccountId(): Promise<string> },
) {
  const { context, snapshot, catalog } = input;
  await assertAccountRequestContext(context, deps.getAccountId);
  const result = universalResultSchema.parse(input.result),
    selection = selectionSchema.parse(input.selection);
  if (
    selection.resultSha256 !== digest.parse(input.resultSha256) ||
    result.accountId !== context.accountId ||
    result.actorId !== context.accountId ||
    result.tripId !== context.tripId ||
    catalog.actorAccountId !== context.accountId ||
    catalog.tripId !== context.tripId ||
    result.providerOutcome !== "SETTLED" ||
    result.status !== "CANDIDATES_READY"
  )
    throw Error("UNIVERSAL_SELECTION_UNAVAILABLE");
  const candidates = result.candidates.filter((c) => c.token === selection.token),
    quality = result.quality?.decisions.filter((d) => d.token === selection.token);
  if (
    candidates.length !== 1 ||
    !["P1", "P3", "P4", "P5", "P6"].includes(candidates[0].kind) ||
    selection.action !== `CONFIRM_NEW_${candidates[0].kind}` ||
    candidates[0].subtype !==
      (candidates[0].kind === "P3"
        ? "ACCOMMODATION"
        : candidates[0].kind === "P4"
          ? "RENTAL_CAR"
          : candidates[0].kind === "P5"
            ? "TRAIN"
            : "ACTIVITY") ||
    quality?.length !== 1 ||
    (!selection.sourceReview && candidates[0].kind === "P1"
      ? quality[0].tier !== "HIGH_CONFIDENCE"
      : !["HIGH_CONFIDENCE", "REVIEWABLE"].includes(quality[0].tier))
  )
    throw Error("OWNING_REVIEW_REQUIRED");
  const candidate = structuredClone(candidates[0]);
  // Only changed prepared text needs re-anchoring; ambiguous original literals remain unresolved.
  for (const field of candidate.fields) {
    const bindings = result.sourceBindings.filter(
      (b) =>
        b.alias === field.sourceId &&
        b.sourceId === catalog.sourceId &&
        b.status === "READY",
    );
    if (bindings.length !== 1) throw Error("SOURCE_RELATION_QUALIFICATION_REQUIRED");
    const binding = bindings[0];
    if (binding.submittedSha256 === binding.originalSha256) continue;
    const materials = snapshot.materials.filter(
      (m) =>
        m.pin.id === binding.inputId &&
        m.pin.source_id === binding.sourceId &&
        m.pin.material_revision === binding.revision &&
        m.pin.representation_id === binding.representationId &&
        m.pin.payload_sha256 === binding.originalSha256,
    );
    if (
      materials.length !== 1 ||
      materials[0].form !== "TEXT" ||
      materials[0].media_type !== "text/plain"
    )
      throw Error("OWNING_MATERIAL_QUALIFICATION_REQUIRED");
    const bytes = Buffer.from(materials[0].text),
      prepared = Buffer.from(universalPreparedText(materials[0].text));
    if (
      (await deps.hash(bytes)) !== binding.originalSha256 ||
      (await deps.hash(prepared)) !== binding.submittedSha256 ||
      !("start" in field) ||
      field.end <= field.start ||
      field.end > prepared.length ||
      new TextDecoder("utf-8", { fatal: true }).decode(
        prepared.subarray(field.start, field.end),
      ) !== field.raw
    )
      throw Error("IMPORT_EVIDENCE_INVALID");
    const literal = Buffer.from(field.raw),
      start = bytes.indexOf(literal);
    if (start < 0 || bytes.indexOf(literal, start + 1) !== -1)
      throw Error("IMPORT_EVIDENCE_INVALID");
    field.start = start;
    field.end = start + literal.length;
  }
  const family = candidate.kind as "P1" | "P3" | "P4" | "P5" | "P6";
  if (["P4", "P5", "P6"].includes(family) && !selection.sourceReview)
    throw Error("OWNING_REVIEW_REQUIRED");
  if (
    ["P1", "P6"].includes(family) &&
    (candidate.bookingTokens.length || candidate.ticketTokens.length)
  )
    throw Error("OWNING_RELATION_QUALIFICATION_REQUIRED");
  const facts = (paths: string[]) => {
    const fields = candidate.fields.filter((f) => paths.includes(f.path));
    if (
      !fields.length ||
      fields.some((f) => f.uncertainty) ||
      new Set(fields.map((f) => f.raw)).size !== 1
    )
      throw Error("INCOMPLETE_SOURCE_EVIDENCE");
    return fields;
  };
  const review = selection.sourceReview;
  const withEnd =
    family === "P3" ||
    (family === "P4" &&
      review &&
      "endLocalDate" in review &&
      review.endLocalDate !== undefined);
  const nameFacts = facts(
      family === "P5"
        ? candidate.fields.some((f) => f.path === "service")
          ? ["service"]
          : ["service.number"]
        : family === "P3"
          ? ["property.name", "title"]
          : family === "P4"
            ? candidate.fields.some((f) => f.path === "title")
              ? ["title"]
              : ["rental.company", "agency.name"]
            : ["activity.name", "title"],
    ),
    // The installed Rental guard expects one title proof after alias agreement.
    names = family === "P4" ? nameFacts.slice(0, 1) : nameFacts,
    dates = facts(
      family === "P5"
        ? ["origin.local_date"]
        : family === "P3"
          ? ["check_in.date", "schedule.start.local_date"]
          : family === "P4"
            ? ["pickup.date", "schedule.start.local_date"]
            : ["activity.date", "schedule.start.local_date"],
    ),
    endDates = withEnd
      ? facts(
          family === "P4"
            ? ["return.date", "schedule.end.local_date"]
            : ["check_out.date", "schedule.end.local_date"],
        )
      : [];
  if (!names[0].raw.trim()) throw Error("INCOMPLETE_SOURCE_EVIDENCE");
  if (review && input.owningLifecycleRelationships?.some((r) => r.kind !== "NEW"))
    throw Error("LIFECYCLE_QUALIFICATION_REQUIRED");
  if (
    review &&
    snapshot.associations.some(
      (a) =>
        a.source_id === catalog.sourceId &&
        a.state === "ACTIVE" &&
        a.purpose === "CONFIRMED_SUPPORT",
    )
  )
    throw Error("LIFECYCLE_QUALIFICATION_REQUIRED");
  if (
    review &&
    (review.version !==
      (family === "P3"
        ? "otr.universal.p3-source-review/1"
        : family === "P4"
          ? "otr.universal.p4-source-review/1"
          : family === "P5"
            ? "otr.universal.p5-source-review/1"
            : family === "P6"
              ? "otr.universal.p6-source-review/1"
              : "otr.universal.p1-source-review/1") ||
      review.sourceRevision !== catalog.sourceRevision ||
      review.title !== names[0].raw ||
      review.localDate !== sourceReviewCivilDate(dates[0].raw) ||
      (withEnd &&
        (!("endLocalDate" in review) ||
          review.endLocalDate !== sourceReviewCivilDate(endDates[0].raw))))
  )
    throw Error("SOURCE_REVIEW_MISMATCH");
  const start = coreDateBoundary(review?.localDate ?? dates[0].raw),
    candidateId = universalP1Identity(result.taskId, candidate.token, "candidate"),
    slotId = universalP1Identity(result.taskId, candidate.token, "slot"),
    operationId = universalP1Identity(result.taskId, candidate.token, "operation"),
    targetId = universalP1Identity(result.taskId, candidate.token, "item");
  const end = withEnd
    ? coreDateBoundary(
        review && "endLocalDate" in review && review.endLocalDate
          ? review.endLocalDate
          : endDates[0].raw,
      )
    : null;
  if (
    end &&
    (family === "P3"
      ? end.local_date! <= start.local_date!
      : end.local_date! < start.local_date!)
  )
    throw Error(
      family === "P3" ? "INVALID_STAY_DATE_RANGE" : "INVALID_RENTAL_DATE_RANGE",
    );
  const transportTypes = family === "P5" ? facts(["transport_subtype"]) : [];
  const transportOperators =
    family === "P5" ? facts(["operator", "operator.name"]).slice(0, 1) : [];
  const transportNumbers = family === "P5" ? facts(["service.number"]) : [];
  if (
    family === "P5" &&
    (!transportOperators[0].raw.trim() || !transportNumbers[0].raw.trim())
  )
    throw Error("INCOMPLETE_SOURCE_EVIDENCE");
  if (transportTypes.length && transportTypes[0].raw !== candidate.subtype)
    throw Error("SOURCE_REVIEW_MISMATCH");
  const selectedFacts = [
    ["ROOT.title", names],
    ["START.local_date", dates],
    ...(family === "P5"
      ? ([
          ["SERVICE.main.transport_subtype", transportTypes],
          ["SERVICE.main.operator_literal", transportOperators],
          ["SERVICE.main.service_number", transportNumbers],
        ] as const)
      : []),
    ...(withEnd ? ([["END.local_date", endDates]] as const) : []),
  ] as const;
  const evidence: ImportLifecycleRequest["evidence"] = [];
  for (const [fieldKey, fields] of selectedFacts) {
    for (const [index, field] of fields.entries()) {
      const bindings = result.sourceBindings.filter(
        (b) =>
          b.alias === field.sourceId &&
          b.sourceId === catalog.sourceId &&
          b.status === "READY",
      );
      if (bindings.length !== 1) throw Error("SOURCE_RELATION_QUALIFICATION_REQUIRED");
      const b = bindings[0],
        materials = snapshot.materials.filter(
          (m) =>
            m.pin.id === b.inputId &&
            m.pin.source_id === b.sourceId &&
            m.pin.material_revision === b.revision &&
            m.pin.representation_id === b.representationId &&
            m.pin.payload_sha256 === b.originalSha256,
        );
      if (materials.length !== 1) throw Error("OWNING_MATERIAL_QUALIFICATION_REQUIRED");
      const material = materials[0];
      let locator: ImportLifecycleRequest["evidence"][number]["locator"];
      if (material.form === "IMAGE") {
        if (
          family !== "P1" ||
          !review ||
          !("region" in field) ||
          b.mime !== "image/png" ||
          b.pdfSource ||
          b.submittedSha256 !== b.originalSha256 ||
          field.region.imageSha256 !== b.originalSha256
        )
          throw Error("OWNING_REVIEW_REQUIRED");
        await importImageBytes(material, deps.hash);
        locator = {
          input_id: b.inputId,
          kind: "REGION",
          page: null,
          start: null,
          end: null,
          region: {
            x: field.region.x,
            y: field.region.y,
            width: field.region.width,
            height: field.region.height,
            coordinate_width: material.width,
            coordinate_height: material.height,
          },
          excerpt: field.raw,
        };
      } else {
        if (!("start" in field)) throw Error("OWNING_REVIEW_REQUIRED");
        const bytes = Buffer.from(material.text);
        if (
          field.end <= field.start ||
          field.end > bytes.length ||
          new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.subarray(field.start, field.end),
          ) !== field.raw
        )
          throw Error("IMPORT_EVIDENCE_INVALID");
        locator = {
          input_id: b.inputId,
          kind: "TEXT_SPAN",
          page: null,
          start: field.start,
          end: field.end,
          region: null,
          excerpt: field.raw,
        };
      }
      const reviewedDate =
        fieldKey === "END.local_date" && review && "endLocalDate" in review
          ? review.endLocalDate
          : review?.localDate;
      evidence.push({
        ref: fieldRef(candidateId, `${fieldKey}.${index}`),
        candidateId,
        fieldKey,
        raw: field.raw,
        ...(reviewedDate &&
        ["START.local_date", "END.local_date"].includes(fieldKey) &&
        field.raw !== reviewedDate
          ? {
              normalization: {
                rule: "ENGLISH_MONTH_CIVIL_DATE" as const,
                value: reviewedDate,
              },
            }
          : {}),
        locator,
      });
    }
  }
  const plan = coreSourcePrepareV2Schema.parse({
    captureVersion: 2,
    planId: universalP1Identity(result.taskId, candidate.token, "plan"),
    sourceId: catalog.sourceId,
    sourceRevision: catalog.sourceRevision,
    mode: "REVIEWED_SOURCE",
    policyVersion: null,
    candidateIds: [candidateId],
    slots: [
      {
        slotId,
        slotKey: family.toLowerCase(),
        candidateId,
        targetKind: "ITEM",
        target: { kind: "ITEM", id: targetId },
        command: "CREATE_ITEM",
        operationId,
        dependsOn: [],
        selectedFields: selectedFacts.map(([key]) => key),
        evidenceRefs: Object.fromEntries(
          selectedFacts.map(([k]) => [
            k,
            evidence.filter((e) => e.fieldKey === k).map((e) => e.ref),
          ]),
        ),
        baseVector: [{ kind: "ITEM", id: targetId, revision: null }],
        payload: {
          family,
          core: { title: names[0].raw },
          ...(family === "P5"
            ? {
                endpoints: {
                  origin: {
                    time: start,
                    place: Object.fromEntries(
                      Object.keys(corePlaceSchema.shape).map((k) => [k, null]),
                    ),
                  },
                  destination: {
                    time: { ...start, local_date: null },
                    place: Object.fromEntries(
                      Object.keys(corePlaceSchema.shape).map((k) => [k, null]),
                    ),
                  },
                },
                service: {
                  service_key: "main",
                  transport_subtype: candidate.subtype,
                  attribution: "UNSPECIFIED",
                  operator_namespace: "NAME",
                  operator_issuer: "NAME",
                  operator_value: transportOperators[0].raw,
                  operator_literal: transportOperators[0].raw,
                  service_number: transportNumbers[0].raw,
                  service_literal: names[0].raw,
                  codeshare_operating_key: null,
                },
              }
            : { schedule: { start, ...(end ? { end } : {}) } }),
          ...coreDefaults("member"),
        },
      },
    ],
  });
  const aliases = new Set(candidate.fields.map((f) => f.sourceId));
  const request: ImportLifecycleRequest = {
    version: "otr.import.lifecycle-proposal/1",
    plans: [plan],
    evidence,
    relationships: review
      ? [
          {
            id: `source-review:${candidateId}`,
            kind: "NEW",
            candidateIds: [candidateId],
            evidenceRefs: evidence.map((e) => e.ref),
          },
        ]
      : (input.owningLifecycleRelationships ?? []),
    rawIssues: result.unresolved
      .filter((u) => aliases.has(u.sourceId))
      .filter((u) => {
        if (
          review &&
          family === "P1" &&
          candidate.visualReviewRequired &&
          /^VISUAL_CANDIDATE_UNVERIFIED:(activity.name|activity.date)$/.test(u.reason)
        )
          return false;
        return (!review && family === "P1") || !p1UnselectedAdvisory(u.reason, family);
      })
      .map((u, i) => ({ id: `issue:${i}`, text: u.reason })),
    conflicts: [],
    commercialReviewRequests: [],
  };
  if (
    request.relationships.length !== 1 ||
    request.relationships[0].kind !== "NEW" ||
    request.relationships[0].candidateIds.length !== 1 ||
    request.relationships[0].candidateIds[0] !== candidateId ||
    request.rawIssues.length ||
    result.advisoryStatus === "INVALID" ||
    result.sourceObservations.some((o) =>
      canonicalCoreJson(o as Json).includes("AMENDMENT_NOTICE"),
    )
  )
    throw Error("LIFECYCLE_QUALIFICATION_REQUIRED");
  const body = {
    schemaId:
      family === "P3"
        ? ("otr.core.universal-p3-source/1" as const)
        : family === "P4"
          ? ("otr.core.universal-p4-source/1" as const)
          : family === "P5"
            ? ("otr.core.universal-p5-source/1" as const)
            : family === "P6"
              ? ("otr.core.universal-p6-source/1" as const)
              : review
                ? ("otr.core.universal-p1-source/2" as const)
                : ("otr.core.universal-p1-source/1" as const),
    ...(review ? { sourceReview: review, reviewedBy: context.accountId } : {}),
    accountId: context.accountId,
    tripId: context.tripId,
    sourceId: catalog.sourceId,
    sourceRevision: catalog.sourceRevision,
    taskId: result.taskId,
    batchId: result.batchId,
    resultSha256: input.resultSha256,
    token: candidate.token,
    candidateId,
    runId: z.uuid().parse(input.runId),
    inputCatalogSha256: catalog.inputCatalogSha256,
    plan,
    evidence,
    lifecycleRelationships: request.relationships,
    fieldEvidence: Object.fromEntries(
      evidence.map((e) => {
        const p = snapshot.materials.find((m) => m.pin.id === e.locator.input_id)!.pin;
        return [
          e.ref.slice(e.ref.lastIndexOf("/") + 1),
          {
            ref: e.ref,
            value: e.normalization?.value ?? e.raw,
            ...(review ? { raw: e.raw } : {}),
            ...(e.normalization ? { normalization: e.normalization } : {}),
            locator: e.locator,
            sourceId: p.source_id,
            sourceRevision: p.material_revision,
            representationId: p.representation_id,
            inputId: p.id,
            payloadSha256: p.payload_sha256,
          },
        ];
      }),
    ),
    ...(review
      ? {
          reviewedAdvisories: result.unresolved.filter(
            (u) => aliases.has(u.sourceId) && p1UnselectedAdvisory(u.reason, family),
          ),
        }
      : {}),
    sourceObservations: candidate.fields.filter(
      (f) =>
        !selectedFacts.some(([, fields]) => fields.some((selected) => selected === f)),
    ),
  };
  await assertAccountRequestContext(context, deps.getAccountId);
  return {
    body,
    request,
    candidateSha256: await coreHashValue(
      "otr-trip-core-source-candidate-v2",
      body as Json,
      deps.hash,
    ),
    grantsAdmission: false as const,
  };
}
export async function qualifyUniversalP1Selection(
  input: Parameters<typeof projectUniversalP1Selection>[0] & {
    actor: CoreActor;
    graph: CoreGraph;
  },
  deps: Parameters<typeof projectUniversalP1Selection>[1],
) {
  const proposal = await projectUniversalP1Selection(input, deps);
  const qualification = await qualifyImportLifecycleProposals(
    input.context,
    proposal.request,
    {
      actor: input.actor,
      graph: input.graph,
      snapshot: input.snapshot,
      ...(proposal.body.sourceReview?.version === "otr.universal.p1-source-review/1"
        ? {
            reviewedImageSource: {
              sourceId: proposal.body.sourceId,
              candidateId: proposal.body.candidateId,
              reviewedBy: proposal.body.reviewedBy!,
              review: proposal.body.sourceReview,
            },
          }
        : {}),
    },
    deps,
  );
  if (
    qualification.eligibleNewRecords.length !== 1 ||
    qualification.eligibleNewRecords[0].slotId !== proposal.body.plan.slots[0].slotId
  )
    throw Error("OWNING_REVIEW_REQUIRED");
  return { ...proposal, qualification };
}

// These exact advisories concern unselected fields or absent commercial rights, never lifecycle.
function p1UnselectedAdvisory(reason: string, family: "P1" | "P3" | "P4" | "P5" | "P6") {
  if (family === "P3") {
    if (
      reason ===
      "check-in and check-out times stated as unknown; no booking, guest, or place inferred"
    )
      return true;
    if (/^TEXT_MISSING_OR_AMBIGUOUS:(?:check_in.date|check_out.date)$/.test(reason))
      return false;
    if (
      /^TEXT_MISSING_OR_AMBIGUOUS:(?:stay.contact|stay.instructions|check_in.time|check_out.time)$/.test(
        reason,
      )
    )
      return true;
  }
  if (
    family === "P5" &&
    reason === "Transport type TRAIN stated but no origin/destination place given"
  )
    return true;
  return (
    /^(?:TEXT_MISSING_OR_AMBIGUOUS:(?:activity.time|check_in.date|check_out.time)|BUSINESS_ROLE_UNVERIFIED:(?:activity.venue|booking.supplier|booking.reference)|BOOKING_EVIDENCE_UNVERIFIED)$/.test(
      reason,
    ) ||
    reason === "Synthetic QA material; no real ticket, payment, or entitlement issued."
  );
}

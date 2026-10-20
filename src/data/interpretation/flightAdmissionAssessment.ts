import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import type { createFlightImportClosureOrchestrator } from "@/data/repositories/flightImportClosureOrchestrator";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import type { ClosureContext } from "@/domain/trip/flightImportClosure";
import type { FlightCandidateSet } from "./flightInterpretation";
import {
  projectFlightClosure,
  type FlightClosureChoices,
} from "./flightClosureProjection";

type Assessor = Pick<ReturnType<typeof createFlightImportClosureOrchestrator>, "assess">;
type Settings = Record<
  string,
  Omit<ClosureContext, "baselines" | "claims" | "lineageComplete">
>;

// Advisory projection only; the owning assessor rechecks catalog, claims and Event revisions.
export async function assessFlightAdmission(
  context: AccountRequestContext,
  source: FlightCandidateSet,
  choices: Record<string, FlightClosureChoices>,
  settings: Settings,
  assessor: Assessor,
  getAccountId: () => Promise<string>,
) {
  source = structuredClone(source);
  choices = structuredClone(choices);
  settings = structuredClone(settings);
  await assertAccountRequestContext(context, getAccountId);
  if (source.account_id !== context.accountId || source.trip_id !== context.tripId)
    throw new Error("IMPORT_SCOPE_MISMATCH");
  const view = projectFlightClosure(source, choices);
  const closure = await assessor.assess(context, view, settings);
  await assertAccountRequestContext(context, getAccountId);
  if (
    canonicalEventJson(closure.set as unknown as Json) !==
    canonicalEventJson(view as unknown as Json)
  )
    throw new Error("ASSESSMENT_BINDING_MISMATCH");
  return {
    version: 1 as const,
    authority: "ASSESSMENT_ONLY" as const,
    automaticAdmission: "NOT_AUTHORIZED" as const,
    userEditProtection: "CORE_REQUIRED" as const,
    source,
    closure,
    outputs: closure.plans.map((plan) => ({
      candidateId: plan.candidate.id,
      proposalSha256: plan.candidate.proposal_sha256,
      schemaId: "otr.import.flight" as const,
      action: plan.outcome,
      target: plan.target
        ? { eventId: plan.target.eventId, semanticRevision: plan.target.semanticRevision }
        : null,
      preparation:
        plan.closure === "READY" && plan.occurrence !== "NONE"
          ? ("REVIEW_REQUIRED" as const)
          : ("BLOCKED" as const),
      reasons: plan.reasons,
      deferred: plan.candidate.deferred_dimensions,
    })),
  };
}
export type FlightAdmissionAssessment = Awaited<ReturnType<typeof assessFlightAdmission>>;

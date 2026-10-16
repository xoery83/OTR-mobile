import {
  projectCaptureLocalFlightInterpretation,
  type CaptureLocalResult,
} from "./captureLocalInterpretation";
import {
  buildFlightAssemblyRequest,
  flightAssemblyModelPrompt,
  validateFlightAssemblyProposal,
  FLIGHT_ASSEMBLY_BUSINESS_CONTRACT,
  type FlightSemanticAssemblyDiagnostic,
} from "../trip/flightSemanticAssembly";

// Same pure assembly and validator serve normal Capture and diagnostic entry points.
export async function runCaptureFlightAssembly(
  result: CaptureLocalResult,
  capability: { status: "AVAILABLE" | "UNAVAILABLE"; reason?: string },
  propose: (requestJSON: string) => Promise<{
    status: "SUCCEEDED" | "UNAVAILABLE" | "FAILED";
    reason: string;
    proposal?: unknown;
  }>,
): Promise<FlightSemanticAssemblyDiagnostic | null> {
  const typed = projectCaptureLocalFlightInterpretation(result);
  if (!typed.assembly) return null;
  const deterministic = typed.assembly;
  const documents = [
    {
      inputId: result.inputId,
      text: result.text,
      originalSha256: result.originalSha256,
      originalByteCount: result.originalByteCount,
      parsed: {
        items: deterministic.contentBlocks.map((b) => b.observation),
        fragments: typed.fragments,
      },
    },
  ];
  const request = buildFlightAssemblyRequest(documents, deterministic);
  let execution: FlightSemanticAssemblyDiagnostic["execution"] = {
    status: "NOT_RUN",
    reason: "DETERMINISTIC_STRUCTURE_SUFFICIENT",
  };
  const unresolved =
    deterministic.segments.some((s) => s.associationPending) ||
    (deterministic.segments.some(
      (s) =>
        s.fields.some((f) => f.path === "service") &&
        !s.fields.some((f) => f.path === "origin.airport"),
    ) &&
      deterministic.segments.some((s) => !s.fields.some((f) => f.path === "service"))) ||
    deterministic.contentBlocks.length > deterministic.segments.length ||
    (deterministic.segments.length > 1 && !deterministic.bookingGroups.length);
  if (unresolved) {
    if (capability.status !== "AVAILABLE")
      execution = {
        status: "UNAVAILABLE",
        reason: capability.reason ?? "CAPABILITY_UNAVAILABLE",
      };
    else
      try {
        execution = await propose(flightAssemblyModelPrompt(request));
      } catch {
        execution = { status: "FAILED", reason: "LOCAL_MODEL_FAILED" };
      }
  }
  const validation =
    execution.status === "SUCCEEDED"
      ? validateFlightAssemblyProposal(request, execution.proposal)
      : null;
  return {
    contractVersion: FLIGHT_ASSEMBLY_BUSINESS_CONTRACT.version,
    request,
    deterministic,
    execution:
      validation?.status === "REJECTED"
        ? { ...execution, reason: "LOCAL_MODEL_EVIDENCE_REJECTED" }
        : execution,
    validation,
    finalBasis:
      validation?.status === "ACCEPTED" ? "VALIDATED_ADVISORY_PROPOSAL" : "DETERMINISTIC",
    canonicalWrites: false,
  };
}

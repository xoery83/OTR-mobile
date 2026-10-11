import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { admittedFlightBatch } from "./__fixtures__/flightInterpretation";
import { airNzTableText, deltaRebookingText } from "./__fixtures__/flightFirstStage1";
import { interpretFlightBatch } from "./flightInterpretation";
import {
  assessFlightInterpretationQuality,
  flightQualityBasisMatches,
} from "./flightInterpretationQuality";
import {
  CLOSED_FLIGHT_ENRICHMENT,
  decideFlightEnrichment,
} from "./flightEnrichmentDecision";
import { projectFlightEvidenceCoverage } from "./flightEvidenceCoverage";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";

const sha256 = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
async function replay(texts: string[]) {
  const batch = await admittedFlightBatch(texts);
  const getAccountId = async () => batch.request.binding.account_id;
  const set = await interpretFlightBatch(batch, {
    sha256,
    getAccountId,
    now: () => "2026-10-06T00:00:00Z",
  });
  return { batch, set, quality: assessFlightInterpretationQuality(set), getAccountId };
}
const numbered =
  "XY123 AKL→NSN 2030-12-14 dep=09:00 arr=10:35 arrDate=2030-12-14 depZone=Pacific/Auckland arrZone=Pacific/Auckland";
const availableProvider = () => ({
  ...structuredClone(CLOSED_FLIGHT_ENRICHMENT),
  online: true,
  provider: {
    authorized: true,
    available: true,
    licensed: true,
    coveredFields: [
      "terminal",
      "live_status",
      "destination.airport",
      "origin.local_time",
    ],
    freshness: "CURRENT" as const,
    priceKnown: true,
    costJustified: true,
  },
});

describe("pure Flight quality and enrichment", () => {
  it("Air NZ has two directionally separate candidates, supported civil facts and explicit service/zone gaps", async () => {
    const { set, quality } = await replay([airNzTableText]);
    expect(quality.structuralCoverage.candidateCount).toBe(2);
    const ordered = quality.structuralCoverage.orderedByInput[0].candidateIds.map((id) =>
      quality.fieldSupport.find((c) => c.candidateId === id)!,
    );
    expect(
      ordered.map((c) => c.fields.find((f) => f.path === "origin.local_date")?.value),
    ).toEqual(["2030-12-14", "2030-12-22"]);
    expect(ordered.every((c) => !c.providerLookupEligible)).toBe(true);
    for (const c of ordered) {
      expect(c.gaps.map((g) => g.path)).toContain("service");
      expect(c.gaps.map((g) => g.path)).toContain("origin.zone_id");
      expect(c.fields.every((f) => !f.automaticallyConfirmed)).toBe(true);
      expect(
        c.fields.find((f) => f.path === "origin.place_label")?.provenance.length,
      ).toBe(2);
      expect(c.fields.find((f) => f.path === "service")?.value).toBeNull();
    }
    expect(quality.admissionReadiness.grantsAuthority).toBe(false);
    expect(decideFlightEnrichment(quality).route).toBe("DEFER_UNTIL_CAPABILITY");
    expect(decideFlightEnrichment(quality, availableProvider()).route).not.toBe(
      "FLIGHT_PROVIDER",
    );
    expect(flightQualityBasisMatches(quality, set)).toBe(true);
  });
  it("Delta retains ordered service mentions without assigning segment timing or claiming relationship completeness", async () => {
    const { quality } = await replay([deltaRebookingText]);
    expect(quality.structuralCoverage.candidateCount).toBe(4);
    expect(quality.structuralCoverage.relationshipCompleteness).toBe("UNKNOWN");
    const ordered = quality.structuralCoverage.orderedByInput[0].candidateIds.map((id) =>
      quality.fieldSupport.find((c) => c.candidateId === id)!,
    );
    expect(
      ordered.map(
        (c) =>
          (
            c.fields.find((f) => f.path === "service")?.value as {
              service_literal: string;
            }
          ).service_literal,
      ),
    ).toEqual(["QF0140", "DL0040", "DL0799", "DL4714"]);
    expect(
      ordered.every(
        (c) =>
          !c.providerLookupEligible && c.gaps.some((g) => g.path === "origin.local_date"),
      ),
    ).toBe(true);
    expect(quality.authorityFreshness.liveFacts).toBe("NOT_VERIFIED");
    expect(decideFlightEnrichment(quality).route).toBe("DEFER_UNTIL_CAPABILITY");
  });
  it("complete supported critical facts avoid extra calls without granting Core permission", async () => {
    const { quality } = await replay([numbered]);
    expect(quality.fieldSupport[0].gaps).toEqual([]);
    expect(decideFlightEnrichment(quality).route).toBe("NONE");
    expect(quality.admissionReadiness.unknownSiblingFence).toBe("UNCHANGED");
    expect(quality.admissionReadiness.grantsAuthority).toBe(false);
    const remote = {
      ...structuredClone(CLOSED_FLIGHT_ENRICHMENT),
      online: true,
      remoteLlm: { authorized: true, available: true },
    };
    expect(decideFlightEnrichment(quality, remote).route).toBe("NONE");
  });
  it("fresh licensed price-evaluated provider is considered for exact service/date facts", async () => {
    const { quality } = await replay([numbered]);
    const decision = decideFlightEnrichment(quality, availableProvider(), ["terminal"]);
    expect(decision.route).toBe("FLIGHT_PROVIDER");
    expect(decision.targetFields).toEqual(["terminal"]);
    expect(decision.executionAuthorized).toBe(false);
    expect(decision.requiredEvidence).toContain("NOT_PASSENGER_BOOKING_PROOF");
    expect(decision.estimatedCost.monetaryMinor).toBeNull();
  });
  it.each([
    "offline",
    "closed",
    "unlicensed",
    "stale",
    "unknown-price",
    "unjustified-cost",
    "uncovered",
  ])(
    "defers live facts when provider is %s rather than substituting an LLM",
    async (reason) => {
      const { quality } = await replay([numbered]);
      const cap = availableProvider();
      cap.localModel = "AVAILABLE";
      cap.remoteLlm = { authorized: true, available: true };
      if (reason === "offline") cap.online = false;
      if (reason === "closed") cap.provider.authorized = false;
      if (reason === "unlicensed") cap.provider.licensed = false;
      if (reason === "stale") cap.provider.freshness = "STALE" as "CURRENT";
      if (reason === "unknown-price") cap.provider.priceKnown = false;
      if (reason === "unjustified-cost") cap.provider.costJustified = false;
      if (reason === "uncovered") cap.provider.coveredFields = [];
      expect(decideFlightEnrichment(quality, cap, ["live_status"]).route).toBe(
        "DEFER_UNTIL_CAPABILITY",
      );
    },
  );
  it("uses optional available local model, or separately authorized remote fallback, without a forced provider sequence", async () => {
    const { quality } = await replay([deltaRebookingText]);
    const local = {
      ...structuredClone(CLOSED_FLIGHT_ENRICHMENT),
      localModel: "AVAILABLE" as const,
    };
    expect(decideFlightEnrichment(quality, local).route).toBe("LOCAL_MODEL");
    const remote = {
      ...structuredClone(CLOSED_FLIGHT_ENRICHMENT),
      online: true,
      remoteLlm: { authorized: true, available: true },
    };
    const decision = decideFlightEnrichment(quality, remote);
    expect(decision.route).toBe("REMOTE_LLM");
    expect(decision.executionAuthorized).toBe(false);
    expect(decision.requiredEvidence).toContain("NO_UNSOURCED_CONFIRMATION");
    remote.remoteLlm.authorized = false;
    expect(decideFlightEnrichment(quality, remote).route).toBe("DEFER_UNTIL_CAPABILITY");
  });
  it("retains material conflict alternatives and requests review when verification cannot resolve them", async () => {
    const { set, quality } = await replay([numbered + " dep=11:00"]);
    const before = JSON.stringify(set);
    const field = quality.fieldSupport[0].fields.find(
      (f) => f.path === "origin.local_time",
    )!;
    expect(field.validation).toBe("CONFLICT");
    expect(field.conflicts[0].alternatives.length).toBe(2);
    expect(field.value).toBeNull();
    expect(decideFlightEnrichment(quality).route).toBe("HUMAN_REVIEW");
    const provider = decideFlightEnrichment(quality, availableProvider());
    expect(provider.route).toBe("FLIGHT_PROVIDER");
    expect(provider.fallback).toContain("HUMAN_REVIEW");
    expect(JSON.stringify(set)).toBe(before);
  });
  it("distinguishes source incompleteness from tool failure without mandatory review", async () => {
    const { set } = await replay([airNzTableText]);
    const id = set.publication_request.inputs[0].id;
    const incomplete = assessFlightInterpretationQuality(set, {
      inputIssues: [{ inputId: id, cause: "SOURCE_INCOMPLETE" }],
    });
    expect(incomplete.extractionCoverage[0].textRead).toBe(true);
    expect(incomplete.extractionCoverage[0].originalCompleteness).toBe("INCOMPLETE");
    const unavailable = assessFlightInterpretationQuality(set, {
      inputIssues: [{ inputId: id, cause: "CAPABILITY_UNAVAILABLE" }],
    });
    expect(unavailable.extractionCoverage[0].originalCompleteness).toBe("UNKNOWN");
    expect(decideFlightEnrichment(unavailable).route).toBe("DEFER_UNTIL_CAPABILITY");
    expect(() =>
      assessFlightInterpretationQuality(set, {
        inputIssues: [
          { inputId: "ca13b000-0000-4000-8000-000000009999", cause: "PARTIAL_READ" },
        ],
      }),
    ).toThrow("QUALITY_INPUT_MISMATCH");
  });
  it("rejects stale quality after revision/content changes and preserves immutable observations", async () => {
    const { set, quality } = await replay([numbered]);
    const changed = structuredClone(set);
    changed.publication_request.inputs[0].material_revision++;
    expect(flightQualityBasisMatches(quality, changed)).toBe(false);
    const accountChanged = structuredClone(set);
    accountChanged.account_id = "ca13b000-0000-4000-8000-000000009999";
    expect(flightQualityBasisMatches(quality, accountChanged)).toBe(false);
    accountChanged.run_generation++;
    expect(flightQualityBasisMatches(quality, accountChanged)).toBe(false);
    changed.interpretation_response_sha256 = "0".repeat(64);
    expect(flightQualityBasisMatches(quality, changed)).toBe(false);
    quality.fieldSupport[0].fields.find((f) => f.path === "service")!.value = "edit";
    expect(set.candidates[0].occurrence.service.value).not.toBe("edit");
    const again = assessFlightInterpretationQuality(set);
    expect(again).not.toEqual(quality);
  });
  it("authored endpoint conflicts are material and preserve competing labels", async () => {
    const { quality } = await replay([
      airNzTableText.replace("14 Dec 2030\nAuckland", "14 Dec 2030\nChristchurch"),
    ]);
    expect(
      quality.consistency.materialConflicts.some((c) => c.path === "origin.place_label"),
    ).toBe(true);
    expect(decideFlightEnrichment(quality).route).toBe("HUMAN_REVIEW");
  });
  it("does not query a complete numbered leg for another sparse leg's airport gap", async () => {
    const { quality } = await replay([numbered, "Flight AKL→SYD 2030-12-15 dep=11:00"]);
    expect(decideFlightEnrichment(quality, availableProvider()).route).not.toBe(
      "FLIGHT_PROVIDER",
    );
  });
  it("known incomplete source never implies NONE, even with a populated visible flight", async () => {
    const { set } = await replay([numbered]);
    const quality = assessFlightInterpretationQuality(set, {
      inputIssues: [
        { inputId: set.publication_request.inputs[0].id, cause: "SOURCE_INCOMPLETE" },
      ],
    });
    expect(decideFlightEnrichment(quality).route).toBe("DEFER_UNTIL_CAPABILITY");
    expect(decideFlightEnrichment(quality).reason).toBe(
      "SOURCE_INCOMPLETE_EVIDENCE_REQUIRED",
    );
  });
  it("projects every proposal family as derived evidence without confirmation", async () => {
    const { set, quality } = await replay([numbered]);
    const fields = quality.fieldSupport[0].proposedFields;
    expect(fields.map((f) => f.path)).toEqual(
      Object.keys(set.candidates[0].proposal.fields),
    );
    expect(
      fields.every((f) => f.provenance.length > 0 && !f.automaticallyConfirmed),
    ).toBe(true);
  });
  it("existing private evidence projection includes quality and closed routing with no extra runtime", async () => {
    const { batch, set, getAccountId } = await replay([airNzTableText]);
    const context = await captureAccountRequestContext(set.trip_id, getAccountId);
    const view = await projectFlightEvidenceCoverage(
      context,
      set,
      batch.request.materials,
      sha256,
      getAccountId,
    );
    expect(view.quality).toEqual(assessFlightInterpretationQuality(set));
    expect(view.enrichment.route).toBe("DEFER_UNTIL_CAPABILITY");
    expect(view.materials[0].text).toBe(airNzTableText);
  });
});

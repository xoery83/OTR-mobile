import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import {
  assessFlightCandidateSet,
  type ClosureContext,
} from "@/domain/trip/flightImportClosure";
import { admittedFlightBatch } from "./__fixtures__/flightInterpretation";
import { interpretFlightBatch, type FlightCandidateSet } from "./flightInterpretation";
import { assessFlightAdmission } from "./flightAdmissionAssessment";
import { projectFlightEvidenceCoverage } from "./flightEvidenceCoverage";

const sha256 = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const outbound = "NZ5069 AKL→CHC 2026-12-18 dep=10:30 depInstant=2026-12-17T21:30:00Z";
const returning = "NZ5070 CHC→AKL 2026-12-20 dep=18:00 depInstant=2026-12-20T05:00:00Z";
async function fixture(texts = [outbound]) {
  const batch = await admittedFlightBatch(texts);
  const getAccountId = async () => batch.request.binding.account_id;
  const source = await interpretFlightBatch(batch, {
    sha256,
    getAccountId,
    now: () => "2026-10-06T00:00:00Z",
  });
  const context = await captureAccountRequestContext(source.trip_id, getAccountId);
  const choices = Object.fromEntries(
    source.candidates.map((c) => [
      c.id,
      {
        output_purpose: c.candidate_key,
        continuity: null,
        lineage: [],
        resolution_plans: [],
      },
    ]),
  );
  const settings = Object.fromEntries(
    source.candidates.map((c) => [
      c.id,
      {
        scope: source.matching_scope,
        attention: {
          version: "import-attention-v1" as const,
          horizonHours: 24,
          now: "2026-10-06T00:00:00Z",
          clockOrigin: "SUPPLIED" as const,
        },
      },
    ]),
  );
  const assessor = {
    assess: vi.fn(async (_context, view, supplied) =>
      assessFlightCandidateSet(
        view,
        Object.fromEntries(
          source.candidates.map((c) => [
            c.id,
            {
              ...supplied[c.id],
              baselines: [],
              claims: [],
              lineageComplete: true,
            } satisfies ClosureContext,
          ]),
        ),
      ),
    ),
  };
  const assess = (set: FlightCandidateSet = source) =>
    assessFlightAdmission(context, set, choices, settings, assessor, getAccountId);
  return { batch, source, context, choices, settings, assessor, getAccountId, assess };
}

describe("Flight Candidate assessment projection", () => {
  it("retains two segments, consolidated evidence and stable Candidate identities without consent IDs", async () => {
    const f = await fixture([
      `${outbound}\n${returning}`,
      `${outbound} passenger=SYNTHETIC TRAVELLER; pnr=SYNTHETIC-ORDER; ticket=SYNTHETIC-TICKET; seat=12A; baggage=1 bag`,
    ]);
    const a = await f.assess();
    expect(a.outputs).toHaveLength(2);
    expect(a.outputs.every((o) => o.preparation === "REVIEW_REQUIRED")).toBe(true);
    expect(a.source).toEqual(f.source);
    expect(a.outputs.map((o) => o.candidateId)).toEqual(
      f.source.candidates.map((c) => c.id),
    );
    expect(a.outputs.every((o) => o.target === null)).toBe(true);
    expect(a).toMatchObject({
      authority: "ASSESSMENT_ONLY",
      automaticAdmission: "NOT_AUTHORIZED",
      userEditProtection: "CORE_REQUIRED",
    });
    expect(a).not.toHaveProperty("confirmationId");
    expect(await f.assess()).toEqual(a);
    const evidence = await projectFlightEvidenceCoverage(
      f.context,
      f.source,
      f.batch.request.materials,
      sha256,
      f.getAccountId,
    );
    expect(evidence.deferred.map((d) => d.dimension)).toEqual(
      expect.arrayContaining(["passengers", "bookings", "tickets", "seats", "baggage"]),
    );
    expect(evidence.deferred.every((d) => d.raw && d.pin.payload_sha256)).toBe(true);
  });
  it("preserves sparse Flight observations and does not invent endpoints, instant or arrival", async () => {
    const f = await fixture(["NZ5069 2026-12-18"]);
    const a = await f.assess();
    expect(a.outputs[0].preparation).toBe("BLOCKED");
    expect(a.source.candidates[0].occurrence["origin.local_date"].value).toBe(
      "2026-12-18",
    );
    expect(a.source.candidates[0].proposal.fields.origin).toBeUndefined();
    expect(a.source.candidates[0].proposal.fields.destination).toBeUndefined();
  });
  it("rejects foreign scope and stale Account generation before an owning assessment", async () => {
    const f = await fixture();
    await expect(
      f.assess({ ...f.source, trip_id: "00000000-0000-4000-8000-000000000001" }),
    ).rejects.toThrow("IMPORT_SCOPE_MISMATCH");
    expect(f.assessor.assess).not.toHaveBeenCalled();
    advanceAccountGeneration();
    await expect(f.assess()).rejects.toThrow();
    expect(f.assessor.assess).not.toHaveBeenCalled();
  });
  it("rejects a generation change while the owning assessment runs", async () => {
    const f = await fixture();
    const original = f.assessor.assess.getMockImplementation()!;
    f.assessor.assess.mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      advanceAccountGeneration();
      return result;
    });
    await expect(f.assess()).rejects.toThrow();
  });
  it("rejects a returned assessment for different evidence", async () => {
    const f = await fixture();
    const original = f.assessor.assess.getMockImplementation()!;
    f.assessor.assess.mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      result.set.id = "00000000-0000-4000-8000-000000000001";
      return result;
    });
    await expect(f.assess()).rejects.toThrow("ASSESSMENT_BINDING_MISMATCH");
  });
});

describe("private Flight evidence coverage", () => {
  it("preserves independent partial extraction coverage and every acquired representation", async () => {
    const f = await fixture([
      "NZ289 occurrence=malformed",
      outbound,
      "Permit text supplied separately",
    ]);
    const p = await projectFlightEvidenceCoverage(
      f.context,
      f.source,
      f.batch.request.materials,
      sha256,
      f.getAccountId,
    );
    expect(f.source.status).toBe("PARTIAL");
    expect(p.materials).toHaveLength(3);
    expect(p.coverage.map((c) => c.status)).toEqual(["FAILED", "PROCESSED", "PROCESSED"]);
    expect(p.unprocessedInputIds).toEqual([f.batch.request.materials[0].pin.id]);
    expect(p.coverage[2].unmapped[0].raw).toBe("Permit text supplied separately");
  });
  it("rejects a stale Account callback during evidence hashing", async () => {
    const f = await fixture();
    await expect(
      projectFlightEvidenceCoverage(
        f.context,
        f.source,
        f.batch.request.materials,
        async (bytes) => {
          advanceAccountGeneration();
          return sha256(bytes);
        },
        f.getAccountId,
      ),
    ).rejects.toThrow();
  });
  it.each(["past-end", "split-utf8", "negative"])(
    "rejects invalid %s locator without inventing raw values",
    async (kind) => {
      const f = await fixture([`${outbound}\n备注=保持原文`]);
      const source = structuredClone(f.source);
      const locator = source.coverage[0].ignored[0];
      if (kind === "past-end") locator.end = 1000000;
      if (kind === "split-utf8") locator.start!++;
      if (kind === "negative") locator.start = -1;
      await expect(
        projectFlightEvidenceCoverage(
          f.context,
          source,
          f.batch.request.materials,
          sha256,
          f.getAccountId,
        ),
      ).rejects.toThrow();
    },
  );
  it("retains ignored structured facts and mentioned attachments without acquiring them", async () => {
    const text = `${outbound}\nAttachment: permit.pdf (not supplied)\nmealPreference=vegetarian\n备注=保持原文`;
    const f = await fixture([text]);
    const p = await projectFlightEvidenceCoverage(
      f.context,
      f.source,
      f.batch.request.materials,
      sha256,
      f.getAccountId,
    );
    expect(p.access).toBe("OWNER_PRIVATE");
    expect(p.materials).toHaveLength(1);
    expect(p.materials[0].text).toBe(text);
    expect(p.coverage[0].unmapped.map((u) => u.raw).join("\n")).toContain(
      "mealPreference=vegetarian",
    );
    expect(p.coverage[0].unmapped.map((u) => u.raw).join("\n")).toContain(
      "备注=保持原文",
    );
    expect(p.coverage[0].unmapped.map((u) => u.raw).join("\n")).toContain("permit.pdf");
    expect(
      await projectFlightEvidenceCoverage(
        f.context,
        f.source,
        f.batch.request.materials,
        sha256,
        f.getAccountId,
      ),
    ).toEqual(p);
  });
  it.each(["text", "revision", "missing", "duplicate"])(
    "rejects mismatched %s evidence",
    async (kind) => {
      const f = await fixture();
      const materials = structuredClone(f.batch.request.materials);
      if (kind === "text") materials[0].text += " tampered";
      if (kind === "revision") materials[0].pin.material_revision++;
      if (kind === "missing") materials.pop();
      if (kind === "duplicate") materials.push(materials[0]);
      await expect(
        projectFlightEvidenceCoverage(
          f.context,
          f.source,
          materials,
          sha256,
          f.getAccountId,
        ),
      ).rejects.toThrow("EVIDENCE_INPUT_MISMATCH");
    },
  );
});

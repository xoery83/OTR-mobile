import { expect, it, vi } from "vitest";
import { parseReferenceFlightText } from "./referenceFlightExtractor";
import { assembleFlightDocuments } from "./flightAssembly";
import {
  buildFlightAssemblyRequest,
  flightAssemblyModelPrompt,
  validateFlightAssemblyProposal,
} from "./flightSemanticAssembly";
import { runCaptureFlightAssembly } from "../capture/captureFlightAssembly";
import { buildCaptureLocalResult } from "../capture/captureLocalInterpretation";
function setup(
  text = "Air New Zealand\nBooking reference: AB12CD\nAB123 route=AKL -> NSN date=2030-12-14\nAB124 route=NSN -> AKL date=2030-12-22",
) {
  const documents = [
    { inputId: "one", text, parsed: parseReferenceFlightText("one", text) },
  ];
  const assembly = assembleFlightDocuments(documents),
    request = buildFlightAssemblyRequest(documents, assembly);
  const fields = request.partB.fields,
    refs = fields.filter((f) => f.path === "booking.reference");
  const segments = request.partB.deterministicSegments.map((s, i) => {
    const fs = fields.filter(
      (f) => f.observationId && s.observationIds.includes(f.observationId),
    );
    return {
      id: `s${i}`,
      observationIds: s.observationIds,
      fieldIds: fs.map((f) => f.id),
      evidenceIds: [...new Set(fs.flatMap((f) => f.evidenceIds))],
      bookingGroupId: refs.length ? "b0" : "",
      basis: "Existing references only",
    };
  });
  const proposal = {
    segments,
    bookingGroups: refs.length
      ? [
          {
            id: "b0",
            referenceFieldIds: refs.map((f) => f.id),
            segmentIds: segments.map((s) => s.id),
            evidenceIds: [...new Set(refs.flatMap((f) => f.evidenceIds))],
            basis: "Explicit same reference",
          },
        ]
      : [],
    unresolved: [],
    conflicts: [],
  };
  return { request, proposal, text };
}
it("supplies stable Part A and exact current ID/evidence Part B, never a writable command", () => {
  const { request, proposal } = setup();
  expect(request.partA.version).toBe("otr.flight.semantic-assembly.v1");
  expect(request.partB.observations).toHaveLength(2);
  expect(request.sourceIds.o0).toMatch(/^item:one:/);
  const result = validateFlightAssemblyProposal(request, proposal);
  expect(result.status).toBe("ACCEPTED");
  expect(result.grantsAdmission).toBe(false);
  expect(result.segments.every((s) => s.readiness.grantsAdmission === false)).toBe(true);
});
it.each(["field", "evidence", "observation"])("rejects unknown %s references", (kind) => {
  const { request, proposal } = setup();
  if (kind === "field") proposal.segments[0].fieldIds.push("unknown");
  if (kind === "evidence") proposal.segments[0].evidenceIds.push("unknown");
  if (kind === "observation") proposal.segments[0].observationIds.push("unknown");
  expect(validateFlightAssemblyProposal(request, proposal).status).toBe("REJECTED");
});
it("rejects duplicate segments and silent field omission", () => {
  const { request, proposal } = setup();
  proposal.segments.push({ ...proposal.segments[0], id: "other" });
  expect(validateFlightAssemblyProposal(request, proposal).status).toBe("REJECTED");
  const b = setup();
  b.proposal.segments[0].fieldIds.pop();
  expect(validateFlightAssemblyProposal(b.request, b.proposal).reasonCodes).toContain(
    "OBSERVATIONS_SILENTLY_OMITTED",
  );
});
it("rejects cross-booking merging and invented field strings", () => {
  const { request, proposal } = setup(
    "Air New Zealand\nBooking reference: AB12CD\nAB123 route=AKL -> NSN date=2030-12-14\nBooking reference: CD34EF\nAB124 route=NSN -> AKL date=2030-12-22",
  );
  expect(validateFlightAssemblyProposal(request, proposal).reasonCodes).toContain(
    "CROSS_BOOKING_MERGE",
  );
  const b = setup();
  expect(
    validateFlightAssemblyProposal(b.request, {
      ...b.proposal,
      readiness: "READY",
      flightNumber: "AB999",
    }).status,
  ).toBe("REJECTED");
});
it("requires conflict alternatives instead of quietly selecting an airport", () => {
  const { request, proposal } = setup(
    "AB123 route=AKL -> NSN route=AKL -> CHC date=2030-12-14",
  );
  expect(validateFlightAssemblyProposal(request, proposal).reasonCodes).toContain(
    "UNREPORTED_FIELD_CONFLICT",
  );
  proposal.conflicts.push({
    fieldIds: request.partB.fields
      .filter((f) => f.path === "destination.airport")
      .map((f) => f.id),
    reason: "Conflicting printed airports",
  } as never);
  expect(validateFlightAssemblyProposal(request, proposal).status).toBe("ACCEPTED");
});
it("keeps deterministic results if Apple is unavailable or times out", async () => {
  const text = "AB123\nAB124";
  const result = buildCaptureLocalResult(
    "11111111-1111-4111-8111-111111111111",
    {
      engine: "utf8-text",
      text,
      originalSha256: "a".repeat(64),
      originalByteCount: text.length,
    },
    { sha256: "a".repeat(64), byteCount: text.length },
    "b".repeat(64),
    "UNAVAILABLE",
  );
  const propose = vi.fn();
  const absent = await runCaptureFlightAssembly(
    result,
    { status: "UNAVAILABLE", reason: "DEVICE_NOT_ELIGIBLE" },
    propose,
  );
  expect(propose).not.toHaveBeenCalled();
  expect(absent?.deterministic.segments).toHaveLength(2);
  expect(absent?.finalBasis).toBe("DETERMINISTIC");
  const failed = await runCaptureFlightAssembly(
    result,
    { status: "AVAILABLE" },
    async () => ({ status: "FAILED", reason: "LOCAL_MODEL_TIMEOUT" }),
  );
  expect(failed?.deterministic.segments).toHaveLength(2);
  expect(failed?.validation).toBeNull();
});

it("rejects cross-booking segment merges even when proposal omits booking groups", () => {
  const { request, proposal } = setup(
    "Air New Zealand\nBooking reference: AB12CD\nAB123 route=AKL -> NSN date=2030-12-14\nBooking reference: CD34EF\nAB123 route=AKL -> NSN date=2030-12-14",
  );
  proposal.segments = [
    {
      ...proposal.segments[0],
      bookingGroupId: "",
      observationIds: proposal.segments.flatMap((s) => s.observationIds),
      fieldIds: proposal.segments.flatMap((s) => s.fieldIds),
      evidenceIds: proposal.segments.flatMap((s) => s.evidenceIds),
    },
  ];
  proposal.bookingGroups = [];
  expect(validateFlightAssemblyProposal(request, proposal).reasonCodes).toContain(
    "CROSS_BOOKING_MERGE",
  );
});

it.each([false, true])(
  "rejects cross-Input unknown-issuer booking references (second unresolved: %s)",
  (deferSecond) => {
    const documents = ["one", "two"].map((inputId, index) => {
      const text = `Booking reference: AB12CD\nAB12${index + 3} route=AKL -> NSN date=2030-12-14`;
      return { inputId, text, parsed: parseReferenceFlightText(inputId, text) };
    });
    const assembly = assembleFlightDocuments(documents);
    const request = buildFlightAssemblyRequest(documents, assembly);
    expect(request.partB.deterministicBookingGroups).toHaveLength(2);
    expect(request.partB.deterministicBookingGroups.every((g) => g.issuer === null)).toBe(
      true,
    );
    const refs = request.partB.fields.filter((f) => f.path === "booking.reference");
    const segments = request.partB.deterministicSegments.map((segment, index) => {
      const fields = request.partB.fields.filter(
        (field) =>
          field.observationId && segment.observationIds.includes(field.observationId),
      );
      return {
        id: `s${index}`,
        observationIds: segment.observationIds,
        fieldIds: fields.map((f) => f.id),
        evidenceIds: [...new Set(fields.flatMap((f) => f.evidenceIds))],
        bookingGroupId: "b0",
        basis: "Same printed reference",
      };
    });
    const result = validateFlightAssemblyProposal(request, {
      segments: deferSecond ? segments.slice(0, 1) : segments,
      bookingGroups: [
        {
          id: "b0",
          referenceFieldIds: refs.map((f) => f.id),
          segmentIds: (deferSecond ? segments.slice(0, 1) : segments).map((s) => s.id),
          evidenceIds: [...new Set(refs.flatMap((f) => f.evidenceIds))],
          basis: "Same printed reference",
        },
      ],
      unresolved: deferSecond
        ? [
            {
              fieldIds: segments[1].fieldIds,
              observationIds: segments[1].observationIds,
              reason: "Needs review",
              reviewQuestion: "Resolve second observation",
            },
          ]
        : [],
      conflicts: [],
    });
    expect(result.status).toBe("REJECTED");
    expect(result.reasonCodes).toContain("CROSS_BOOKING_MERGE");
  },
);

it("compacts model evidence losslessly without changing field or evidence IDs", () => {
  const { request } = setup();
  const prompt = JSON.parse(flightAssemblyModelPrompt(request));
  expect(prompt.partA).toEqual(request.partA);
  expect(
    prompt.partB.fields.map((row: unknown[]) =>
      Object.fromEntries(
        prompt.partB.fieldColumns.map((key: string, i: number) => [key, row[i]]),
      ),
    ),
  ).toEqual(request.partB.fields.map((f) => ({ ...f, issuer: f.issuer ?? null })));
  expect(
    prompt.partB.evidence.map((row: unknown[]) =>
      Object.fromEntries(
        prompt.partB.evidenceColumns.map((key: string, i: number) => [key, row[i]]),
      ),
    ),
  ).toEqual(request.partB.evidence);
});

import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { captureFlightFixture } from "./__fixtures__/captureFlightCoreV2";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import {
  buildCaptureFlightPublicationV2,
  buildCaptureFlightSourcePlanV2,
} from "./captureFlightCoreV2";
import {
  publicationTestHash as hash,
  publicationTestAirport,
} from "../../../backend/src/__fixtures__/tripCoreV2CandidatePublication";
import { extractCoreFlightPublication } from "../../../backend/src/tripCoreV2CandidatePublication";

it("preserves two Candidate IDs, complete Input hashes and exact Capture byte locators; owning publication qualifies both", async () => {
  const f = await captureFlightFixture();
  const p = f.built.publication;
  expect(p.candidates.map((c) => c.candidateId)).toEqual(
    f.set.candidates.map((c) => c.id),
  );
  expect(p.inputCatalogSha256).toBe(f.set.input_sha256);
  const sealed = await extractCoreFlightPublication(
    p,
    f.batch.request.materials,
    f.context.accountId,
    f.context.tripId,
    hash,
    publicationTestAirport,
  );
  expect(sealed.sealed.map((c) => c.status)).toEqual(["QUALIFIED", "QUALIFIED"]);
  expect(
    p.evidence.every((e) =>
      f.set.fragments.some(
        (fragment) => JSON.stringify(fragment.locator) === JSON.stringify(e.locator),
      ),
    ),
  ).toBe(true);
  expect(
    p.candidates.every(
      (c) => !Object.keys(c).some((k) => /purpose|qualified|certificate/i.test(k)),
    ),
  ).toBe(true);
});
it("keeps stable caller IDs and receipt-dependent qualification without a second writer", async () => {
  const f = await captureFlightFixture();
  const identities = f.built.publication.candidates.map((c) => ({
    candidateId: c.candidateId,
    itemId: randomUUID(),
    createSlotId: randomUUID(),
    createOperationId: randomUUID(),
    qualifySlotId: randomUUID(),
    qualifyOperationId: randomUUID(),
  }));
  const planId = randomUUID();
  const first = buildCaptureFlightSourcePlanV2(f.built.publication, planId, identities);
  expect(buildCaptureFlightSourcePlanV2(f.built.publication, planId, identities)).toEqual(
    first,
  );
  expect(first.slots).toHaveLength(4);
  expect(
    first.slots
      .filter((s) => s.command === "QUALIFY_FLIGHT")
      .every((s) => s.baseVector === null && s.dependsOn.length === 1),
  ).toBe(true);
  expect(new Set(first.slots.map((s) => s.target.id)).size).toBe(2);
  expect(() =>
    buildCaptureFlightSourcePlanV2(f.built.publication, planId, [
      identities[0],
      identities[0],
    ]),
  ).toThrow("INVALID_SOURCE_PLAN");
});
it("unqualified airports are REVIEW under the owning extractor", async () => {
  const f = await captureFlightFixture();
  const sealed = await extractCoreFlightPublication(
    f.built.publication,
    f.batch.request.materials,
    f.context.accountId,
    f.context.tripId,
    hash,
    async () => null,
  );
  expect(sealed.sealed.every((c) => c.status === "REVIEW")).toBe(true);
});
it("retiming siblings stay REVIEW rather than dropping the competing observation", async () => {
  const f = await captureFlightFixture(
    "NZ1 AKL→CHC 2026-12-17 dep=10:30\nNZ1 AKL→CHC 2026-12-17 dep=11:30",
  );
  expect(f.built.publication.candidates).toHaveLength(2);
  const sealed = await extractCoreFlightPublication(
    f.built.publication,
    f.batch.request.materials,
    f.context.accountId,
    f.context.tripId,
    hash,
    publicationTestAirport,
  );
  expect(sealed.sealed.every((c) => c.status === "REVIEW")).toBe(true);
});
it("modified Source bytes and switched accounts fail before publication", async () => {
  const f = await captureFlightFixture();
  await expect(
    buildCaptureFlightPublicationV2(
      f.context,
      f.set,
      f.batch.request.materials.map((m) => ({ ...m, text: m.text + "x" })),
      randomUUID(),
      hash,
      f.getAccountId,
    ),
  ).rejects.toThrow("EVIDENCE_INPUT_MISMATCH");
  advanceAccountGeneration();
  await expect(
    buildCaptureFlightPublicationV2(
      f.context,
      f.set,
      f.batch.request.materials,
      randomUUID(),
      hash,
      f.getAccountId,
    ),
  ).rejects.toThrow("Account changed");
});

it("does not discard a Capture edit to manufacture an evidence-grounded title", async () => {
  const f = await captureFlightFixture();
  const edited = structuredClone(f.set);
  edited.candidates[0].proposal.fields.title!.proposed_value = "Edited Capture title";
  const built = await buildCaptureFlightPublicationV2(
    f.context,
    edited,
    f.batch.request.materials,
    randomUUID(),
    hash,
    f.getAccountId,
  );
  expect(built.publication.candidates[0].facts.core?.title).toBe("Edited Capture title");
  const checked = await extractCoreFlightPublication(
    built.publication,
    f.batch.request.materials,
    f.context.accountId,
    f.context.tripId,
    hash,
    publicationTestAirport,
  );
  expect(checked.sealed[0].status).toBe("REVIEW");
});

it("preserves a known Canonical target hint instead of presenting it as a fresh unrelated CREATE", async () => {
  const f = await captureFlightFixture();
  const set = structuredClone(f.set),
    existingId = randomUUID();
  set.matching_scope.occurrences = [
    { ...set.candidates[0].anchors[0], eventId: existingId, semanticRevision: 7 },
  ];
  const built = await buildCaptureFlightPublicationV2(
    f.context,
    set,
    f.batch.request.materials,
    randomUUID(),
    hash,
    f.getAccountId,
  );
  expect(built.publication.candidates[0].existingTargetHint).toEqual({
    kind: "ITEM",
    id: existingId,
    revision: 7,
  });
  const checked = await extractCoreFlightPublication(
    built.publication,
    f.batch.request.materials,
    f.context.accountId,
    f.context.tripId,
    hash,
    publicationTestAirport,
  );
  expect(checked.sealed[0].status).toBe("REVIEW");
});

it("qualifies the minimal date-only P2 input without inventing clocks, places or commercial authority", async () => {
  const f = await captureFlightFixture("NZ501 AKL→CHC 2026-11-02\n");
  const p = f.built.publication;
  const result = await extractCoreFlightPublication(
    p,
    f.batch.request.materials,
    f.context.accountId,
    f.context.tripId,
    hash,
    publicationTestAirport,
  );
  expect(result.sealed).toHaveLength(1);
  expect(result.sealed[0].status).toBe("QUALIFIED");
  expect(result.sealed[0].identityFacts).toMatchObject({
    operator: "NZ",
    serviceNumber: "501",
    originDate: "2026-11-02",
    originAirportId: "IATA_AIRPORT:AKL",
    destinationAirportId: "IATA_AIRPORT:CHC",
  });
  const facts = result.sealed[0].candidate.facts;
  expect(facts.origin?.time).toMatchObject({
    local_date: "2026-11-02",
    local_time: null,
    zone_id: null,
    source_instant: null,
  });
  expect(facts.destination?.time).toMatchObject({
    local_date: null,
    local_time: null,
    zone_id: null,
    source_instant: null,
  });
  expect(facts.origin?.location.accepted_place_id).toBeNull();
  expect(facts.destination?.location.accepted_place_id).toBeNull();
  const identities = [
    {
      candidateId: p.candidates[0].candidateId,
      itemId: randomUUID(),
      createSlotId: randomUUID(),
      createOperationId: randomUUID(),
      qualifySlotId: randomUUID(),
      qualifyOperationId: randomUUID(),
    },
  ];
  const plan = buildCaptureFlightSourcePlanV2(p, randomUUID(), identities);
  expect(plan.slots.map((s) => s.command)).toEqual([
    "CREATE_SPARSE_FLIGHT",
    "QUALIFY_FLIGHT",
  ]);
  expect(plan.slots[1].dependsOn).toEqual([identities[0].createSlotId]);
  expect(plan.slots[1].baseVector).toBeNull();
  expect(new Set(plan.slots.map((s) => s.target.id)).size).toBe(1);
});

it("explicit Sparse-only planning never auto-qualifies or copies endpoint facts", async () => {
  const f = await captureFlightFixture();
  const ids = f.built.publication.candidates.map((c) => ({
    candidateId: c.candidateId,
    itemId: randomUUID(),
    createSlotId: randomUUID(),
    createOperationId: randomUUID(),
    qualifySlotId: randomUUID(),
    qualifyOperationId: randomUUID(),
  }));
  const planId = randomUUID();
  const plan = buildCaptureFlightSourcePlanV2(
    f.built.publication,
    planId,
    ids,
    "SPARSE_ONLY",
  );
  expect(plan.slots).toHaveLength(ids.length);
  for (const [index, slot] of plan.slots.entries()) {
    expect(slot.command).toBe("CREATE_SPARSE_FLIGHT");
    expect(slot.operationId).toBe(ids[index].createOperationId);
    expect(slot.target.id).toBe(ids[index].itemId);
    expect(slot.selectedFields).toEqual(["flightNumberLiteral", "departureDate"]);
    expect(Object.keys(slot.payload as object).sort()).toEqual([
      "acl",
      "departureDate",
      "flightNumberLiteral",
      "participation",
    ]);
  }
  expect(
    buildCaptureFlightSourcePlanV2(f.built.publication, planId, ids, "SPARSE_ONLY"),
  ).toEqual(plan);
  expect(
    buildCaptureFlightSourcePlanV2(f.built.publication, planId, ids).slots,
  ).toHaveLength(ids.length * 2);
});

it("keeps the actual 27-byte P2 input unresolved without owning airport authority, even for Sparse-only", async () => {
  const f = await captureFlightFixture("NZ501 AKL→CHC 2026-11-02\n");
  expect(Buffer.byteLength(f.batch.request.materials[0].text)).toBe(27);
  const checked = await extractCoreFlightPublication(
    f.built.publication,
    f.batch.request.materials,
    f.context.accountId,
    f.context.tripId,
    hash,
    async () => null,
  );
  expect(checked.sealed).toHaveLength(1);
  expect(checked.sealed[0]).toMatchObject({
    status: "REVIEW",
    errorCode: "UNRESOLVED_IDENTITY",
    identityFacts: null,
    airportBindings: [],
  });
  expect(
    f.built.publication.candidates[0].facts.origin?.location.accepted_place_id,
  ).toBeNull();
  expect(f.built.publication.candidates[0].facts.origin?.time.local_time).toBeNull();
});

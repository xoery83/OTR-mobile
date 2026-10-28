import { universalResultSchema } from "../../src/data/api/universalImportContracts";
import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { universalP1SourceFixture as fixture } from "./__fixtures__/universalP1Source";
it("uses frozen P1 facts, original UTF8 byte spans and the approved lifecycle qualifier", async () => {
  const f = await fixture(),
    r = await f.run();
  expect(r.grantsAdmission).toBe(false);
  expect(r.qualification.eligibleNewRecords).toHaveLength(1);
  expect(r.body.plan.slots[0].command).toBe("CREATE_ITEM");
  expect(r.body.plan.mode).toBe("REVIEWED_SOURCE");
  for (const e of r.body.evidence)
    expect(
      Buffer.from(f.input.snapshot.materials[0].text)
        .subarray(e.locator.start!, e.locator.end!)
        .toString(),
    ).toBe(e.raw);
  expect((await f.run()).candidateSha256).toBe(r.candidateSha256);
});
it.each([
  "scope",
  "result",
  "bytes",
  "source",
  "image",
  "partial",
  "unknown",
  "amendment",
])("rejects %s without a Manual fallback", async (kind) => {
  const f = await fixture();
  if (kind === "scope") f.input.result.accountId = randomUUID();
  if (kind === "result") f.input.selection.resultSha256 = "c".repeat(64);
  if (kind === "bytes") f.input.snapshot.materials[0].text = "changed";
  if (kind === "source") f.input.result.sourceBindings[0].sourceId = randomUUID();
  if (kind === "image")
    (f.input.result.candidates[0] as any).fields[0] = {
      sourceId: "S0",
      path: "activity.name",
      raw: "海滨散步",
      region: {
        imageSha256: "a".repeat(64),
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        unit: "PIXELS",
      },
    };
  if (kind === "partial") f.input.result.quality!.decisions[0].tier = "REVIEWABLE";
  if (kind === "unknown") f.input.result.providerOutcome = "UNKNOWN";
  if (kind === "amendment")
    f.input.result.unresolved.push({
      sourceId: "S0",
      reason: "amendment target unavailable",
    });
  await expect(f.run()).rejects.toThrow();
});
it("preserves optional evidence as Source observations, not false Canonical fields", async () => {
  const f = await fixture(),
    raw = "West gate",
    start = Buffer.from(f.input.snapshot.materials[0].text).indexOf(raw);
  (f.input.result.candidates[0] as any).fields.push({
    sourceId: "S0",
    path: "meeting_point",
    raw,
    start,
    end: start + raw.length,
  });
  const r = await f.run();
  expect(r.body.sourceObservations).toEqual([
    expect.objectContaining({ path: "meeting_point", raw, start }),
  ]);
  expect(r.body.plan.slots[0].selectedFields).toEqual(["ROOT.title", "START.local_date"]);
});
it("does not save or merge another unconfirmed candidate", async () => {
  const f = await fixture(),
    before = structuredClone(f.input.result.candidates[0]);
  f.input.result.candidates.push({ ...(before as object), token: "other" });
  const r = await f.run();
  expect(r.body.plan.candidateIds).toHaveLength(1);
  expect(f.input.result.candidates[0]).toEqual(before);
  f.input.selection.token = "other";
  await expect(f.run()).rejects.toThrow();
});
it("fences a changed Account", async () => {
  const f = await fixture();
  f.deps.getAccountId = async () => randomUUID();
  await expect(f.run()).rejects.toThrow();
});

it("does not manufacture NEW from selection or omitted cancellation observations", async () => {
  const f = await fixture();
  const text =
    f.input.snapshot.materials[0].text +
    "\nCancellation notice: this activity has been cancelled. Do not create a replacement.";
  const sha = createHash("sha256").update(text).digest("hex");
  f.input.snapshot.materials[0].text = text;
  f.input.snapshot.materials[0].pin.payload_sha256 = sha;
  f.input.snapshot.materials[0].pin.byte_count = Buffer.byteLength(text);
  f.input.result.sourceBindings[0].originalSha256 = sha;
  f.input.result.sourceBindings[0].submittedSha256 = sha;
  Object.assign(f.input, { owningLifecycleRelationships: undefined });
  await expect(f.run()).rejects.toThrow("LIFECYCLE_QUALIFICATION_REQUIRED");
});
it.each(["AMENDMENT", "CANCELLATION", "DUPLICATE", "UNRELATED"])(
  "never downgrades owning %s into NEW",
  async (kind) => {
    const f = await fixture();
    Object.assign(f.input.owningLifecycleRelationships[0], { kind });
    await expect(f.run()).rejects.toThrow();
  },
);

it("qualifies an explicit review of REVIEWABLE original civil-date evidence", async () => {
  const raw = "Nov 1, 2026",
    f = await fixture(undefined, undefined, raw);
  f.input.result.quality!.decisions[0].tier = "REVIEWABLE";
  Object.assign(f.input, { owningLifecycleRelationships: undefined });
  Object.assign(f.input.selection, {
    sourceReview: {
      version: "otr.universal.p1-source-review/1",
      decision: "NEW",
      sourceRevision: 1,
      title: "海滨散步",
      localDate: "2026-11-01",
      originalReviewed: true,
      tripReviewed: true,
    },
  });
  f.input.result.unresolved.push(
    ...[
      "Synthetic QA material; no real ticket, payment, or entitlement issued.",
      "TEXT_MISSING_OR_AMBIGUOUS:activity.time",
      "TEXT_MISSING_OR_AMBIGUOUS:check_in.date",
      "TEXT_MISSING_OR_AMBIGUOUS:check_out.time",
      "BUSINESS_ROLE_UNVERIFIED:activity.venue",
      "BUSINESS_ROLE_UNVERIFIED:booking.supplier",
      "BUSINESS_ROLE_UNVERIFIED:booking.reference",
      "BOOKING_EVIDENCE_UNVERIFIED",
    ].map((reason) => ({ sourceId: "S0", reason })),
  );
  const result = await f.run();
  expect(result.body.reviewedAdvisories).toHaveLength(8);
  expect(result.body.schemaId).toBe("otr.core.universal-p1-source/2");
  expect(result.qualification.eligibleNewRecords).toHaveLength(1);
  expect(result.body.evidence.find((e) => e.fieldKey === "START.local_date")!.raw).toBe(
    raw,
  );
  expect(result.body.fieldEvidence["START.local_date.0"].value).toBe("2026-11-01");
  f.input.result.unresolved.push({
    sourceId: "S0",
    reason: "Cancellation notice: target unavailable",
  });
  await expect(f.run()).rejects.toThrow("LIFECYCLE_QUALIFICATION_REQUIRED");
  f.input.result.unresolved.pop();
  Object.assign((f.input.selection as any).sourceReview, { localDate: "2026-11-02" });
  await expect(f.run()).rejects.toThrow("SOURCE_REVIEW_MISMATCH");
});

it.each([
  "revision",
  "title",
  "date",
  "not-read",
  "decision",
  "owning-cancellation",
  "booking",
  "invalid-date",
])("rejects explicit review with %s", async (kind) => {
  const f = await fixture(undefined, undefined, "Nov 1, 2026");
  f.input.result.quality!.decisions[0].tier = "REVIEWABLE";
  const review = {
    version: "otr.universal.p1-source-review/1",
    decision: "NEW",
    sourceRevision: 1,
    title: "海滨散步",
    localDate: "2026-11-01",
    originalReviewed: true,
    tripReviewed: true,
  };
  if (kind === "revision") review.sourceRevision = 2;
  if (kind === "title") review.title = "Forged";
  if (kind === "date") review.localDate = "2026-11-02";
  if (kind === "invalid-date") review.localDate = "2026-02-30";
  if (kind === "not-read") review.originalReviewed = false;
  if (kind === "decision") review.decision = "AMENDMENT";
  if (kind === "owning-cancellation")
    Object.assign(f.input.owningLifecycleRelationships[0], { kind: "CANCELLATION" });
  if (kind === "booking")
    Object.assign(f.input.result.candidates[0] as object, { bookingTokens: ["b1"] });
  Object.assign(f.input.selection, { sourceReview: review });
  await expect(f.run()).rejects.toThrow();
});

async function normalizedTextFixture(suffix = "", bom = false) {
  const f = await fixture();
  const text =
    (bom ? "\uFEFF" : "") +
    "中文😀\r\n\r\n\r\n" +
    f.input.snapshot.materials[0].text.replace(/\n/g, " \t\r\n") +
    suffix;
  const sha = createHash("sha256").update(text).digest("hex");
  const submitted = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  const prefix = Buffer.byteLength("中文😀\n\n");
  const candidate = universalResultSchema.parse(f.input.result).candidates[0];
  f.input.result.candidates[0] = candidate;
  for (const field of candidate.fields) {
    if ("start" in field) {
      field.start += prefix;
      field.end += prefix;
    }
  }
  const material = f.input.snapshot.materials[0];
  material.text = text;
  Object.assign(material.pin, {
    payload_sha256: sha,
    byte_count: Buffer.byteLength(text),
  });
  f.input.catalog.inputs[0] = material.pin;
  Object.assign(f.input.snapshot.representations[0], {
    text_content: text,
    payload_sha256: sha,
    byte_count: Buffer.byteLength(text),
  });
  f.input.snapshot.sources[0].acquisition_sha256 = sha;
  f.input.result.sourceBindings[0].originalSha256 = sha;
  f.input.result.sourceBindings[0].submittedSha256 = createHash("sha256")
    .update(submitted)
    .digest("hex");
  return { ...f, candidate };
}

it.each([false, true])(
  "reanchors CRLF/BOM=%s model evidence to exact original UTF8 bytes",
  async (bom) => {
    const f = await normalizedTextFixture("", bom),
      text = f.input.snapshot.materials[0].text;
    const before = structuredClone(f.input.result);
    const r = await f.run();
    for (const e of r.body.evidence) {
      expect(
        Buffer.from(text).subarray(e.locator.start!, e.locator.end!).toString(),
      ).toBe(e.raw);
      expect(e.locator.start).toBe(Buffer.from(text).indexOf(e.raw));
    }
    expect(f.input.result).toEqual(before);
  },
);

it.each(["duplicate", "wrong-submitted-hash", "wrong-span", "cross-line-literal"])(
  "rejects %s instead of guessing original evidence",
  async (kind) => {
    const f = await normalizedTextFixture(kind === "duplicate" ? "海滨散步" : "");
    const field = f.candidate.fields[0];
    if (kind === "wrong-submitted-hash")
      f.input.result.sourceBindings[0].submittedSha256 = "0".repeat(64);
    if ("start" in field) {
      if (kind === "wrong-span") field.start += 1;
      if (kind === "cross-line-literal") {
        field.raw = "海滨散步\nActivity date";
        field.end = field.start + Buffer.byteLength(field.raw);
      }
    }
    await expect(f.run()).rejects.toThrow();
  },
);

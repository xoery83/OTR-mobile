import { randomUUID, createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  prepareUniversalDispatch,
  projectUniversalResponse,
  UNIVERSAL_IMPORT_VERSION,
} from "./universalImport";

function fixture() {
  const accountId = randomUUID(),
    tripId = randomUUID(),
    batchId = randomUUID(),
    taskId = randomUUID();
  // Format fixture only; this does not issue an owning Source verification receipt.
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
    "base64",
  );
  const digest = createHash("sha256").update(bytes).digest("hex");
  const dispatch = prepareUniversalDispatch(
    accountId,
    batchId,
    { version: UNIVERSAL_IMPORT_VERSION, tripId, taskId },
    {
      accountId,
      tripId,
      batchId,
      representations: [
        {
          accountId,
          tripId,
          batchId,
          inputId: randomUUID(),
          sourceId: randomUUID(),
          representationId: randomUUID(),
          revision: 1,
          originalSha256: digest,
          mime: "image/png",
          bytes,
        },
      ],
    },
  );
  const output = {
    v: 2,
    items: [
      {
        id: "photo",
        kind: "P1",
        subtype: "ACTIVITY",
        f: [
          [0, "activity.name", "Harbour Photo QA Workshop", { x: 0, y: 0, w: 1, h: 1 }],
          [0, "activity.date", "2026-11-02", { x: 0, y: 0, w: 1, h: 1 }],
        ],
      },
    ],
    bookings: [],
    tickets: [],
    links: [],
    issues: [],
  };
  const run = () =>
    projectUniversalResponse(dispatch, {
      output,
      providerReceipt: { outcome: "SETTLED", requestId: "synthetic-vision" },
    });
  return { dispatch, output, run, digest };
}
it("retains a typed original-image proposal for explicit review without an OCR field issuer", () => {
  const f = fixture(),
    result = f.run();
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({
    visualReviewRequired: true,
    admission: "NOT_RUN",
    presentationTier: "REVIEWABLE",
  });
  expect(result.quality?.acceptedTokens).toEqual([]);
  expect(result.quality?.reviewableTokens).toEqual(["photo"]);
  expect(result.formalReview).toBe("NOT_RUN");
  expect(result.canonicalWrites).toBe(false);
  expect((result.candidates[0] as any).fields[0]).toMatchObject({
    region: { imageSha256: f.digest, unit: "PIXELS" },
  });
});
it.each(["outside", "text-offset", "wrong-source", "lifecycle", "commercial"])(
  "does not promote %s image output to a save candidate",
  (failure) => {
    const f = fixture();
    if (failure === "outside") (f.output.items[0].f[0][3] as any).w = 2;
    if (failure === "text-offset")
      f.output.items[0].f[0] = [0, "activity.name", "Harbour", 0, 7] as never;
    if (failure === "wrong-source") f.output.items[0].f[0][0] = 1;
    if (failure === "lifecycle")
      f.output.issues.push([0, "cancellation notice"] as never);
    if (failure === "commercial") f.output.links.push(["T", "t1", "photo"] as never);
    expect(f.run().candidates).toEqual([]);
  },
);

it.each(["token", "field"])("refuses duplicate visual %s identity", (kind) => {
  const f = fixture();
  if (kind === "token") f.output.items.push(structuredClone(f.output.items[0]));
  else f.output.items[0].f.push(structuredClone(f.output.items[0].f[0]));
  expect(f.run().candidates).toEqual([]);
});
it("keeps separate visual candidates stable across repeated response recovery", () => {
  const f = fixture();
  f.output.items.push({ ...structuredClone(f.output.items[0]), id: "second" });
  const first = f.run(),
    second = f.run();
  expect(first.candidates).toHaveLength(2);
  expect(first.candidates).toEqual(second.candidates);
  expect(new Set(first.candidates.map((c: any) => c.id)).size).toBe(2);
  expect(first.quality?.acceptedTokens).toEqual([]);
});

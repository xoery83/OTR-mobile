import { universalResultSchema } from "../../src/data/api/universalImportContracts";
import { randomUUID, createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  prepareUniversalDispatch,
  projectUniversalResponse,
  UNIVERSAL_IMPORT_VERSION,
  type BoundRepresentation,
} from "./universalImport";
import { PDF_V2_OPTIONS_SHA } from "./sourcePdfV2Contracts";

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
it.each([0, 2])(
  "keeps independent PDF/text and visual proposals when the PNG is input %s",
  (imageIndex) => {
    const f = fixture();
    const image = f.dispatch.manifest.representations[0];
    const source = (text: string): BoundRepresentation => {
      const bytes = Buffer.from(text);
      return {
        ...image,
        inputId: randomUUID(),
        sourceId: randomUUID(),
        representationId: randomUUID(),
        mime: "text/plain",
        bytes,
        originalSha256: createHash("sha256").update(bytes).digest("hex"),
      };
    };
    const pdf = source("Museum walk\n2026-11-02");
    pdf.pdfSource = {
      original: {
        representationId: randomUUID(),
        sha256: "d".repeat(64),
        byteCount: 1676,
      },
      sealSha256: "e".repeat(64),
      pageMapSha256: "f".repeat(64),
      transformOptionsSha256: PDF_V2_OPTIONS_SHA,
    };
    const text = source("Harbour QA Hotel\n2026-11-02\n2026-11-03");
    const representations = [pdf, text];
    representations.splice(imageIndex, 0, image);
    const dispatch = prepareUniversalDispatch(
      image.accountId,
      image.batchId,
      {
        version: UNIVERSAL_IMPORT_VERSION,
        tripId: image.tripId,
        taskId: f.dispatch.base.taskId,
      },
      { ...f.dispatch.manifest, representations },
    );
    const field = (r: BoundRepresentation, path: string, raw: string) => {
      const start = r.bytes.indexOf(raw);
      return [
        representations.indexOf(r),
        path,
        raw,
        start,
        start + Buffer.byteLength(raw),
      ];
    };
    const output = {
      ...f.output,
      issues: [] as [number, string][],
      items: [
        {
          ...f.output.items[0],
          f: f.output.items[0].f.map((v) => [imageIndex, ...v.slice(1)]),
        },
        {
          id: "pdf",
          kind: "P1",
          subtype: "ACTIVITY",
          f: [
            field(pdf, "activity.name", "Museum walk"),
            field(pdf, "activity.date", "2026-11-02"),
          ],
        },
        {
          id: "hotel",
          kind: "P3",
          subtype: "ACCOMMODATION",
          f: [
            field(text, "property.name", "Harbour QA Hotel"),
            field(text, "check_in.date", "2026-11-02"),
            field(text, "check_out.date", "2026-11-03"),
          ],
        },
      ],
    };
    const run = () =>
      projectUniversalResponse(dispatch, {
        output,
        providerReceipt: { outcome: "SETTLED", requestId: "synthetic-mixed-no-network" },
      });
    const result = universalResultSchema.parse(run());
    expect(result.candidates.map((c) => c.token)).toEqual(["photo", "pdf", "hotel"]);
    expect(result.quality?.acceptedTokens).toEqual(["pdf", "hotel"]);
    expect(result.quality?.reviewableTokens).toEqual(["photo"]);
    expect(result.candidates[0]).toMatchObject({
      visualReviewRequired: true,
      presentationTier: "REVIEWABLE",
    });
    expect(
      result.candidates[0].fields.every(
        (v) => v.sourceId === `S${imageIndex}` && "region" in v,
      ),
    ).toBe(true);
    expect(run()).toEqual(result);
    expect(result.canonicalWrites).toBe(false);
    for (const [source, token] of [
      [pdf, "pdf"],
      [text, "hotel"],
    ] as const) {
      const issueIndex = representations.indexOf(source);
      output.issues = [[issueIndex, "cancellation notice"]];
      const isolated = universalResultSchema.parse(run());
      expect(isolated.candidates.map((c) => c.token)).toEqual([
        "photo",
        token === "pdf" ? "hotel" : "pdf",
      ]);
      expect(isolated.quality?.reviewableTokens).toEqual(["photo"]);
      expect(isolated.quality?.abstainedTokens).toContain(token);
      expect(isolated.unresolved).toContainEqual({
        sourceId: `S${issueIndex}`,
        reason: "cancellation notice",
      });
    }
    const textIndex = representations.indexOf(text);
    for (const issue of [
      [imageIndex, "cancellation notice"],
      [99, "cancellation notice"],
      [textIndex, "uncertain target across sources"],
    ] as [number, string][]) {
      output.issues = [issue];
      expect(universalResultSchema.parse(run()).quality?.reviewableTokens).not.toContain(
        "photo",
      );
    }
    output.issues = [[textIndex, "cancellation notice"]];
    const hotel = output.items.pop()!;
    expect(universalResultSchema.parse(run()).quality?.reviewableTokens).not.toContain(
      "photo",
    );
    output.items.push(hotel);
    output.items[1].f.push([
      imageIndex,
      "activity.venue",
      "Harbour",
      { x: 0, y: 0, w: 1, h: 1 },
    ]);
    expect(universalResultSchema.parse(run()).quality?.reviewableTokens).not.toContain(
      "photo",
    );
    output.items[1].f.pop();
    output.issues = [];
    (output.items[0].f[0][3] as { w: number }).w = 2;
    const partial = universalResultSchema.parse(run());
    expect(partial.candidates.map((c) => c.token)).toEqual(["pdf", "hotel"]);
    expect(partial.quality?.abstainedTokens).toContain("photo");
  },
);

import { flightInputSchema } from "../../src/domain/trip/flightImportReview";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { universalP1SourceFixture } from "./__fixtures__/universalP1Source";
import {
  prepareUniversalDispatch,
  projectUniversalResponse,
  UNIVERSAL_IMPORT_VERSION,
} from "./universalImport";
import { importLifecycleSnapshotSchema } from "../../src/data/operations/importLifecycleProposal";

async function fixture() {
  const f = await universalP1SourceFixture();
  const pin = flightInputSchema.parse(f.input.catalog.inputs[0]);
  f.input.catalog.inputs = [pin];
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
    "base64",
  );
  const digest = await f.deps.hash(bytes);
  Object.assign(pin, { payload_sha256: digest, byte_count: bytes.length });
  const source = { ...f.input.snapshot.sources[0], source_kind: "IMAGE" };
  const representation = {
    ...f.input.snapshot.representations[0],
    material_kind: "BINARY",
    mime_type: "image/png",
    encoding: null,
    text_content: null,
    payload_sha256: digest,
    byte_count: bytes.length,
    remote_state: "VERIFIED",
    verified_at: "2026-10-31T00:00:00.000000Z",
  };
  const image = {
    pin,
    form: "IMAGE",
    media_type: "image/png",
    originalBase64: bytes.toString("base64"),
    width: 1,
    height: 1,
    // Synthetic owning observation, never an actual Source/decoder qualification.
    verification: {
      attemptId: randomUUID(),
      operationId: randomUUID(),
      terminalEvidenceSha256: "a".repeat(64),
      profileId: "PNG_STATIC_RGB8_RGBA8_V1",
      profileSha256: "526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5",
    },
  };
  Object.assign(
    f.input.snapshot,
    importLifecycleSnapshotSchema.parse({
      sources: [source],
      representations: [representation],
      associations: [],
      materials: [image],
    }),
  );
  f.input.catalog.source = source;
  const { accountId, tripId } = f.input.context;
  const { batchId, taskId } = f.input.result;
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
          inputId: pin.id,
          sourceId: pin.source_id,
          representationId: pin.representation_id,
          revision: 1,
          originalSha256: digest,
          mime: "image/png",
          bytes,
        },
      ],
    },
  );
  f.input.result = projectUniversalResponse(dispatch, {
    output: {
      v: 2,
      items: [
        {
          id: "walk",
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
    },
    providerReceipt: { outcome: "SETTLED", requestId: "synthetic-photo" },
  });
  Object.assign(f.input.selection, {
    sourceReview: {
      version: "otr.universal.p1-source-review/1",
      decision: "NEW",
      sourceRevision: 1,
      title: "Harbour Photo QA Workshop",
      localDate: "2026-11-02",
      originalReviewed: true,
      tripReviewed: true,
    },
  });
  return f;
}
it("maps original-image fields to REGION through existing explicit Review/Plan qualification", async () => {
  const f = await fixture(),
    r = await f.run();
  expect(r.grantsAdmission).toBe(false);
  expect(r.qualification.eligibleNewRecords).toHaveLength(1);
  expect(r.body.plan.slots[0].command).toBe("CREATE_ITEM");
  expect(r.body.plan.slots[0].target.id).toBe(
    (await f.run()).body.plan.slots[0].target.id,
  );
  for (const evidence of r.body.evidence)
    expect(evidence.locator).toMatchObject({
      kind: "REGION",
      start: null,
      end: null,
      page: null,
      region: { coordinate_width: 1, coordinate_height: 1 },
    });
});
it.each([
  "no-review",
  "title",
  "date",
  "sha",
  "size",
  "region",
  "profile",
  "pending",
  "revision",
])("rejects %s without OCR or Manual Save fallback", async (failure) => {
  const f = await fixture();
  const selection = f.input.selection as any;
  const image = f.input.snapshot.materials[0] as any;
  if (failure === "no-review") delete selection.sourceReview;
  if (failure === "title") selection.sourceReview.title = "Invented";
  if (failure === "date") selection.sourceReview.localDate = "2026-11-03";
  if (failure === "sha")
    (f.input.result.candidates[0] as any).fields[0].region.imageSha256 = "b".repeat(64);
  if (failure === "size") image.width = 2;
  if (failure === "region")
    (f.input.result.candidates[0] as any).fields[0].region.width = 2;
  if (failure === "profile") image.verification.profileSha256 = "b".repeat(64);
  if (failure === "pending") f.input.snapshot.representations[0].remote_state = "PENDING";
  if (failure === "revision") image.pin.material_revision = 2;
  await expect(f.run()).rejects.toThrow();
});

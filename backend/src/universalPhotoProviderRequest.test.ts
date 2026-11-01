import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { createUniversalPort, prepareUniversalDispatch, UNIVERSAL_IMPORT_VERSION } from "./universalImport";
import { createUniversalDeepSeekProvider } from "./universalDeepSeekProvider";
import { buildUniversalDeepSeekRequest } from "./universalProviderRequest";
import { universalAdvisoryInstruction, universalInstruction } from "./universalPrompt";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";

function request(
  bytes = readFileSync(new URL("../../assets/trips/covers/fjord.jpg", import.meta.url)),
): Parameters<typeof buildUniversalDeepSeekRequest>[0] {
  return {
    taskId: randomUUID(),
    actorId: randomUUID(),
    accountId: randomUUID(),
    tripId: randomUUID(),
    batchId: randomUUID(),
    promptVersion: COMPACT_PROMPT_VERSION,
    instruction: universalInstruction,
    advisoryInstruction: universalAdvisoryInstruction,
    sources: [
      {
        index: 0,
        sourceId: "S0",
        mime: "image/jpeg",
        modality: "IMAGE" as const,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes,
      },
    ],
  };
}
it("the existing Image request retains exact submitted pixels and the original image hash", () => {
  const input = request();
  const built = buildUniversalDeepSeekRequest(input);
  const message = JSON.parse(built.body).messages[1];
  const images = message.content.filter(
    (part: { type: string }) => part.type === "image_url",
  );
  expect(message.content[1].text).toContain("IMAGE_SIZE_PIXELS 1600 800\n");
  expect(built.imageCount).toBe(1);
  expect(images).toEqual([
    {
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${input.sources[0].bytes.toString("base64")}`,
      },
    },
  ]);
  expect(
    message.content.some(
      (part: { type: string; text?: string }) =>
        part.type === "text" && part.text?.includes(input.sources[0].sha256),
    ),
  ).toBe(true);
  expect(createHash("sha256").update(built.body).digest("hex")).toBe(built.requestSha256);
});
// These tests cover serialization only, not a JPEG decoder/Source qualification.
it.each([1, 6, 8])("preserves EXIF orientation %s without claiming pixel rotation", (orientation) => {
  const original = request().sources[0].bytes;
  // Valid APP1 Exif/TIFF orientation entry; the original encoded scan is unchanged.
  const exif = Buffer.from("45786966000049492a0008000000010012010300010000000100000000000000", "hex");
  exif.writeUInt16LE(orientation, 24);
  const segment = Buffer.alloc(4);
  segment.writeUInt16BE(0xffe1, 0);
  segment.writeUInt16BE(exif.length + 2, 2);
  const bytes = Buffer.concat([original.subarray(0, 2), segment, exif, original.subarray(2)]);
  const built = buildUniversalDeepSeekRequest(request(bytes));
  const content = JSON.parse(built.body).messages[1].content;
  // SOF dimensions are encoded pixels; orientation-aware qualification is still absent.
  expect(content[1].text).toContain("IMAGE_SIZE_PIXELS 1600 800\n");
  expect(content[2].image_url.url).toBe("data:image/jpeg;base64," + bytes.toString("base64"));
});
it("rejects a real JPEG truncated before its dimensions instead of claiming image qualification", () => {
  const bytes = request().sources[0].bytes.subarray(0, 20);
  expect(() => buildUniversalDeepSeekRequest(request(bytes))).toThrow("UNIVERSAL_IMAGE_DIMENSIONS_INVALID");
});
it("rejects pixel/hash mismatch instead of silently falling back to OCR text", () => {
  const input = request();
  input.sources[0].bytes[3] = 99;
  expect(() => buildUniversalDeepSeekRequest(input)).toThrow(
    "UNIVERSAL_REQUEST_BINDING_INVALID",
  );
});
it("preserves existing one-image and 4MiB limits", () => {
  const input = request();
  input.sources.push({ ...input.sources[0], index: 1, sourceId: "S1" });
  expect(() => buildUniversalDeepSeekRequest(input)).toThrow("UNIVERSAL_IMAGE_BOUND");
  expect(() => buildUniversalDeepSeekRequest(request(Buffer.alloc(4194305)))).toThrow(
    "UNIVERSAL_IMAGE_BOUND",
  );
});


it("pins the same original PNG request hash through actual dispatch and custody with zero send", async () => {
  const input = request(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64",
  ));
  input.sources[0].mime = "image/png";
  const manifest = {
    accountId: input.accountId, tripId: input.tripId, batchId: input.batchId,
    representations: [{
      accountId: input.accountId, tripId: input.tripId, batchId: input.batchId,
      inputId: randomUUID(), sourceId: randomUUID(), representationId: randomUUID(),
      revision: 1, originalSha256: input.sources[0].sha256,
      mime: "image/png", bytes: input.sources[0].bytes,
    }],
  };
  const command = { version: UNIVERSAL_IMPORT_VERSION, tripId: input.tripId, taskId: input.taskId };
  const dispatch = prepareUniversalDispatch(input.actorId, input.batchId, command, manifest);
  const expected = buildUniversalDeepSeekRequest({ ...input,
    sources: dispatch.ready.map((p, index) => ({ index, sourceId: p.sourceId,
      mime: p.mime, modality: p.modality as "IMAGE", sha256: p.submittedSha256, bytes: p.bytes })),
  });
  const acquire = vi.fn(async () => null), send = vi.fn();
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  try {
    const port = createUniversalPort({
      readManifest: async () => manifest,
      claimDispatch: async (marker) => ({ claimed: true, receipt: marker }),
      readReceipt: async () => null, writeReceipt: vi.fn(),
    }, createUniversalDeepSeekProvider({ custody: { acquire, retainResponse: vi.fn(), settle: vi.fn() }, send }));
    await expect(port.execute(input.actorId, input.batchId, command)).rejects.toMatchObject({
      code: "UNIVERSAL_PROVIDER_ACQUIRE_FAILED",
    });
    expect(expected.imageCount).toBe(1);
    expect(acquire).toHaveBeenCalledWith(expect.objectContaining({ requestSha256: expected.requestSha256 }));
    expect(send).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createImagePasteDeliveryGate,
  imagePastePayloadSchema,
  IMAGE_PASTE_LIMIT,
} from "./imagePasteContract";
const processId = randomUUID(),
  batchId = randomUUID();
function item(size = 40) {
  const token = randomUUID();
  return {
    token,
    uri: `file:///tmp/otr-image-paste-v1/${processId}/${batchId}/${token}.png`,
    byteSize: size,
    mimeType: "image/png",
    source: "clipboard",
    representation: "item-provider",
  };
}
describe("explicit clipboard image delivery contract", () => {
  it("accepts bounded clipboard metadata and cannot relabel it as photos/files", () => {
    const value = item();
    expect(
      imagePastePayloadSchema.safeParse({
        requestId: "paste-1",
        items: [value],
        target: 1,
      }).success,
    ).toBe(true);
    for (const source of ["photos", "files", "camera"])
      expect(
        imagePastePayloadSchema.safeParse({
          requestId: "paste-1",
          items: [{ ...value, source }],
        }).success,
      ).toBe(false);
    for (const uri of [
      "invalid",
      "https://example.com/image.png",
      "file:///tmp/private.png",
      value.uri.replace(value.token + ".png", "different.png"),
    ])
      expect(
        imagePastePayloadSchema.safeParse({
          requestId: "paste-1",
          items: [{ ...value, uri }],
        }).success,
      ).toBe(false);
  });
  it("refuses oversize, aggregate, count and duplicate payloads without truncation", () => {
    const value = item();
    for (const items of [
      [item(IMAGE_PASTE_LIMIT + 1)],
      [item(IMAGE_PASTE_LIMIT), item()],
      Array.from({ length: 11 }, () => item()),
      [value, value],
    ])
      expect(
        imagePastePayloadSchema.safeParse({ requestId: "paste-1", items }).success,
      ).toBe(false);
  });
  it("releases stale/cancelled/malformed delivery, keeps delivered files until explicit owner release", () => {
    let current = "paste-1",
      enabled = true;
    const release = vi.fn(),
      images = vi.fn(),
      failure = vi.fn();
    const gate = createImagePasteDeliveryGate({
      current: (id) => enabled && id === current,
      release,
      images,
      failure,
    });
    const first = item();
    gate.images({ requestId: current, items: [first] });
    expect(images).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    current = "paste-2";
    gate.images({ requestId: "paste-1", items: [first] });
    expect(release).toHaveBeenLastCalledWith([first.token]);
    enabled = false;
    const late = item();
    gate.images({ requestId: current, items: [late] });
    expect(release).toHaveBeenLastCalledWith([late.token]);
    const invalid = item();
    gate.images({ requestId: current, items: [{ ...invalid, uri: "invalid" }] });
    expect(release).toHaveBeenLastCalledWith([invalid.token]);
    gate.failure({ requestId: current, code: "load_failed", error: "private" });
    expect(failure).not.toHaveBeenCalled();
  });
  it("releases tokens if the consumer throws and forwards only finite current errors", () => {
    const release = vi.fn(),
      failure = vi.fn(),
      first = item();
    const gate = createImagePasteDeliveryGate({
      current: (id) => id === "paste-1",
      release,
      images: () => {
        throw Error("private");
      },
      failure,
    });
    gate.images({ requestId: "paste-1", items: [first] });
    expect(release).toHaveBeenCalledWith([first.token]);
    gate.failure({ requestId: "paste-1", code: "storage", description: "private" });
    expect(failure).toHaveBeenCalledWith({ requestId: "paste-1", code: "storage" });
    gate.failure({ requestId: "paste-1", code: "private" });
    expect(failure).toHaveBeenCalledTimes(1);
  });
});

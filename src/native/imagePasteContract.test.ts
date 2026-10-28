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
      claim: () => true,
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
    expect(release).not.toHaveBeenCalled();
    expect(images).toHaveBeenCalledTimes(1);
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
  it("preserves possibly adopted tokens if the consumer throws and forwards only finite current errors", () => {
    const release = vi.fn(),
      failure = vi.fn(),
      first = item();
    const gate = createImagePasteDeliveryGate({
      claim: () => true,
      current: (id) => id === "paste-1",
      release,
      images: () => {
        throw Error("private");
      },
      failure,
    });
    gate.images({ requestId: "paste-1", items: [first] });
    gate.images({ requestId: "paste-1", items: [{ ...first, uri: "invalid" }] });
    expect(release).not.toHaveBeenCalled();
    gate.failure({ requestId: "paste-1", code: "storage", description: "private" });
    expect(failure).toHaveBeenCalledWith({ requestId: "paste-1", code: "storage" });
    gate.failure({ requestId: "paste-1", code: "private" });
    expect(failure).toHaveBeenCalledTimes(1);
  });
  it("never re-adopts or releases an adopted token on duplicate, mixed or malformed events", () => {
    const release = vi.fn(),
      images = vi.fn();
    const gate = createImagePasteDeliveryGate({
      claim: () => true,
      current: () => true,
      release,
      images,
      failure: vi.fn(),
    });
    const first = item(),
      extra = item();
    gate.images({ requestId: "paste-1", items: [first] });
    gate.images({ requestId: "paste-1", items: [first] });
    gate.images({ requestId: "paste-1", items: [{ ...first, uri: "invalid" }] });
    gate.images({ requestId: "paste-1", items: [first, extra] });
    expect(images).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledExactlyOnceWith([extra.token]);
    gate.images({ requestId: "paste-1", items: [extra] });
    expect(images).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it("fences ownership before reentrant adoption and callback failure", () => {
    const release = vi.fn(),
      first = item();
    let calls = 0;
    const gate = createImagePasteDeliveryGate({
      claim: () => true,
      current: () => true,
      release,
      images: () => {
        calls++;
        gate.images({ requestId: "paste-1", items: [first] });
        gate.images({ requestId: "paste-1", items: [{ ...first, uri: "invalid" }] });
        throw Error("consumer already staged the file");
      },
      failure: vi.fn(),
    });
    gate.images({ requestId: "paste-1", items: [first] });
    expect(calls).toBe(1);
    expect(release).not.toHaveBeenCalled();
  });
  it("fences discarded tokens before reentrant release and never later adopts them", () => {
    const first = item(),
      images = vi.fn();
    let current = false;
    const release = vi.fn(() => {
      current = true;
      gate.images({ requestId: "paste-1", items: [first] });
    });
    const gate = createImagePasteDeliveryGate({
      claim: () => true,
      current: () => current,
      release,
      images,
      failure: vi.fn(),
    });
    gate.images({ requestId: "paste-1", items: [first] });
    expect(release).toHaveBeenCalledExactlyOnceWith([first.token]);
    expect(images).not.toHaveBeenCalled();
  });
  it("requires a synchronous claim before adoption and never retries a failed token", () => {
    const first = item(),
      release = vi.fn(),
      images = vi.fn();
    const claim = vi.fn(() => false);
    const gate = createImagePasteDeliveryGate({
      current: () => true,
      claim,
      release,
      images,
      failure: vi.fn(),
    });
    gate.images({ requestId: "paste-1", items: [first] });
    expect(claim).toHaveBeenCalledExactlyOnceWith("paste-1", [first.token]);
    expect(release).toHaveBeenCalledExactlyOnceWith([first.token]);
    expect(images).not.toHaveBeenCalled();
    claim.mockReturnValue(true);
    gate.images({ requestId: "paste-1", items: [first] });
    expect(claim).toHaveBeenCalledTimes(1);
    expect(images).not.toHaveBeenCalled();
  });
  it("reserves tokens before synchronous claim reentrancy, and delivers only after claim", () => {
    const first = item(),
      order: string[] = [],
      release = vi.fn();
    const gate = createImagePasteDeliveryGate({
      current: () => true,
      release,
      claim: () => {
        order.push("claim");
        gate.images({ requestId: "paste-1", items: [first] });
        return true;
      },
      images: () => {
        order.push("adopt");
      },
      failure: vi.fn(),
    });
    gate.images({ requestId: "paste-1", items: [first] });
    expect(order).toEqual(["claim", "adopt"]);
    expect(release).not.toHaveBeenCalled();
  });
  it("treats throwing claim as failure and discards without calling the consumer", () => {
    const first = item(),
      release = vi.fn(),
      images = vi.fn();
    const gate = createImagePasteDeliveryGate({
      current: () => true,
      release,
      images,
      claim: () => {
        throw Error("bridge unavailable");
      },
      failure: vi.fn(),
    });
    gate.images({ requestId: "paste-1", items: [first] });
    expect(images).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledExactlyOnceWith([first.token]);
  });
});

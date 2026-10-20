import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CAPTURE_LIMITS } from "@/domain/capture/localCapture";
import {
  readCapturePayload,
  type CaptureByteReader,
  type CapturePayloadInput,
} from "./capturePayloadReader";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function reader(bytes: Uint8Array, chunk = 3) {
  let offset = 0;
  return {
    read: vi.fn(async (max: number) => {
      if (offset === bytes.length) return null;
      const result = bytes.subarray(offset, offset + Math.min(chunk, max));
      offset += result.length;
      return result;
    }),
    close: vi.fn(async () => {}),
  } satisfies CaptureByteReader;
}
describe("Capture bounded payload reader", () => {
  it.each(["FILE", "IMAGE"] as const)(
    "preserves every %s byte without decoding",
    async (kind) => {
      const bytes = new Uint8Array([0, 255, 192, 128, 13, 10]);
      const p = await readCapturePayload(kind, { bytes }, hash);
      expect(p.bytes).toEqual(bytes);
      expect(p.bytes).not.toBe(bytes);
      expect(p.byteCount).toBe(6);
      expect(p.sha256).toBe(await hash(bytes));
    },
  );
  it("encodes strings with exact UTF-8, no newline or Unicode normalization", async () => {
    const text = "\ufeff旅程😀\r\ne\u0301\ud800";
    const p = await readCapturePayload("TEXT", { text }, hash);
    expect(p.bytes).toEqual(new TextEncoder().encode(text));
    expect(p.byteCount).toBe(p.bytes.length);
    expect(p.sha256).toBe(await hash(p.bytes));
  });
  it("preserves supplied UTF-8 BOM and CRLF bytes", async () => {
    const bytes = new TextEncoder().encode("\ufeffa\r\n");
    expect(
      (await readCapturePayload("TEXT", { reader: reader(bytes) }, hash)).bytes,
    ).toEqual(bytes);
  });
  it.each(["FILE", "IMAGE", "TEXT"] as const)("rejects empty %s", async (kind) => {
    await expect(
      readCapturePayload(kind, { bytes: new Uint8Array() }, hash),
    ).rejects.toMatchObject({ code: "EMPTY_PAYLOAD" });
  });
  it("rejects empty string and empty reader, closing the reader", async () => {
    await expect(readCapturePayload("TEXT", { text: "" }, hash)).rejects.toMatchObject({
      code: "EMPTY_PAYLOAD",
    });
    const r = reader(new Uint8Array());
    await expect(readCapturePayload("FILE", { reader: r }, hash)).rejects.toMatchObject({
      code: "EMPTY_PAYLOAD",
    });
    expect(r.close).toHaveBeenCalledOnce();
  });
  it.each(["FILE", "IMAGE", "TEXT"] as const)(
    "accepts exact %s bound; rejects bound+1",
    async (kind) => {
      const limit =
        kind === "TEXT" ? CAPTURE_LIMITS.textBytes : CAPTURE_LIMITS.binaryBytes;
      const bytes = new Uint8Array(limit).fill(65);
      expect((await readCapturePayload(kind, { bytes }, hash)).byteCount).toBe(limit);
      const h = vi.fn(hash);
      await expect(
        readCapturePayload(kind, { bytes: new Uint8Array(limit + 1) }, h),
      ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
      expect(h).not.toHaveBeenCalled();
    },
  );
  it("checks UTF-8 string byte size before hashing", async () => {
    const h = vi.fn(hash);
    const limit = CAPTURE_LIMITS.textBytes;
    expect(
      (await readCapturePayload("TEXT", { text: "a".repeat(limit) }, h)).byteCount,
    ).toBe(limit);
    h.mockClear();
    await expect(
      readCapturePayload("TEXT", { text: "a".repeat(limit - 2) + "旅" }, h),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    expect(h).not.toHaveBeenCalled();
  });
  it("enforces stream bounds despite dishonest size hint and closes", async () => {
    const r = {
      ...reader(new Uint8Array(CAPTURE_LIMITS.textBytes + 1).fill(65), 65536),
      sizeHint: 1,
    };
    await expect(readCapturePayload("TEXT", { reader: r }, hash)).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(r.close).toHaveBeenCalledOnce();
    expect(r.read.mock.calls.every(([n]) => n <= 65536)).toBe(true);
  });
  it("rejects determinable size before any read, closing the handle", async () => {
    const r = {
      ...reader(new Uint8Array([1])),
      sizeHint: CAPTURE_LIMITS.binaryBytes + 1,
    };
    await expect(readCapturePayload("FILE", { reader: r }, hash)).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(r.read).not.toHaveBeenCalled();
    expect(r.close).toHaveBeenCalledOnce();
  });
  it.each([[0xff], [0xc0, 0x80], [0xe2, 0x82], [0xed, 0xa0, 0x80]])(
    "rejects invalid UTF-8 %j",
    async (...values) => {
      const bytes = new Uint8Array(values);
      await expect(readCapturePayload("TEXT", { bytes }, hash)).rejects.toMatchObject({
        code: "INVALID_UTF8",
      });
    },
  );
  it("validates multibyte UTF-8 across read boundaries", async () => {
    const bytes = new TextEncoder().encode("旅😀");
    expect(
      (await readCapturePayload("TEXT", { reader: reader(bytes, 1) }, hash)).bytes,
    ).toEqual(bytes);
  });
  it("copies reused caller stream buffers immediately", async () => {
    const buffer = new Uint8Array([1]);
    let step = 0;
    const r = {
      read: async () => {
        if (step === 2) return null;
        buffer[0] = ++step;
        return buffer;
      },
      close: async () => {},
    };
    expect((await readCapturePayload("FILE", { reader: r }, hash)).bytes).toEqual(
      new Uint8Array([1, 2]),
    );
  });
  it.each(["throw", "empty", "oversize", "close"])(
    "distinguishes %s reader failure",
    async (failure) => {
      const r = {
        read: async (max: number) => {
          if (failure === "throw") throw new Error("private temporary URL");
          if (failure === "empty") return new Uint8Array();
          if (failure === "oversize") return new Uint8Array(max + 1);
          return null;
        },
        close: vi.fn(async () => {
          if (failure === "close") throw new Error("private");
        }),
      };
      await expect(readCapturePayload("FILE", { reader: r }, hash)).rejects.toMatchObject(
        { code: "READER_FAILURE" },
      );
      expect(r.close).toHaveBeenCalledOnce();
    },
  );
  it.each(["bad", "throw"])("rejects %s hash without exposing input", async (mode) => {
    await expect(
      readCapturePayload("FILE", { bytes: new Uint8Array([1]) }, async () => {
        if (mode === "throw") throw new Error("secret");
        return "INVALID";
      }),
    ).rejects.toMatchObject({ code: "HASH_FAILURE" });
  });

  it.each(["FILE", "IMAGE", "TEXT"] as const)(
    "stream %s accepts exact bound and rejects the next byte",
    async (kind) => {
      const limit =
        kind === "TEXT" ? CAPTURE_LIMITS.textBytes : CAPTURE_LIMITS.binaryBytes;
      const exact = reader(new Uint8Array(limit).fill(65), 65536);
      expect((await readCapturePayload(kind, { reader: exact }, hash)).byteCount).toBe(
        limit,
      );
      expect(exact.close).toHaveBeenCalledOnce();
      const over = reader(new Uint8Array(limit + 1).fill(65), 65536);
      await expect(
        readCapturePayload(kind, { reader: over }, hash),
      ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
      expect(over.close).toHaveBeenCalledOnce();
    },
  );
  it("closing failure cannot mask earlier size rejection", async () => {
    const r = {
      read: vi.fn(async () => null),
      close: async () => {
        throw new Error("private");
      },
      sizeHint: CAPTURE_LIMITS.binaryBytes + 1,
    };
    await expect(readCapturePayload("FILE", { reader: r }, hash)).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(r.read).not.toHaveBeenCalled();
  });

  it("rejects invalid contracts and binary string input", async () => {
    for (const input of [
      { text: "a" },
      { bytes: new Uint8Array([1]), text: "a" },
      { bytes: [1] },
    ])
      await expect(
        readCapturePayload("FILE", input as CapturePayloadInput, hash),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

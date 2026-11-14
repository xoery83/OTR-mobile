import { expect, it } from "vitest";
import { universalV3MediaType } from "./universalV3Contracts";
const encode = (text: string) => new TextEncoder().encode(text);
it.each([
  ["text/plain", encode("Travel plans")],
  ["application/pdf", encode("%PDF-1.7")],
  ["image/png", Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)],
  ["image/jpeg", Uint8Array.of(255, 216, 255)],
  ["image/webp", encode("RIFF1234WEBP")],
  ["image/gif", encode("GIF89a")],
] as const)("recognizes %s bytes without a filename", (mime, bytes) => {
  expect(universalV3MediaType(bytes, mime)).toBe(mime);
  expect(() => universalV3MediaType(bytes, "application/octet-stream")).toThrow();
});
it("rejects a misleading declared MIME, binary text and unsupported images", () => {
  expect(() => universalV3MediaType(encode("GIF89a"), "image/png")).toThrow();
  expect(() => universalV3MediaType(Uint8Array.of(0, 1, 2), "text/plain")).toThrow();
  expect(() => universalV3MediaType(encode("not an image"), "image/png")).toThrow();
});

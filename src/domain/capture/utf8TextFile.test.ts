import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { verifyUtf8TextFile, UTF8_TEXT_FILE_PROFILE } from "./utf8TextFile";

it.each(["plain", "\ufeffBOM\r\nSecond line", "非ASCII文字\r\nAuckland → 北京"])(
  "qualified .txt retains exact original bytes, including BOM/CRLF/Unicode: %s",
  (text) => {
    const bytes = new TextEncoder().encode(text),
      p = verifyUtf8TextFile(bytes, "Original.TXT", "text/plain");
    expect(p).toEqual({
      profileId: UTF8_TEXT_FILE_PROFILE,
      originalFilename: "Original.TXT",
      text,
      payloadSha256: createHash("sha256").update(bytes).digest("hex"),
      byteCount: bytes.length,
    });
    expect(new TextEncoder().encode(p.text)).toEqual(bytes);
  },
);
it("rejects malformed UTF8/NUL/binary PDF signatures, size and filename boundaries without replacing bytes", () => {
  for (const bytes of [
    Uint8Array.of(255),
    new TextEncoder().encode("bad\0text"),
    new TextEncoder().encode("%PDF-1.4\nnot a .txt original"),
    new TextEncoder().encode("\ufeff%PDF-1.4\nnot text"),
    new Uint8Array(0),
    new Uint8Array(262145).fill(65),
  ]) {
    const before = bytes.slice();
    expect(() => verifyUtf8TextFile(bytes, "synthetic.txt", "text/plain")).toThrow(
      "UNSUPPORTED",
    );
    expect(bytes).toEqual(before);
  }
  const bytes = Uint8Array.of(65);
  for (const name of [null, "", "document.pdf", "bad\0.txt", "a".repeat(252) + ".txt"])
    expect(() => verifyUtf8TextFile(bytes, name, "text/plain")).toThrow("UNSUPPORTED");
  expect(() =>
    verifyUtf8TextFile(bytes, "a".repeat(251) + ".txt", "text/plain"),
  ).not.toThrow();
  expect(() => verifyUtf8TextFile(bytes, "file.txt", "application/pdf")).toThrow(
    "UNSUPPORTED",
  );
  const maximum = new Uint8Array(262144).fill(65);
  expect(verifyUtf8TextFile(maximum, "limit.txt", "text/plain").byteCount).toBe(262144);
});

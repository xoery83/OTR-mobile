import { expect, it } from "vitest";
import { encodeProfilePdf, verifySourcePdf } from "./sourcePdfProfile";
it("independently decodes a complete two-page selectable PDF and exact byte map", () => {
  const lines = [
    "NZ1 AKL->CHC 2026-12-17 depInstant=2026-12-16T20:00:00Z",
    "NZ2 CHC->AKL 2026-12-20 depInstant=2026-12-19T20:00:00Z",
  ];
  const pdf = encodeProfilePdf(lines),
    r = verifySourcePdf(pdf);
  expect(r.text).toBe(lines.join("\n"));
  expect(r.pages).toEqual([
    { pageIndex: 0, start: 0, end: lines[0].length },
    { pageIndex: 1, start: lines[0].length + 1, end: r.textByteCount },
  ]);
  expect(() =>
    verifySourcePdf(new TextEncoder().encode(new TextDecoder().decode(pdf) + "extra")),
  ).toThrow();
  expect(() =>
    verifySourcePdf(
      new TextEncoder().encode(
        new TextDecoder().decode(pdf).replace("Courier", "Arial  "),
      ),
    ),
  ).toThrow();
  expect(() =>
    verifySourcePdf(
      new TextEncoder().encode(
        new TextDecoder().decode(pdf).replace("/Count 2", "/Count 1"),
      ),
    ),
  ).toThrow();
  expect(() => encodeProfilePdf(["x".repeat(71)])).toThrow();
});
it("rejects xref/trailing content, handles escaped literals, and binds every profile byte", () => {
  const lines = ["Escaped (literal) \\ slash", "Second page"],
    bytes = encodeProfilePdf(lines);
  expect(verifySourcePdf(bytes).text).toBe(lines.join("\n"));
  for (const changed of [
    new TextDecoder().decode(bytes).replace("0000000000 65535 f", "0000000001 65535 f"),
    new TextDecoder().decode(bytes).replace("/Length", "/Filter /FlateDecode /Length"),
    new TextDecoder().decode(bytes).replace("%%EOF", "%%EOF\n/JavaScript"),
  ])
    expect(() => verifySourcePdf(new TextEncoder().encode(changed))).toThrow(
      "PDF_PROFILE_UNSUPPORTED",
    );
  for (const lines of [[], Array(33).fill("page"), ["unicode →"], [" "]])
    expect(() => encodeProfilePdf(lines)).toThrow();
});

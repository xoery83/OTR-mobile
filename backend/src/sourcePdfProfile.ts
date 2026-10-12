import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import { createHash } from "node:crypto";
export const PDF_PROFILE = Object.freeze({
  version: 1,
  id: "OTR_PDF_LITERAL_TEXT_V1",
  producer: "otr-source-pdf-verifier/1",
  transformKey: "otr.pdf.literal-text",
  transformVersion: "1",
  options: "ASCII_LITERAL_LINES_LF_PAGES_0_BASED",
  maxPages: 32,
  maxLine: 70,
});
export const pdfHash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export const PDF_PROFILE_SHA = pdfHash(JSON.stringify(PDF_PROFILE));
export const PDF_OPTIONS_SHA = pdfHash(PDF_PROFILE.options);
function validateLines(lines: string[]) {
  if (
    !lines.length ||
    lines.length > 32 ||
    lines.some((s) => !s.trim() || s.length > 70 || !/^[\x20-\x7e]+$/.test(s))
  )
    throw new Error("PDF_PROFILE_UNSUPPORTED");
}
// Complete finite PDF grammar; extra bytes/objects/fonts/content never get silently discarded.
export function encodeProfilePdf(lines: string[]): Uint8Array {
  validateLines(lines);
  const font = 3 + lines.length * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${lines.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${lines.length} >>`,
  ];
  lines.forEach((line, i) => {
    const text = line.replace(/[\\()]/g, (c) => "\\" + c);
    const content = `BT\n/F1 12 Tf\n72 720 Td\n(${text}) Tj\nET\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    );
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const n = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return n;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
export function verifySourcePdf(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 65536 || bytes.some((b) => b > 126 || b < 10))
    throw new Error("PDF_PROFILE_UNSUPPORTED");
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const streams = [
    ...raw.matchAll(
      /stream\nBT\n\/F1 12 Tf\n72 720 Td\n\(((?:\\[\\()]|[^\\()\r\n])*)\) Tj\nET\nendstream/g,
    ),
  ];
  const lines = streams.map((m) => m[1].replace(/\\([\\()])/g, "$1"));
  validateLines(lines);
  const expected = encodeProfilePdf(lines);
  if (expected.length !== bytes.length || expected.some((b, i) => b !== bytes[i]))
    throw new Error("PDF_PROFILE_UNSUPPORTED");
  let offset = 0;
  const pages = lines.map((line, pageIndex) => {
    const start = offset;
    offset += line.length;
    const end = offset;
    offset++;
    return { pageIndex, start, end };
  });
  const text = lines.join("\n");
  return {
    profileSha256: PDF_PROFILE_SHA,
    originalSha256: pdfHash(bytes),
    originalByteCount: bytes.length,
    text,
    textSha256: pdfHash(text),
    textByteCount: text.length,
    pages,
    pageMapSha256: pdfHash(canonicalCoreJson(pages)),
  };
}

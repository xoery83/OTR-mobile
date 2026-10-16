import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
import { profile } from "./profile.mjs";

const prohibitedKeys = new Set([
  "/JS",
  "/JavaScript",
  "/Launch",
  "/EmbeddedFiles",
  "/EmbeddedFile",
  "/RichMedia",
  "/XFA",
  "/AA",
  "/OpenAction",
]);
function inspect(value) {
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (current && typeof current === "object")
      for (const [key, child] of Object.entries(current)) {
        if (
          prohibitedKeys.has(key) ||
          (typeof child === "string" && prohibitedKeys.has(child))
        )
          throw new Error("PDF_V2_ACTIVE_CONTENT_UNSUPPORTED");
        if (child && typeof child === "object") pending.push(child);
      }
  }
}
const run = (binary, args) => {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: profile.maxInspectionBytes,
    env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.signal || result.status === null)
    throw new Error("PDF_V2_PROCESS_FAILED");
  return result;
};
const execute = (binary, args) => {
  const r = run(binary, args);
  if (r.status !== 0) throw new Error("PDF_V2_DECODE_FAILED");
  return r.stdout;
};

export function qpdfWarnings(result, metadata) {
  if (result.status === 0) {
    if (result.stderr.trim()) throw new Error("PDF_V2_WARNING_UNSUPPORTED");
    return [];
  }
  if (result.status !== 3) throw new Error("PDF_V2_DECODE_FAILED");
  const lines = result.stderr.trim().split("\n");
  if (
    lines.pop() !== "qpdf: operation succeeded with warnings" ||
    !lines.length ||
    lines.length > 32
  )
    throw new Error("PDF_V2_WARNING_UNSUPPORTED");
  const ids = lines.map((line) => {
    const match =
      /^WARNING: \/tmp\/original\.pdf \(object ([1-9][0-9]* [0-9]+)\): object has offset 0$/.exec(
        line,
      );
    if (!match) throw new Error("PDF_V2_WARNING_UNSUPPORTED");
    return match[1] + " R";
  });
  const references = new Set(ids),
    pending = [metadata];
  while (pending.length) {
    const current = pending.pop();
    if (current && typeof current === "object") pending.push(...Object.values(current));
    else if (typeof current === "string" && references.has(current))
      throw new Error("PDF_V2_ZERO_OFFSET_REFERENCED");
  }
  const objects = metadata.qpdf?.[1];
  if (
    !objects ||
    ids.some((id) => !objects["obj:" + id] || objects["obj:" + id].value !== null)
  )
    throw new Error("PDF_V2_ZERO_OFFSET_NOT_NULL");
  return [...new Set(ids)].sort();
}

// Only called inside the no-network, read-only, resource-limited worker container.
export async function extractPdf(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    !bytes.length ||
    bytes.length > profile.maxOriginalBytes ||
    !Buffer.from(bytes.subarray(0, 5)).equals(Buffer.from("%PDF-")) ||
    !Buffer.from(bytes).subarray(-1024).toString("latin1").trimEnd().endsWith("%%EOF")
  )
    throw new Error("PDF_V2_FORMAT_UNSUPPORTED");
  const file = "/tmp/original.pdf";
  await writeFile(file, bytes, { mode: 0o400, flag: "wx" });
  try {
    const checked = run("/usr/bin/qpdf", ["--check", file]);
    const inspected = run("/usr/bin/qpdf", ["--json", "--json-stream-data=none", file]);
    if (![0, 3].includes(inspected.status)) throw new Error("PDF_V2_DECODE_FAILED");
    const metadata = JSON.parse(inspected.stdout);
    const warnings = qpdfWarnings(checked, metadata);
    if (JSON.stringify(qpdfWarnings(inspected, metadata)) !== JSON.stringify(warnings))
      throw new Error("PDF_V2_WARNING_UNSUPPORTED");
    if (metadata.encrypt?.encrypted !== false)
      throw new Error("PDF_V2_ENCRYPTED_UNSUPPORTED");
    inspect(metadata);
    const pageCount = Number(execute("/usr/bin/qpdf", ["--show-npages", file]).trim());
    if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > profile.maxPages)
      throw new Error("PDF_V2_PAGE_LIMIT");
    let text = "";
    const pages = [];
    for (let page = 1; page <= pageCount; page++) {
      const content = execute("/usr/bin/pdftotext", [
        "-f",
        String(page),
        "-l",
        String(page),
        "-layout",
        "-enc",
        "UTF-8",
        "-nopgbrk",
        file,
        "-",
      ]);
      if (!content.trim() || content.includes("\0") || content.includes("\ufffd"))
        throw new Error("PDF_V2_TEXT_UNAVAILABLE");
      const start = Buffer.byteLength(text);
      text += content;
      const end = Buffer.byteLength(text);
      if (end > profile.maxTextBytes) throw new Error("PDF_V2_TEXT_LIMIT");
      pages.push({ pageIndex: page - 1, start, end });
      if (page < pageCount) text += "\n";
    }
    return {
      toleratedUnreferencedZeroOffsetObjects: warnings,
      engine: profile.engine,
      version: 1,
      originalSha256: createHash("sha256").update(bytes).digest("hex"),
      originalByteCount: bytes.length,
      text,
      pages,
    };
  } finally {
    await rm(file, { force: true });
  }
}

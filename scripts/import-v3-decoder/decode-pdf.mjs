import { Buffer } from "node:buffer";
// eslint-disable-next-line import/no-unresolved -- The image stages the existing PDF extractor next to this entry.
import { extractPdf } from "./extract.mjs";
// eslint-disable-next-line import/no-unresolved -- The image stages the fixed PDF profile next to this entry.
import { profile } from "./profile.mjs";
const root = "/opt/otr/import-v3";
const libraryPath = root + "/pdf/lib";
try {
  let length = 0;
  const chunks = [];
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > profile.maxOriginalBytes) throw Error();
    chunks.push(chunk);
  }
  const result = await extractPdf(Buffer.concat(chunks, length), {
    file: process.argv[2] + "/original.pdf",
    qpdf: root + "/pdf/bin/qpdf",
    pdftotext: root + "/pdf/bin/pdftotext",
    libraryPath,
  });
  const encoded = JSON.stringify(result);
  if (Buffer.byteLength(encoded) > profile.outputBytes) throw Error();
  process.stdout.write(encoded);
} catch {
  process.stderr.write("UNIVERSAL_V3_PDF_REJECTED\n");
  process.exitCode = 1;
}

import { profile } from "./profile.mjs";
import { extractPdf } from "./extract.mjs";
let raw = "";
try {
  for await (const chunk of process.stdin) {
    raw += chunk.toString("utf8");
    if (Buffer.byteLength(raw) > Math.ceil((profile.maxOriginalBytes * 4) / 3) + 256)
      throw new Error("PDF_V2_INPUT_LIMIT");
  }
  const input = JSON.parse(raw);
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).join() !== "bytes" ||
    typeof input.bytes !== "string" ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.bytes)
  )
    throw new Error("PDF_V2_INPUT_INVALID");
  const bytes = Buffer.from(input.bytes, "base64");
  if (bytes.toString("base64") !== input.bytes) throw new Error("PDF_V2_INPUT_INVALID");
  const result = await extractPdf(bytes);
  const output = JSON.stringify(result) + "\n";
  if (Buffer.byteLength(output) > profile.outputBytes)
    throw new Error("PDF_V2_OUTPUT_LIMIT");
  process.stdout.write(output);
} catch (error) {
  const allowed = /^PDF_V2_[A-Z_]+$/;
  process.stdout.write(
    JSON.stringify({
      error: allowed.test(error.message) ? error.message : "PDF_V2_DECODE_FAILED",
    }) + "\n",
  );
  process.exitCode = 2;
}

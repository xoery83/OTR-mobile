import { readUniversalContinuousConfig } from "./universalContinuousConfig";
import { createSourcePgConnection } from "./tripCoreV2PgConnection";
import { runSourcePdfCloseControl } from "./sourcePdfCloseControl";

// Operator-only stdin bundle. Existing Source credential is read in place, never copied.
async function main() {
  if (process.argv.length !== 3 || !["close", "verify"].includes(process.argv[2]))
    throw Error("PDF_CLOSE_MODE_REQUIRED");
  const config = await readUniversalContinuousConfig(process.env);
  if (!config) throw Error("PDF_CLOSURE_UNCONFIRMED");
  const result = await runSourcePdfCloseControl(
    createSourcePgConnection(config.sourcePg),
    process.argv[2] === "close",
  );
  console.log(JSON.stringify(result));
  if (!result.closed) process.exitCode = 1;
}
void main().catch(() => {
  console.error("PDF_CLOSURE_UNCONFIRMED");
  process.exitCode = 1;
});

import { readUniversalContinuousConfig } from "./universalContinuousConfig";
import { createSourcePgConnection } from "./tripCoreV2PgConnection";
import { createSourcePngCloseControl } from "./sourcePngCloseControl";

// Operator-only stdin bundle; the existing Source credential stays in its mounted config.
async function main() {
  if (process.argv.length !== 3 || !["close", "verify"].includes(process.argv[2]))
    throw Error("PNG_CLOSE_MODE_REQUIRED");
  const config = await readUniversalContinuousConfig(process.env);
  if (!config) throw Error("PNG_CLOSURE_UNCONFIRMED");
  const control = createSourcePngCloseControl(createSourcePgConnection(config.sourcePg));
  const result = process.argv[2] === "close" ? await control.close() : await control.read();
  console.log(JSON.stringify({ status: result.closed ? "PNG_SCOPE_CLOSED_VERIFIED" : "PNG_SCOPE_ACTIVE", closed: result.closed }));
  if (!result.closed) process.exitCode = 1;
}
void main().catch(() => {
  console.error("PNG_CLOSURE_UNCONFIRMED");
  process.exitCode = 1;
});

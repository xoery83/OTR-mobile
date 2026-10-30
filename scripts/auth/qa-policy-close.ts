// DEV-only standalone Root timer control; never bundled into iOS or the HTTP server.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createCorePgConnection } from "../../backend/src/tripCoreV2PgConnection";
import { runAuthQaCloseControl } from "../../backend/src/authQaCloseControl";
async function main() {
  const mode = process.argv[2];
  if (
    !["close", "verify"].includes(mode) ||
    process.env.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co" ||
    process.env.OTR_DEV_BACKEND_NETWORK_MODE !== "host"
  )
    throw Error();
  const raw = readFileSync("/run/otr/trip-create-runtime.json");
  if (
    createHash("sha256").update(raw).digest("hex") !==
    "e77f733716594264988d6705fcd4dc80100af2eba3a5bbb830ebac96a0d007d5"
  )
    throw Error();
  const config = JSON.parse(raw.toString());
  if (config.version !== 3) throw Error();
  console.log(
    JSON.stringify(
      await runAuthQaCloseControl(
        createCorePgConnection(config.corePg),
        mode === "close",
      ),
    ),
  );
}
void main().catch(() => {
  console.log(JSON.stringify({ status: "AUTH_QA_CLOSURE_UNCONFIRMED", closed: false }));
  process.exitCode = 1;
});

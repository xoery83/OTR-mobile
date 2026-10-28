/** Fixed sustained DEV identity wrapper; shares the reviewed in-place SDK/UNKNOWN path. */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { executeSustainedInPlace } from "./provisionInPlace";
export { executeSustainedInPlace, exactSustainedIdentityQuery } from "./provisionInPlace";
export async function sustainedInPlaceMain() {
  try {
    const result = await executeSustainedInPlace(JSON.parse(readFileSync(0, "utf8")));
    console.log(JSON.stringify(result));
    if (!result.receipt) process.exitCode = 2;
  } catch {
    console.error(JSON.stringify({ status: "SUSTAINED_AUTH_PREFLIGHT_STOP" }));
    process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void sustainedInPlaceMain();

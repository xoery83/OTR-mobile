import {
  prepareUniversalTaskHost,
  UniversalPreparationUnconfirmed,
} from "./universalPreparationOperator";

// No default activation. Caller must already hold the exact finite DEV Gate; this
// command neither installs permissions nor changes the private capability/window.
const argument = process.argv.slice(2);
if (
  argument.length !== 1 ||
  !["--prepare-once", "--recover-only"].includes(argument[0])
) {
  console.error("UNIVERSAL_EXPLICIT_PREPARATION_REQUIRED");
  process.exitCode = 2;
} else {
  try {
    const result = await prepareUniversalTaskHost(
      argument[0] === "--prepare-once" ? "PREPARE_ONCE" : "RECOVER_ONLY",
      process.env,
    );
    console.info(JSON.stringify(result));
  } catch (error) {
    // Never serialize private config, SQL driver errors, Bearer or raw Auth data.
    const safeCodes = new Set([
      "UNIVERSAL_PREPARATION_UNCONFIRMED",
      "OWNING_TASK_READER_UNAVAILABLE",
      "UNIVERSAL_SOURCE_RUNTIME_CLOSED",
      "UNIVERSAL_RUNTIME_CLOSED",
    ]);
    if (error instanceof UniversalPreparationUnconfirmed)
      console.error(
        JSON.stringify({ status: error.message, diagnostic: error.diagnostic }),
      );
    else
      console.error(
        error instanceof Error && safeCodes.has(error.message)
          ? error.message
          : "UNIVERSAL_PREPARATION_BLOCKED_CHECK_OWNING_RECEIPTS",
      );
    process.exitCode = 1;
  }
}

import { z } from "zod";
import { runSettledUniversalRecoveryOperator } from "./universalSettledRecoveryOperator";
const args = process.argv.slice(2);
const price = z.strictObject({
  currency: z.literal("USD"),
  inputNanosPerMillion: z.string().regex(/^\d{1,30}$/),
  cachedInputNanosPerMillion: z.string().regex(/^\d{1,30}$/),
  outputNanosPerMillion: z.string().regex(/^\d{1,30}$/),
});
if (
  args.length !== 5 ||
  args[0] !== "--recover-settled-once" ||
  !/^([a-f0-9]{64})$/.test(args[1])
)
  throw Error("UNIVERSAL_RECOVERY_EXPLICIT_ARGUMENTS_REQUIRED");
try {
  console.log(
    JSON.stringify(
      await runSettledUniversalRecoveryOperator(
        {
          configPath: "/run/otr/universal-recovery.json",
          configSHA256: args[1],
          startsAt: args[2],
          expiresAt: args[3],
          priceSchedule: price.parse(JSON.parse(args[4])),
        },
        process.env,
      ),
    ),
  );
} catch {
  console.error(
    JSON.stringify({
      status: "SETTLED_RECOVERY_UNCONFIRMED_NO_PROVIDER_NO_RETRY",
    }),
  );
  process.exitCode = 1;
}

import { createMemberClaimQaRecoveryWindowQualifier } from "./member-claim-qa-recovery-window";
import { execFile } from "node:child_process";
import { z } from "zod";

const selection = z.strictObject({
  windowId: z.uuid().refine(value => value === value.toLowerCase()),
  planSHA256: z.string().regex(/^[a-f0-9]{64}$/).refine(value => value !== "0".repeat(64)),
});
type Run = (program: string, args: string[], options: { timeout: number; maxBuffer: number }) => Promise<{ stdout: string }>;
const run: Run = (program, args, options) => new Promise((resolve, reject) => {
  execFile(program, args, { ...options, encoding: "utf8" }, (error, stdout) => {
    if (error) reject(error); else resolve({ stdout });
  });
});

// Root driver only; the owning qualifier separately verifies every returned field.
export function createMemberClaimQaControlRead(input: z.infer<typeof selection>, execute: Run = run) {
  const fixed = Object.freeze(selection.parse(input));
  const root = `/opt/otr/dev-backend/releases/auth-c04-qa-${fixed.windowId}`;
  return async (): Promise<unknown> => {
    try {
      const result = await execute("ssh", [
        "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "root@178.105.151.143",
        `python3 ${root}/runtime.py qualify-recovery ${root}/plan.json ${fixed.planSHA256}`,
      ], { timeout: 15000, maxBuffer: 131072 });
      return JSON.parse(result.stdout);
    } catch {
      // Child-process errors can contain stderr; never expose raw control output.
      throw Error("C04_QA_CONTROL_READ_UNCONFIRMED");
    }
  };
}

export function createRootMemberClaimQaRecoveryWindowQualifier(
  input: { windowId: string; expected: Parameters<typeof createMemberClaimQaRecoveryWindowQualifier>[0]["expected"]; now?: () => number },
  execute: Run = run,
) {
  return createMemberClaimQaRecoveryWindowQualifier({
    expected: input.expected,
    now: input.now,
    readControl: createMemberClaimQaControlRead({ windowId: input.windowId, planSHA256: input.expected.planSHA256 }, execute),
  });
}

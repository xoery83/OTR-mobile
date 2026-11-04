import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { readFileSync, openSync, writeFileSync, fsyncSync, closeSync, constants } from "node:fs";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import {
  distinctSharedP1CaseId, distinctSharedP1Command, fixtureCommands, runItemFixtureProbe,
} from "./member-claim-qa-item-fixtures";
import {
  createNormalRegisteredQaHostDependencies, runRegisteredQaHostSession, registeredHostQa,
} from "./registered-qa-host-session";
import plan from "../../docs/ops/auth-c04-distinct-p1-next-day-20261104/CASE.json";

type Normal = Parameters<typeof createNormalRegisteredQaHostDependencies>;
type Runner = Parameters<typeof runItemFixtureProbe>[0];
// At-most-once reservation survives process cleanup; only receipt reconciliation can resolve uncertainty.
export const reserveDistinctSharedP1Attempt: Runner["reserve"] = async (command, intentSha256) => {
  if (JSON.stringify(command) !== JSON.stringify(distinctSharedP1Command) ||
      intentSha256 !== await coreHashValue("otr-trip-core-intent-v2", distinctSharedP1Command,
        async (bytes) => createHash("sha256").update(bytes).digest("hex")))
    throw Error("DISTINCT_RESERVATION_SCOPE_MISMATCH");
  const fd = openSync(resolve("docs/ops/auth-c04-distinct-p1-next-day-20261104/ATTEMPT.json"),
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    writeFileSync(fd, JSON.stringify({ phase: "RESERVED_NOT_PROOF_OF_COMMIT",
      reservedAt: new Date().toISOString(), caseId: plan.caseId, command, intentSha256,
      automaticRetry: false, secretsOrOtpRecorded: false }) + "\n");
    fsyncSync(fd);
  } finally { closeSync(fd); }
};
// Host-only composition. Caller supplies the existing scoped receiver and current execution qualifier.
export function runDistinctSharedP1NextDay(input: {
  receivers: { A: Normal[0]; B: Normal[0] };
  publicOptions: Normal[2];
  qualify: NonNullable<Runner["beforeDistinctRun"]>;
  noteCore: Runner["note"];
  noteAuth(actor: "A" | "B", value: Record<string, unknown>): void;
}) {
  return runItemFixtureProbe({
    caseId: distinctSharedP1CaseId,
    beforeDistinctRun: input.qualify,
    reserve: reserveDistinctSharedP1Attempt,
    note: input.noteCore,
    withOwnerSession: (work) => runRegisteredQaHostSession(
      createNormalRegisteredQaHostDependencies(input.receivers.A,
        (value) => input.noteAuth("A", value), input.publicOptions), work,
      { accountId: plan.ownerAccountId, tripId: plan.tripId,
        email: "otr-qa-3f43c81b-500b-4e59-b0a8-c7ffdbd19a31@eldouzileu.resend.app" },
    ),
    withMemberSession: (work) => runRegisteredQaHostSession(
      createNormalRegisteredQaHostDependencies(input.receivers.B,
        (value) => input.noteAuth("B", value), input.publicOptions), work,
      { accountId: plan.memberAccountId, tripId: plan.tripId,
        email: registeredHostQa.email, createdAt: registeredHostQa.createdAt },
    ),
  });
}
const packetFiles = [
  "scripts/auth/distinct-shared-p1-next-day.ts",
  "scripts/auth/member-claim-qa-item-fixtures.ts",
  "scripts/auth/member-claim-qa-member-read.ts",
  "scripts/auth/registered-qa-host-session.ts",
  "scripts/auth/resend-inbound-otp-native-relogin.ts",
  "src/data/api/tripCoreV2Transport.ts",
  "backend/src/authDistinctSharedP1Packet.test.ts",
  "docs/ops/auth-c04-distinct-p1-next-day-20261104/CASE.json",
  "docs/ops/auth-c04-distinct-p1-next-day-20261104/COMMAND.json",
  "docs/ops/auth-c04-distinct-p1-next-day-20261104/WIRE_BODY.json",
  "docs/ops/auth-c04-distinct-p1-next-day-20261104/PLAN.json",
  "docs/ops/auth-c04-distinct-p1-next-day-20261104/PERMISSION_DELTA.json",
  "docs/ops/auth-c04-distinct-p1-next-day-20261104/RUNBOOK.md"
];
export async function checkDistinctSharedP1Packet() {
  const manifest = JSON.parse(readFileSync("docs/ops/auth-c04-distinct-p1-next-day-20261104/MANIFEST.json", "utf8"));
  if (manifest.caseId !== plan.caseId || Object.keys(manifest.files).length !== packetFiles.length)
    throw Error("PACKET_MANIFEST_SCOPE_MISMATCH");
  for (const file of packetFiles)
    if (createHash("sha256").update(readFileSync(file)).digest("hex") !== manifest.files[file])
      throw Error("PACKET_ARTIFACT_CHANGED");
  const old = fixtureCommands[0];
  if (distinctSharedP1Command.operationId === old.operationId ||
      distinctSharedP1Command.target.id === old.target.id ||
      plan.intent.date === plan.distinctFromOriginal.originalDate ||
      plan.intent.title === plan.distinctFromOriginal.originalTitle ||
      plan.distinctFromOriginal.originalReplayAllowed ||
      plan.distinctFromOriginal.operationReplacementAllowed)
    throw Error("DISTINCT_INTENT_REQUIRED");
  const canonical = canonicalCoreJson(distinctSharedP1Command as unknown as Json);
  const wire = JSON.stringify(distinctSharedP1Command);
  const retained = readFileSync("docs/ops/auth-c04-distinct-p1-next-day-20261104/COMMAND.json", "utf8").trim();
  if (retained !== canonical ||
      readFileSync("docs/ops/auth-c04-distinct-p1-next-day-20261104/WIRE_BODY.json", "utf8") !== wire)
    throw Error("FIXED_COMMAND_MISMATCH");
  const intentSha256 = await coreHashValue("otr-trip-core-intent-v2", distinctSharedP1Command,
    async (bytes) => createHash("sha256").update(bytes).digest("hex"));
  return { status: "LOCAL_PACKET_VALID_NOT_SENT", caseId: plan.caseId,
    operationId: plan.operationId, itemId: plan.itemId, intentSha256,
    wireSha256: createHash("sha256").update(wire).digest("hex"), networkRequests: 0 };
}
if (basename(process.argv[1] ?? "") === "distinct-shared-p1-next-day.ts") {
  if (process.argv[2] !== "--check") throw Error("LOCAL_CHECK_ONLY_NO_EXECUTION_AUTHORITY");
  void checkDistinctSharedP1Packet().then((result) => console.log(JSON.stringify(result))).catch(() => {
    console.error("DISTINCT_PACKET_CHECK_FAILED"); process.exitCode = 1;
  });
}

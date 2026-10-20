import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  legacyExtractSchema,
  stage9TransformConfigSchema,
} from "../../backend/src/stage9Import";
import { resolveStage9AuthenticatedMember } from "./extract-production";
import { readCommittedStage9Raw } from "./transform-private";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function memberRef(namespaceKey: string, sourceMemberId: string) {
  return createHmac("sha256", namespaceKey)
    .update(`member|${sourceMemberId}`)
    .digest("hex");
}

function equalHex(left: string, right: string) {
  return (
    /^[a-f0-9]{64}$/.test(left) &&
    /^[a-f0-9]{64}$/.test(right) &&
    timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"))
  );
}

export function buildResolvedStage9Mapping(input: {
  raw: unknown;
  config: unknown;
  sourceMemberId: string;
  expectedMemberRefHmac: string;
}) {
  const raw = legacyExtractSchema.parse(input.raw);
  if (
    input.config === null ||
    typeof input.config !== "object" ||
    Array.isArray(input.config)
  )
    throw new Error("STAGE9_MAPPING_CONFIG_INVALID");
  const config = input.config as Record<string, unknown>;
  const namespaceKey = config.namespaceKey;
  const devOperatorUserId = config.devOperatorUserId;
  const existing = config.linkedUserBySourceMemberId;
  if (
    typeof namespaceKey !== "string" ||
    namespaceKey.length < 32 ||
    typeof devOperatorUserId !== "string" ||
    !uuidPattern.test(devOperatorUserId) ||
    existing === null ||
    typeof existing !== "object" ||
    Array.isArray(existing)
  )
    throw new Error("STAGE9_MAPPING_CONFIG_INVALID");
  const sourceMembers = new Map(raw.journeyMembers.map((member) => [member.id, member]));
  const resolvedMember = sourceMembers.get(input.sourceMemberId);
  if (!resolvedMember) throw new Error("STAGE9_MAPPING_MEMBER_NOT_IN_COMMITTED_RAW");
  const resolvedRef = memberRef(namespaceKey, input.sourceMemberId);
  if (!equalHex(resolvedRef, input.expectedMemberRefHmac))
    throw new Error("STAGE9_MAPPING_MEMBER_HMAC_MISMATCH");
  if (resolvedMember.role !== "owner") throw new Error("STAGE9_MAPPING_MEMBER_NOT_OWNER");

  const existingEntries = Object.entries(existing as Record<string, unknown>);
  const validExisting = existingEntries.filter(
    ([sourceId, targetId]) =>
      sourceMembers.has(sourceId) &&
      typeof targetId === "string" &&
      uuidPattern.test(targetId),
  ) as [string, string][];
  const retained = validExisting.filter(
    ([sourceId]) => sourceId !== input.sourceMemberId,
  );
  if (retained.some(([, targetId]) => targetId === devOperatorUserId))
    throw new Error("STAGE9_MAPPING_DEV_OPERATOR_REUSED");
  const linkedUserBySourceMemberId = Object.fromEntries([
    ...retained,
    [input.sourceMemberId, devOperatorUserId],
  ]);
  const nextConfig = stage9TransformConfigSchema.parse({
    namespaceKey,
    devOperatorUserId,
    linkedUserBySourceMemberId,
  });
  return {
    config: nextConfig,
    memberRefHmac: resolvedRef,
    invalidMappingEntriesRemoved: existingEntries.length - validExisting.length,
    validMappingCount: Object.keys(linkedUserBySourceMemberId).length,
  };
}

function locateCommittedRaw(privateRoot: string, expectedRawSha256: string) {
  const matches: string[] = [];
  for (const entry of readdirSync(privateRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("run-")) continue;
    const rawPath = join(privateRoot, entry.name, "raw", "legacy-extract.json");
    const receiptPath = join(privateRoot, entry.name, "raw", "stage9-raw-commit.json");
    if (!existsSync(rawPath) || !existsSync(receiptPath)) continue;
    try {
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as Record<
        string,
        unknown
      >;
      if (receipt.state === "COMMITTED" && receipt.rawSha256 === expectedRawSha256)
        matches.push(rawPath);
    } catch {
      continue;
    }
  }
  if (matches.length !== 1)
    throw new Error(`STAGE9_COMMITTED_RAW_NOT_UNIQUE:${matches.length}`);
  return matches[0]!;
}

function replacePrivateConfig(path: string, value: unknown) {
  const parent = dirname(path);
  const temporary = join(parent, `.stage9-mapping-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    const file = openSync(temporary, "r");
    try {
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
    renameSync(temporary, path);
    chmodSync(path, 0o600);
    const directory = openSync(parent, "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } catch (error) {
    if (existsSync(temporary)) rmSync(temporary);
    throw error;
  }
}

async function main() {
  const privateRoot = realpathSync(
    required(process.env.OTR_STAGE9_PRIVATE_ROOT, "OTR_STAGE9_PRIVATE_ROOT"),
  );
  const configPath = resolve(
    required(
      process.env.OTR_STAGE9_TRANSFORM_CONFIG_PATH,
      "OTR_STAGE9_TRANSFORM_CONFIG_PATH",
    ),
  );
  const expectedRawSha256 = required(
    process.env.OTR_STAGE9_EXPECTED_RAW_SHA256,
    "OTR_STAGE9_EXPECTED_RAW_SHA256",
  );
  const expectedMemberRefHmac = required(
    process.env.OTR_STAGE9_EXPECTED_MEMBER_REF_HMAC,
    "OTR_STAGE9_EXPECTED_MEMBER_REF_HMAC",
  );
  if (!/^[a-f0-9]{64}$/.test(expectedRawSha256))
    throw new Error("STAGE9_EXPECTED_RAW_SHA256_INVALID");
  const configMetadata = lstatSync(configPath);
  if (
    !configMetadata.isFile() ||
    configMetadata.isSymbolicLink() ||
    configMetadata.mode & 0o077 ||
    (typeof process.getuid === "function" && configMetadata.uid !== process.getuid())
  )
    throw new Error("STAGE9_MAPPING_CONFIG_PERMISSIONS_UNSAFE");

  const rawPath = locateCommittedRaw(privateRoot, expectedRawSha256);
  const before = readCommittedStage9Raw(rawPath);
  if (sha256(before) !== expectedRawSha256)
    throw new Error("STAGE9_COMMITTED_RAW_DIGEST_MISMATCH");
  const raw = JSON.parse(before.toString("utf8"));
  const config = JSON.parse(readFileSync(configPath, "utf8"));

  const sourceMemberId = await resolveStage9AuthenticatedMember({
    sourceUrl: required(
      process.env.OTR_STAGE9_SOURCE_SUPABASE_URL,
      "OTR_STAGE9_SOURCE_SUPABASE_URL",
    ),
    projectRef: required(
      process.env.OTR_STAGE9_SOURCE_PROJECT_REF,
      "OTR_STAGE9_SOURCE_PROJECT_REF",
    ),
    journeyId: required(
      process.env.OTR_STAGE9_SOURCE_JOURNEY_ID,
      "OTR_STAGE9_SOURCE_JOURNEY_ID",
    ),
    publishableKey: required(
      process.env.OTR_STAGE9_SOURCE_PUBLISHABLE_KEY,
      "OTR_STAGE9_SOURCE_PUBLISHABLE_KEY",
    ),
    accessTokenPath: required(
      process.env.OTR_STAGE9_SOURCE_ACCESS_TOKEN_FILE,
      "OTR_STAGE9_SOURCE_ACCESS_TOKEN_FILE",
    ),
    privateRoot,
    estimatedOperationSeconds: Number(
      required(
        process.env.OTR_STAGE9_ESTIMATED_TWO_PASS_SECONDS,
        "OTR_STAGE9_ESTIMATED_TWO_PASS_SECONDS",
      ),
    ),
  });

  const after = readCommittedStage9Raw(rawPath);
  if (sha256(after) !== expectedRawSha256)
    throw new Error("STAGE9_COMMITTED_RAW_CHANGED");
  const resolved = buildResolvedStage9Mapping({
    raw,
    config,
    sourceMemberId,
    expectedMemberRefHmac,
  });
  replacePrivateConfig(configPath, resolved.config);
  console.info(
    JSON.stringify({
      state: "MAPPING_UPDATED",
      memberRefHmac: resolved.memberRefHmac,
      invalidMappingEntriesRemoved: resolved.invalidMappingEntriesRemoved,
      validMappingCount: resolved.validMappingCount,
      committedRawUnchanged: true,
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "STAGE9_MAPPING_FAILED");
    process.exitCode = 1;
  });
}

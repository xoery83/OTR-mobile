import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  canonicalStage9Json,
  STAGE9_TRANSFORM_VERSION,
  stage9TransformConfigSchema,
  transformLegacyExtract,
} from "../../backend/src/stage9Import";

const projectRoot = resolve(import.meta.dirname, "../..");
const legacyRoot = "/Users/xoery/Project/otr";

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return resolve(value);
}

function outsideRepository(path: string, repository: string) {
  const candidate = relative(repository, path);
  return candidate.startsWith("..") && !isAbsolute(candidate);
}

function writePrivate(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  chmodSync(path, 0o400);
}

export function readCommittedStage9Raw(rawPath: string) {
  if ((statSync(rawPath).mode & 0o222) !== 0)
    throw new Error("Raw extract must be immutable before transformation.");
  if (
    basename(dirname(rawPath)) !== "raw" ||
    (statSync(dirname(rawPath)).mode & 0o222) !== 0
  )
    throw new Error("Raw extract is not an atomically committed bundle.");
  const receiptPath = join(dirname(rawPath), "stage9-raw-commit.json");
  if ((statSync(receiptPath).mode & 0o222) !== 0)
    throw new Error("Raw commit receipt must be immutable.");
  const rawBytes = readFileSync(rawPath);
  const commitReceipt = JSON.parse(readFileSync(receiptPath, "utf8")) as Record<
    string,
    unknown
  >;
  const expectedDigest = readFileSync(
    join(dirname(rawPath), "legacy-extract.sha256"),
    "utf8",
  ).trim();
  const actualDigest = createHash("sha256").update(rawBytes).digest("hex");
  if (
    commitReceipt.receiptVersion !== "stage9-raw-commit-v1" ||
    commitReceipt.state !== "COMMITTED" ||
    commitReceipt.rawSha256 !== actualDigest
  )
    throw new Error("Raw extract does not have a valid committed receipt.");
  if (!/^[a-f0-9]{64}$/.test(expectedDigest) || expectedDigest !== actualDigest)
    throw new Error("Raw extract digest does not match its immutable source digest.");
  return rawBytes;
}

export function runStage9PrivateTransform() {
  const rawPath = required(
    process.env.OTR_STAGE9_RAW_EXTRACT_PATH,
    "OTR_STAGE9_RAW_EXTRACT_PATH",
  );
  const configPath = required(
    process.env.OTR_STAGE9_TRANSFORM_CONFIG_PATH,
    "OTR_STAGE9_TRANSFORM_CONFIG_PATH",
  );
  const runRoot = resolve(dirname(rawPath), "..");
  if (
    !outsideRepository(runRoot, projectRoot) ||
    !outsideRepository(runRoot, legacyRoot) ||
    !outsideRepository(configPath, projectRoot) ||
    !outsideRepository(configPath, legacyRoot)
  ) {
    throw new Error(
      "Stage 9 private inputs and outputs must remain outside repositories.",
    );
  }
  if ((statSync(configPath).mode & 0o077) !== 0)
    throw new Error("Transform config permissions are not restrictive.");

  const rawBytes = readCommittedStage9Raw(rawPath);
  const raw = JSON.parse(rawBytes.toString("utf8"));
  const config = stage9TransformConfigSchema.parse(
    JSON.parse(readFileSync(configPath, "utf8")),
  );
  const result = transformLegacyExtract(raw, config);
  const repeated = transformLegacyExtract(raw, config);
  if (canonicalStage9Json(result.dataset) !== canonicalStage9Json(repeated.dataset))
    throw new Error("STAGE9_TRANSFORM_NOT_BYTE_IDENTICAL");
  const versionRoot = join(runRoot, STAGE9_TRANSFORM_VERSION);
  const transformedRoot = join(versionRoot, "transformed");
  const privateReportRoot = join(versionRoot, "reports-private");
  const safeReportRoot = join(versionRoot, "reports-safe");
  for (const directory of [transformedRoot, privateReportRoot, safeReportRoot]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
  }
  writePrivate(join(transformedRoot, "stage9-dataset.json"), result.dataset);
  writePrivate(
    join(privateReportRoot, "approval-manifest.json"),
    result.privateApprovalManifest,
  );
  writePrivate(join(privateReportRoot, "unloaded-reviews.json"), result.unloadedReviews);
  writePrivate(join(safeReportRoot, "repo-safe-summary.json"), result.repoSafeSummary);
  writePrivate(join(safeReportRoot, "redaction-report.json"), result.privacyReport);

  console.info(
    JSON.stringify({
      state: result.repoSafeSummary.state,
      sourceRowCounts: result.repoSafeSummary.sourceRowCounts,
      destinationEntityCounts: result.repoSafeSummary.destinationEntityCounts,
      classificationCounts: result.repoSafeSummary.classificationCounts,
      reviewReasonCounts: result.repoSafeSummary.reviewReasonCounts,
      legacyEqualSettlementResidualCount:
        result.repoSafeSummary.legacyEqualSettlementResidualCount,
      legacyEqualRoundingNormalizedCount:
        result.repoSafeSummary.legacyEqualRoundingNormalizedCount,
      privacyPassed: result.repoSafeSummary.privacyPassed,
      validation: result.repoSafeSummary.validation,
      deterministicReplayByteIdentical: true,
      transformedDatasetSha256: result.repoSafeSummary.transformedDatasetSha256,
      estimatedDevLoadBytes: result.repoSafeSummary.estimatedDevLoadBytes,
      privateManifestWritten: true,
      repoSafeSummaryWritten: true,
      redactionReportWritten: true,
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename))
  runStage9PrivateTransform();

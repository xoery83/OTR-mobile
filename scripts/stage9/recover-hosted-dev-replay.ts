import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  canonicalStage9Json,
  deterministicStage9Uuid,
  scanStage9Privacy,
  stage9DatasetSchema,
  stage9Sha256,
  STAGE9_TARGET_PROJECT_REF,
  type Stage9Dataset,
  type Stage9PrivateApprovalManifest,
} from "../../backend/src/stage9Import";
import { loadStage9Dataset } from "../../backend/src/stage9Loader";
import {
  expectedDatasetSha256,
  expectedRawSha256,
  targetSnapshot,
  verifyHostedRows,
  verifyPayload,
} from "./load-hosted-dev";
import { readCommittedStage9Raw } from "./transform-private";

const sourceJourneyId = "ae2fb30d-6e31-8ff9-8b14-f8a1b275cf65";
const replacementJourneyId = "ec3ae448-3fa5-84a9-a986-655a243cf3ad";
const expectedContaminatedFingerprint =
  "b001270b71956b828ae7fa92b247f77622e0ab7576f36ed830d3f0f09ec909e7";
const expectedRetiredFingerprint =
  "d69866ea72293f80d9201cd7020f3ae58e8ca0651db64f2daa41e81d9f8d797d";
const expectedReplacementFingerprint =
  "97fa314b965dd6af0f1337147301bdfb345e8a0060e1de0c56c6b421dcd83ce2";
const recoveryNamespace = "otr-stage9-europe-replay-recovery-v1";
const executeToken = "CONFIRM_VERSIONED_REPLACEMENT_V1";

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function replacementDataset(source: Stage9Dataset): Stage9Dataset {
  const remap = (kind: string, id: string) =>
    deterministicStage9Uuid(recoveryNamespace, kind, id);
  const memberIds = new Map(source.members.map(({ id }) => [id, remap("member", id)]));
  const expenseIds = new Map(source.expenses.map(({ id }) => [id, remap("expense", id)]));
  const rateIds = new Map(
    source.rateSnapshots.map(({ id }) => [id, remap("rate-snapshot", id)]),
  );
  const requiredId = (ids: Map<string, string>, id: string) => {
    const mapped = ids.get(id);
    assert(mapped, "REPLACEMENT_REFERENCE_MISSING");
    return mapped;
  };
  const dataset = stage9DatasetSchema.parse({
    ...source,
    journey: { ...source.journey, id: replacementJourneyId },
    members: source.members.map((member) => ({
      ...member,
      id: requiredId(memberIds, member.id),
    })),
    expenses: source.expenses.map((expense) => ({
      ...expense,
      id: requiredId(expenseIds, expense.id),
      payerMemberId: requiredId(memberIds, expense.payerMemberId),
    })),
    participants: source.participants.map((participant) => ({
      ...participant,
      expenseId: requiredId(expenseIds, participant.expenseId),
      memberId: requiredId(memberIds, participant.memberId),
    })),
    splits: source.splits.map((split) => ({
      ...split,
      expenseId: requiredId(expenseIds, split.expenseId),
      memberId: requiredId(memberIds, split.memberId),
    })),
    rateSnapshots: source.rateSnapshots.map((rate) => ({
      ...rate,
      id: requiredId(rateIds, rate.id),
      expenseId: requiredId(expenseIds, rate.expenseId),
    })),
    valuations: source.valuations.map((valuation) => ({
      ...valuation,
      id: remap("valuation", valuation.id),
      expenseId: requiredId(expenseIds, valuation.expenseId),
      rateSnapshotId: requiredId(rateIds, valuation.rateSnapshotId),
    })),
    reviewFindings: source.reviewFindings.map((finding) => ({
      ...finding,
      id: remap("review-finding", finding.id),
      expenseId: requiredId(expenseIds, finding.expenseId),
    })),
  });
  assert(dataset.journey.id === replacementJourneyId, "REPLACEMENT_ID_REJECTED");
  assert(scanStage9Privacy(dataset).passed, "REPLACEMENT_PRIVACY_REJECTED");
  return dataset;
}

function equivalentPayload(source: Stage9Dataset, replacement: Stage9Dataset) {
  const withoutIdentity = (dataset: Stage9Dataset) => ({
    ...dataset,
    journey: { ...dataset.journey, id: null },
    members: dataset.members.map(({ id: _id, ...member }) => member),
    expenses: dataset.expenses.map(
      ({ id: _id, payerMemberId: _payer, ...expense }) => expense,
    ),
    participants: dataset.participants.map(
      ({ expenseId: _expense, memberId: _member, ...participant }) => participant,
    ),
    splits: dataset.splits.map(
      ({ expenseId: _expense, memberId: _member, ...split }) => split,
    ),
    rateSnapshots: dataset.rateSnapshots.map(
      ({ id: _id, expenseId: _expense, ...rate }) => rate,
    ),
    valuations: dataset.valuations.map(
      ({ id: _id, expenseId: _expense, rateSnapshotId: _rate, ...valuation }) =>
        valuation,
    ),
    reviewFindings: dataset.reviewFindings.map(
      ({ id: _id, expenseId: _expense, ...finding }) => finding,
    ),
  });
  return (
    canonicalStage9Json(withoutIdentity(source)) ===
    canonicalStage9Json(withoutIdentity(replacement))
  );
}

async function run() {
  const root = resolve(required(process.env.OTR_STAGE9_V3_ROOT, "OTR_STAGE9_V3_ROOT"));
  const url = required(process.env.OTR_DEV_SUPABASE_URL, "OTR_DEV_SUPABASE_URL");
  const secretKey = required(
    process.env.OTR_DEV_SUPABASE_SECRET_KEY,
    "OTR_DEV_SUPABASE_SECRET_KEY",
  );
  assert(
    new URL(url).origin === `https://${STAGE9_TARGET_PROJECT_REF}.supabase.co`,
    "TARGET_REJECTED_BEFORE_CLIENT",
  );

  const datasetPath = join(root, "transformed", "stage9-dataset.json");
  const manifestPath = join(root, "reports-private", "approval-manifest.json");
  const rawPath = join(dirname(root), "raw", "legacy-extract.json");
  const source = stage9DatasetSchema.parse(JSON.parse(readFileSync(datasetPath, "utf8")));
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  ) as Stage9PrivateApprovalManifest;
  verifyPayload(source, manifest);
  assert(source.journey.id === sourceJourneyId, "SOURCE_JOURNEY_REJECTED");
  assert(sha256(readCommittedStage9Raw(rawPath)) === expectedRawSha256, "RAW_REJECTED");

  const replacement = replacementDataset(source);
  assert(equivalentPayload(source, replacement), "REPLACEMENT_PAYLOAD_DRIFT");
  const replacementDigest = stage9Sha256(replacement);
  const replacementManifest: Stage9PrivateApprovalManifest = {
    ...manifest,
    target: { ...manifest.target, journeyId: replacementJourneyId },
    transformedDatasetSha256: replacementDigest,
    estimatedDevLoadBytes: Buffer.byteLength(canonicalStage9Json(replacement)),
  };

  const client = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const sourceBefore = await targetSnapshot(client, sourceJourneyId);
  assert(
    [expectedContaminatedFingerprint, expectedRetiredFingerprint].includes(
      sourceBefore.digest,
    ),
    `CONTAMINATED_FINGERPRINT_REJECTED:${sourceBefore.digest}`,
  );
  const replacementBefore = await targetSnapshot(client, replacementJourneyId);
  if (Object.values(replacementBefore.snapshot).some((rows) => rows.length > 0)) {
    const counts = await verifyHostedRows(client, replacement, replacementDigest);
    assert(
      replacementBefore.digest === expectedReplacementFingerprint,
      "REPLACEMENT_FINGERPRINT_REJECTED",
    );
    const replay = await loadStage9Dataset({
      target: "hosted-dev",
      url,
      secretKey,
      actorUserId: replacement.journey.createdByUserId,
      dataset: replacement,
      manifest: replacementManifest,
    });
    assert(replay.idempotentReplay === true, "REPLACEMENT_REPLAY_REJECTED");
    const replacementAfter = await targetSnapshot(client, replacementJourneyId);
    assert(
      replacementAfter.digest === replacementBefore.digest,
      "REPLACEMENT_REPLAY_CHANGED_ROWS",
    );
    console.info(
      JSON.stringify({
        verificationPassed: true,
        mutationPerformed: false,
        sourceJourneyId,
        sourceFingerprint: sourceBefore.digest,
        replacementJourneyId,
        replacementDatasetSha256: replacementDigest,
        replacementFingerprint: replacementAfter.digest,
        payloadEquivalentExceptIdentity: true,
        counts,
        idempotentReplayZeroChanges: true,
        productionAccess: false,
      }),
    );
    return;
  }
  assert(
    Object.values(replacementBefore.snapshot).every((rows) => rows.length === 0),
    "REPLACEMENT_TARGET_NOT_EMPTY",
  );

  if (process.env.OTR_STAGE9_RECOVER_REPLAY !== executeToken) {
    console.info(
      JSON.stringify({
        preflightPassed: true,
        mutationPerformed: false,
        sourceJourneyId,
        sourceFingerprint: sourceBefore.digest,
        sourceDatasetSha256: expectedDatasetSha256,
        replacementJourneyId,
        replacementDatasetSha256: replacementDigest,
        payloadEquivalentExceptIdentity: true,
      }),
    );
    return;
  }

  const first = await loadStage9Dataset({
    target: "hosted-dev",
    url,
    secretKey,
    actorUserId: replacement.journey.createdByUserId,
    dataset: replacement,
    manifest: replacementManifest,
  });
  assert(first.idempotentReplay === false, "FIRST_IMPORT_NOT_NEW");
  const counts = await verifyHostedRows(client, replacement, replacementDigest);
  const afterFirst = await targetSnapshot(client, replacementJourneyId);
  const second = await loadStage9Dataset({
    target: "hosted-dev",
    url,
    secretKey,
    actorUserId: replacement.journey.createdByUserId,
    dataset: replacement,
    manifest: replacementManifest,
  });
  assert(second.idempotentReplay === true, "SECOND_IMPORT_NOT_IDEMPOTENT");
  const afterSecond = await targetSnapshot(client, replacementJourneyId);
  assert(afterFirst.digest === afterSecond.digest, "SECOND_IMPORT_CHANGED_ROWS");
  const sourceAfter = await targetSnapshot(client, sourceJourneyId);
  assert(sourceAfter.digest === sourceBefore.digest, "SOURCE_FIXTURE_CHANGED");

  console.info(
    JSON.stringify({
      recoveryMethod: "VERSIONED_REPLACEMENT",
      sourceJourneyId,
      sourceFingerprint: sourceAfter.digest,
      replacementJourneyId,
      replacementDatasetSha256: replacementDigest,
      replacementFingerprint: afterSecond.digest,
      payloadEquivalentExceptIdentity: true,
      counts,
      secondImportZeroChanges: true,
      productionAccess: false,
    }),
  );
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "REPLAY_RECOVERY_FAILED");
  process.exitCode = 1;
});

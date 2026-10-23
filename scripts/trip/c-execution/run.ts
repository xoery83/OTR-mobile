#!/usr/bin/env node
/** Fixed four-path QA driver. --prepare has no effects; --execute requires future exact Owner gate.
 * Credentials only arrive on stdin and are retained in memory. No raw exceptions/HTTP bodies logged.
 */
import { ApiClientError } from "../../../src/data/api/client";
import payloads from "./proposed-payloads.json";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import {
  createAuthenticatedHeadlessRunner,
  QA,
  assertExactUndispatchedCreateResume,
} from "./headless";
import { canonicalReadback } from "./readback";
const execute = promisify(execFile);
const canonical = (v: unknown): string =>
  JSON.stringify(
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v)
            .sort()
            .map(([k, x]) => [k, JSON.parse(canonical(x))]),
        )
      : Array.isArray(v)
        ? v.map((x) => JSON.parse(canonical(x)))
        : v,
  );
const hash = (v: unknown) => createHash("sha256").update(canonical(v)).digest("hex");
async function main() {
  const path = resolve(process.argv[3] ?? "");
  const gate = JSON.parse(readFileSync(path, "utf8"));
  if (process.argv[2] !== "--execute") {
    console.log(JSON.stringify({ status: "PREPARED_NOT_EXECUTED", qa: QA }));
    return;
  }
  if (
    gate.ownerAuthorized !== true ||
    gate.project !== "tuqigdxrvrerfewsxqgm" ||
    hash(
      Object.fromEntries(Object.entries(gate).filter(([k]) => k !== "manifestSHA256")),
    ) !== gate.manifestSHA256
  )
    throw Error("C_EXACT_MANIFEST_REQUIRED");
  const credentials = JSON.parse(readFileSync(0, "utf8"));
  const receiptOnlyResume = gate.resume?.kind === "EXACT_RECEIPT_ONLY_FAILURE_CREATE";
  if (receiptOnlyResume) {
    const previousBytes = readFileSync(
      "/private/tmp/otr-c-qa-20261023-recovery/execution-summary.json",
    );
    const previous = JSON.parse(previousBytes.toString());
    if (
      createHash("sha256").update(previousBytes).digest("hex") !==
        gate.resume.previousSummarySHA256 ||
      previous.counts.reads !== 8 ||
      previous.counts.mutations !== 0 ||
      previous.close?.status !== "CLOSED_VERIFIED" ||
      previous.create ||
      previous.edit ||
      gate.resume.previousReadCharges !== 8 ||
      gate.resume.previousMutationCharges !== 0
    )
      throw Error("C_ACTUAL_RECEIPT_ONLY_FAILURE_PROOF_REQUIRED");
  }
  // Actual admin provisioning receipts, not caller-picked fixture identities. Provisioning is a separate
  // approved Auth-only step; this driver never assumes an existing user or scans Auth users.
  for (const label of ["A", "B"] as const) {
    if (
      credentials[label]?.provisionReceipt?.id !== gate.actorIds[label] ||
      credentials[label].provisionReceipt.newlyCreated !== true ||
      credentials[label].provisionReceipt.project !== gate.project
    )
      throw Error("C_REAL_PROVISION_RECEIPT_REQUIRED");
  }
  const databaseDirectory = dirname(resolve(gate.databasePath));
  const dir = gate.resume
    ? resolve(gate.resume.evidenceDirectory ?? "")
    : databaseDirectory;
  if (gate.resume) {
    if (
      !dir.startsWith("/private/tmp/otr-c-qa-") ||
      dir === databaseDirectory ||
      existsSync(dir)
    )
      throw Error("C_FRESH_RESUME_EVIDENCE_DIRECTORY_REQUIRED");
    mkdirSync(dir, { mode: 0o700 });
    const info = lstatSync(dir);
    if (
      info.isSymbolicLink() ||
      info.uid !== process.getuid?.() ||
      (info.mode & 0o777) !== 0o700 ||
      realpathSync(dir) !== dir
    )
      throw Error("C_RESUME_EVIDENCE_CUSTODY_INVALID");
  }
  if (existsSync(gate.databasePath)) {
    if (
      (!receiptOnlyResume && gate.resume?.kind !== "EXACT_UNDISPATCHED_CREATE_ONLY") ||
      gate.resume.previousReadCharges !== (receiptOnlyResume ? 8 : 3) ||
      gate.resume.previousMutationCharges !== 0
    )
      throw Error("C_QA_STATE_ALREADY_EXISTS_STOP_NO_RETRY");
    assertExactUndispatchedCreateResume(
      gate.databasePath,
      gate.actorIds.A,
      receiptOnlyResume,
    );
  } else if (gate.resume) throw Error("C_EXPECTED_QA_RESUME_STATE_MISSING");
  const runner = await createAuthenticatedHeadlessRunner({
    window: {
      startsAt: gate.startsAt,
      expiresAt: gate.expiresAt,
      actorIds: gate.actorIds,
      mode: "DEV",
    },
    databasePath: gate.databasePath,
    previousReadCharges: gate.resume?.previousReadCharges,
    publishableKey: credentials.publishableKey,
    authOrigin: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    backendOrigin: "https://api-dev.xoery.art",
  });
  const control = resolve(dirname(path), gate.controlPath);
  if (
    createHash("sha256").update(readFileSync(control)).digest("hex") !==
    gate.controlSHA256
  )
    throw Error("C_CONTROL_CODE_DRIFT");
  const command = async (action: string) => {
    const { stdout } = await execute(
      "python3",
      [control, action, path, dir, "--manifest-sha", gate.manifestSHA256],
      { timeout: 350000, maxBuffer: 500000 },
    );
    const r = JSON.parse(stdout);
    if (r.status === "RECONCILE_REQUIRED" || r.status?.startsWith("STOPPED"))
      throw Error("C_CONTROL_FAILED");
    return r;
  };
  const read = () =>
    canonicalReadback({
      cli: gate.supabaseCli,
      linkedWorktree: gate.linkedWorktree,
      privateDirectory: dir,
      actorId: gate.actorIds.A,
      budget: runner.budget,
    });
  const summary: { [k: string]: unknown } = {
    status: "BLOCKED",
    mode: "REAL_DEV_NOT_NATIVE",
    windowId: gate.windowId,
  };
  let armed = false;
  const denied = async (work: () => Promise<unknown>, status: number, code: string) => {
    try {
      await work();
    } catch (e) {
      if (
        e instanceof ApiClientError &&
        e.kind === "http" &&
        e.status === status &&
        e.code === code
      )
        return;
      throw e;
    }
    throw Error("C_EXPECTED_DENIAL_NOT_OBSERVED");
  };
  const assertCompleted = (id: string) => {
    const row = runner.queueState().find((r) => r.id === id);
    if (!row || row.status !== "COMPLETED") throw Error("C_QUEUE_NOT_ACCEPTED");
  };

  try {
    for (const label of (receiptOnlyResume ? ["A"] : ["A", "B"]) as ("A" | "B")[])
      await runner.login(
        label,
        credentials[label].password,
        credentials[label].provisionReceipt,
      );
    await runner.select("A");
    const empty = receiptOnlyResume ? null : await read();
    if (
      empty &&
      (empty.trip ||
        empty.ledger ||
        empty.owners.length ||
        empty.expenses ||
        empty.payments ||
        empty.personalPayments ||
        empty.settlements)
    )
      throw Error("C_QA_COLLISION");
    await command("arm");
    armed = true;
    // Attest separate process arm receipt before any SQL LOGIN/gate/runtime mount.
    const deadline = Date.now() + 3000;
    while (!existsSync(dir + "/watchdog-armed.json") && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 20));
    if (!existsSync(dir + "/watchdog-armed.json")) throw Error("C_WATCHDOG_NOT_ARMED");
    runner.setOnline(false);
    await runner.saveCreate();
    await runner.dispatchCreate();
    await runner.reopen();
    await command("activate-create");
    runner.setOnline(true);
    await runner.dispatchCreate();
    await runner.recoverQueuedReceipt("create");
    assertCompleted(QA.createOperationId);
    const cr = runner.receipts().create;
    if (
      !cr ||
      cr.actorAccountId !== gate.actorIds.A ||
      cr.operationId !== QA.createOperationId ||
      cr.tripId !== QA.tripId ||
      cr.name !== payloads.create.body.name ||
      cr.destination !== payloads.create.body.destination
    )
      throw Error("C_ACCEPTED_CREATE_RECEIPT_REQUIRED");
    const created = await read();
    if (
      created.trip?.created_by !== gate.actorIds.A ||
      created.trip?.metadata_revision !== 0 ||
      created.ledger?.settlement_currency !== "NZD" ||
      created.owners.length !== 1 ||
      created.owners[0].status !== "linked" ||
      created.owners[0].role !== "owner"
    )
      throw Error("C_CREATE_READBACK_MISMATCH");
    writeFileSync(
      dir + "/canonical-create-readback.json",
      JSON.stringify({ windowId: gate.windowId, ...created }),
      { flag: "wx", mode: 0o600 },
    );
    summary.create = { accepted: true, serverVerified: true, local: runner.localState() };
    await command("activate-metadata");
    await runner.saveEdit();
    runner.setOnline(false);
    await runner.dispatchEdit();
    await runner.reopen();
    if (!receiptOnlyResume) {
      await runner.select("B");
      await runner.dispatchEdit();
      await runner.select("A");
    }
    runner.setOnline(true);
    await runner.dispatchEdit();
    await runner.recoverQueuedReceipt("metadata");
    assertCompleted(QA.metadataOperationId);
    const mr = runner.receipts().metadata;
    if (
      !mr ||
      !("formatVersion" in mr) ||
      mr.resultMetadataRevision !== 1 ||
      mr.actorAccountId !== gate.actorIds.A
    )
      throw Error("C_ACCEPTED_EDIT_RECEIPT_REQUIRED");
    const edited = await read();
    if (
      edited.trip?.metadata_revision !== 1 ||
      edited.trip.name !== "DEV-METADATA-QA-20261022-01 · edited" ||
      edited.trip.destination !== "Auckland, New Zealand"
    )
      throw Error("C_EDIT_READBACK_MISMATCH");
    if (!receiptOnlyResume) {
      await runner.replayEdit();
      await denied(() => runner.collisionEdit(), 409, "TRIP_METADATA_COLLISION");
      await runner.select("B");
      await denied(() => runner.replayEdit(), 403, "TRIP_METADATA_FORBIDDEN");
      await runner.select("A");
    }
    const original = await runner.originalCreateReceipt();
    if (JSON.stringify(original) !== JSON.stringify(cr))
      throw Error("C_ORIGINAL_CREATE_RECEIPT_MUTATED");
    await runner.reopen();
    const editedLocal = runner.localState();
    if (
      editedLocal.trip?.name !== payloads.editProposal.body.after.name ||
      editedLocal.trip?.destination !== payloads.editProposal.body.after.destination
    )
      throw Error("C_EDIT_CLIENT_RECOVERY_MISMATCH");
    summary.edit = { accepted: true, serverVerified: true, queue: runner.queueState() };
    if (receiptOnlyResume) {
      summary.status = "REAL_DEV_CREATE_LEDGER_EDIT_RECEIPTS_READY_FOR_REVIEW";
      summary.currency = { status: "BLOCKED_BY_READ_BUDGET", attempted: false };
      summary.remainingNegativeCases = "NOT_RUN_IN_REAL_DEV_READ_BUDGET_RETAINED";
      return;
    }
    // Resume conserves the cumulative read budget using this run's actual owning
    // readback. Only metadata replay/denial checks occur between it and Preview.
    const zero = gate.resume ? edited : await read();
    if (zero.expenses || zero.payments || zero.personalPayments || zero.settlements)
      throw Error("C_UNEXPECTED_FX_DEMAND");
    summary.zeroFinancialQualification = {
      source: gate.resume
        ? "ACTUAL_EDITED_CANONICAL_READBACK_REUSED_NO_INTERVENING_FINANCIAL_WRITES"
        : "ACTUAL_PREVIEW_CANONICAL_READBACK",
      actorAccountId: gate.actorIds.A,
      tripId: QA.tripId,
      reusedReadback: Boolean(gate.resume),
      expenses: zero.expenses,
      payments: zero.payments,
      personalPayments: zero.personalPayments,
      settlements: zero.settlements,
    };
    await runner.previewCurrency();
    const firstCommit = await runner.commitCurrency();
    const replayCommit = await runner.commitCurrency();
    if (
      firstCommit.settlementCurrency !== "USD" ||
      replayCommit.changeId !== firstCommit.changeId ||
      replayCommit.settingsRevision !== firstCommit.settingsRevision ||
      !replayCommit.idempotentReplay
    )
      throw Error("C_CURRENCY_RECEIPT_MISMATCH");
    const currency = await read();
    if (currency.ledger?.settlement_currency !== "USD")
      throw Error("C_CURRENCY_READBACK_MISMATCH");
    await runner.reopen();
    const local = runner.localState();
    if (local.ledger?.settlement_currency !== "USD")
      throw Error("C_LEDGER_CLIENT_RECOVERY_MISMATCH");
    summary.currency = { accepted: true, serverVerified: true, local };
    summary.counts = runner.budget.counts;
    summary.status = "REAL_DEV_FOUR_PATH_RECEIPTS_READY_FOR_REVIEW";
  } finally {
    summary.counts = runner.budget.counts;
    await runner.close();
    if (armed) {
      try {
        summary.close = await command("close");
      } catch {
        summary.status = "RECONCILE_REQUIRED";
      }
    }
    writeFileSync(dir + "/execution-summary.json", JSON.stringify(summary), {
      flag: "wx",
      mode: 0o600,
    });
  }
  console.log(JSON.stringify({ status: summary.status, counts: summary.counts }));
}
main().catch(() => {
  console.error(
    JSON.stringify({ status: "STOPPED_OR_RECONCILE_REQUIRED_NO_AUTOMATIC_RETRY" }),
  );
  process.exitCode = 2;
});

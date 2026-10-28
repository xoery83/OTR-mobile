/** Exact original-op recovery: one independent read, normal Auth, one replay/bootstrap. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import {
  QA,
  CRequestBudget,
  createAuthenticatedHeadlessRunner,
  assertAcceptedQaCurrencyResume,
} from "./headless";
import {
  journeyCurrencyCommitSchema,
  journeyCurrencyPreviewSchema,
} from "../../../src/data/api/ledgerCurrencyContracts";
const exec = promisify(execFile);
const old = "/private/tmp/otr-c-qa-20261023-currency/execution-summary.json";
const owner =
  "/private/tmp/otr-local-first-core-20261019/docs/ops/c-currency-resume-20261023/OWNER_AUTHORIZATION.json";
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
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
export const recoveryProjectionSchema = z.strictObject({
  profile: z.strictObject({ id: z.uuid(), account_role: z.literal("free_user") }),
  ledger: z.strictObject({
    journey_id: z.literal(QA.tripId),
    settlement_currency: z.literal("USD"),
    revision: z.literal(2),
  }),
  receipt: z.strictObject({
    actor_user_id: z.uuid(),
    journey_id: z.literal(QA.tripId),
    command_type: z.literal("CHANGE_JOURNEY_CURRENCY"),
    idempotency_key: z.literal(QA.currencyOperationId),
    payload_hash: z.string().regex(/^[a-f0-9]{64}$/),
    response_status: z.literal(200),
    response_body: journeyCurrencyCommitSchema,
    completed_at: z.string(),
  }),
  change: z.strictObject({
    id: z.uuid(),
    actor_user_id: z.uuid(),
    journey_id: z.literal(QA.tripId),
    old_currency: z.literal("NZD"),
    new_currency: z.literal("USD"),
    settings_revision: z.literal(2),
    preview_digest: z.string(),
  }),
});
export function qualifyRecovery(
  value: unknown,
  actor: string,
  preview: z.infer<typeof journeyCurrencyPreviewSchema>,
) {
  const v = recoveryProjectionSchema.parse(value);
  const expected = sha(
    `USD:${preview.settingsRevision}:${preview.previewDigest}:${QA.currencyOperationId}`,
  );
  if (
    v.profile.id !== actor ||
    v.receipt.actor_user_id !== actor ||
    v.change.actor_user_id !== actor ||
    v.receipt.payload_hash !== expected ||
    v.change.preview_digest !== preview.previewDigest ||
    v.receipt.response_body.changeId !== v.change.id ||
    v.receipt.response_body.settlementCurrency !== "USD" ||
    v.receipt.response_body.settingsRevision !== 2 ||
    v.receipt.response_body.idempotentReplay !== false
  )
    throw Error("C_RECOVERY_RECEIPT_MISMATCH");
  return v;
}
export async function executeCurrencyRecovery(path: string, gate: any, credentials: any) {
  if (
    gate.resume?.kind !== "CURRENCY_RECEIPT_RECOVERY" ||
    gate.resume.previousReadCharges !== 18 ||
    gate.resume.previousMutationCharges !== 4 ||
    gate.currencyOnly !== true ||
    gate.manifestSHA256 !==
      sha(
        canonical(
          Object.fromEntries(
            Object.entries(gate).filter(([k]) => k !== "manifestSHA256"),
          ),
        ),
      )
  )
    throw Error("C_RECOVERY_GATE_REQUIRED");
  if (
    sha(readFileSync(owner)) !==
      "4abb4c84da8ea1acb5a5bc734ef8e8b291184775f342c9fc0428a2504daf6210" ||
    gate.currencyBudgetAuthorizationSHA256 !==
      "4abb4c84da8ea1acb5a5bc734ef8e8b291184775f342c9fc0428a2504daf6210"
  )
    throw Error("C_RECOVERY_OWNER_REQUIRED");
  const bytes = readFileSync(old);
  if (sha(bytes) !== gate.resume.previousSummarySHA256)
    throw Error("C_RECOVERY_EVIDENCE_DRIFT");
  const previous = JSON.parse(bytes.toString());
  if (
    previous.counts.reads !== 18 ||
    previous.counts.mutations !== 4 ||
    previous.close.status !== "CLOSED_VERIFIED" ||
    previous.firstCommit
  )
    throw Error("C_RECOVERY_OUTCOME_REQUIRED");
  const preview = journeyCurrencyPreviewSchema.parse(previous.preview);
  if (
    preview.currentCurrency !== "NZD" ||
    preview.proposedCurrency !== "USD" ||
    preview.settingsRevision !== 1 ||
    preview.affectedExpenses !== 0 ||
    preview.requiresAbandonPreview
  )
    throw Error("C_RECOVERY_PREVIEW_MISMATCH");
  assertAcceptedQaCurrencyResume(gate.databasePath, gate.actorIds.A);
  const window = {
    startsAt: gate.startsAt,
    expiresAt: gate.expiresAt,
    actorIds: gate.actorIds,
    mode: "DEV" as const,
  };
  const budget = new CRequestBudget(
    window,
    Date.now,
    18,
    "APPROVED_CURRENCY_RECEIPT_RECOVERY_20",
  );
  const dir = "/private/tmp/otr-c-qa-20261023-currency-recovery";
  if (gate.resume.evidenceDirectory !== dir || existsSync(dir))
    throw Error("C_RECOVERY_PRIVATE_DIRECTORY_REQUIRED");
  mkdirSync(dir, { mode: 0o700 });
  const save = (name: string, v: unknown) =>
    writeFileSync(dir + "/" + name, JSON.stringify(v), { mode: 0o600, flag: "wx" });
  if (sha(readFileSync(gate.controlPath)) !== gate.controlSHA256)
    throw Error("C_CONTROL_DRIFT");
  const command = async (action: string) => {
    const r = await exec(
      "python3",
      [gate.controlPath, action, path, dir, "--manifest-sha", gate.manifestSHA256],
      { timeout: 350000, maxBuffer: 500000 },
    );
    const value = JSON.parse(r.stdout);
    if (value.status?.startsWith("RECONCILE")) throw Error("C_RECONCILE_REQUIRED");
    return value;
  };
  const summary: any = {
    status: "BLOCKED",
    mode: "REAL_DEV_NOT_NATIVE",
    windowId: gate.windowId,
  };
  let runner: Awaited<ReturnType<typeof createAuthenticatedHeadlessRunner>> | undefined;
  let armed = false;
  try {
    await command("arm");
    armed = true;
    for (let i = 0; i < 150 && !existsSync(dir + "/watchdog-armed.json"); i++)
      await new Promise((r) => setTimeout(r, 20));
    if (!existsSync(dir + "/watchdog-armed.json")) throw Error("C_WATCHDOG_REQUIRED");
    const actor = z.uuid().parse(gate.actorIds.A),
      trip = QA.tripId,
      op = QA.currencyOperationId;
    const sql = `BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; SELECT jsonb_build_object(
 'profile',(SELECT jsonb_build_object('id',id,'account_role',account_role) FROM public.profiles WHERE id='${actor}'::uuid),
 'ledger',(SELECT jsonb_build_object('journey_id',journey_id,'settlement_currency',settlement_currency,'revision',revision) FROM public.ledger_settings WHERE journey_id='${trip}'::uuid),
 'receipt',(SELECT jsonb_build_object('actor_user_id',actor_user_id,'journey_id',journey_id,'command_type',command_type,'idempotency_key',idempotency_key,'payload_hash',payload_hash,'response_status',response_status,'response_body',response_body,'completed_at',completed_at) FROM public.ledger_idempotency_keys WHERE actor_user_id='${actor}'::uuid AND journey_id='${trip}'::uuid AND command_type='CHANGE_JOURNEY_CURRENCY' AND idempotency_key='${op}'),
 'change',(SELECT jsonb_build_object('id',id,'actor_user_id',actor_user_id,'journey_id',journey_id,'old_currency',old_currency,'new_currency',new_currency,'settings_revision',settings_revision,'preview_digest',preview_digest) FROM public.ledger_journey_currency_changes WHERE journey_id='${trip}'::uuid AND actor_user_id='${actor}'::uuid AND preview_digest='${preview.previewDigest}' AND settings_revision=2)) AS qa; ROLLBACK;`;
    if (!/^[a-f0-9]{64}$/.test(preview.previewDigest)) throw Error("C_DIGEST_REQUIRED");
    const file = dir + "/exact-currency-recovery.sql";
    writeFileSync(file, sql, { mode: 0o600, flag: "wx" });
    budget.reserve("reads");
    save("read-19-reserved.json", { counts: budget.counts, querySHA256: sha(sql) });
    const out = await exec(
      gate.supabaseCli,
      [
        "db",
        "query",
        "--linked",
        "--project-ref",
        "tuqigdxrvrerfewsxqgm",
        "--file",
        file,
        "--output",
        "json",
      ],
      { cwd: gate.linkedWorktree, timeout: 15000, maxBuffer: 100000 },
    );
    const raw = JSON.parse(out.stdout),
      rows = Array.isArray(raw) ? raw : raw.rows;
    if (!Array.isArray(rows) || rows.length !== 1)
      throw Error("C_RECOVERY_ONE_ROW_REQUIRED");
    const proof = qualifyRecovery(rows[0].qa, actor, preview);
    budget.assertOpen();
    save("canonical-original-currency-accepted.json", proof);
    summary.originalCommit = proof.receipt.response_body;
    runner = await createAuthenticatedHeadlessRunner({
      window,
      databasePath: gate.databasePath,
      publishableKey: credentials.publishableKey,
      authOrigin: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      backendOrigin: "https://api-dev.xoery.art",
      currencyOnlyContinuation: "APPROVED_CURRENCY_RECEIPT_RECOVERY_20",
      recovery: { budget, profile: proof.profile, preview },
    });
    summary.auth = await runner.login(
      "A",
      credentials.A.password,
      credentials.A.provisionReceipt,
    );
    const replay = await runner.commitCurrency();
    summary.replayCommit = replay;
    if (
      !replay.idempotentReplay ||
      replay.changeId !== proof.change.id ||
      replay.settingsRevision !== 2 ||
      replay.settlementCurrency !== "USD"
    )
      throw Error("C_REPLAY_MISMATCH");
    await runner.reopen();
    const local = runner.localState();
    if (local.ledger?.settlement_currency !== "USD") throw Error("C_LOCAL_USD_REQUIRED");
    summary.local = local;
    summary.status = "REAL_DEV_CURRENCY_ACCEPTED_VERIFIED_REPLAYED_CLIENT_RECOVERED";
  } catch (e) {
    summary.errorClass = e instanceof Error ? e.name : "UNKNOWN";
    throw e;
  } finally {
    summary.counts = budget.counts;
    if (runner) await runner.close();
    if (armed) {
      try {
        summary.close = await command("close");
      } catch {
        summary.status = "RECONCILE_REQUIRED";
      }
    }
    save("execution-summary.json", summary);
  }
}

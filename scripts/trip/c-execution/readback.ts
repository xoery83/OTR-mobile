/** Only fixed QA canonical readback through the existing local authenticated CLI. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, unlinkSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { QA, type CRequestBudget } from "./headless";
const execute = promisify(execFile);
export const canonicalReadbackSchema = z.strictObject({
  trip: z
    .strictObject({
      id: z.literal(QA.tripId),
      created_by: z.uuid(),
      name: z.string(),
      destination: z.string().nullable(),
      start_date: z.iso.date().nullable(),
      end_date: z.iso.date().nullable(),
      metadata_revision: z.number().int().nonnegative().safe(),
    })
    .nullable(),
  owners: z.array(
    z.strictObject({
      id: z.uuid(),
      user_id: z.uuid(),
      role: z.string(),
      status: z.string(),
    }),
  ),
  ledger: z
    .strictObject({
      journey_id: z.literal(QA.tripId),
      settlement_currency: z.string().regex(/^[A-Z]{3}$/),
      revision: z.number().int().positive().safe(),
    })
    .nullable(),
  expenses: z.number().int().nonnegative().safe(),
  payments: z.number().int().nonnegative().safe(),
  settlements: z.number().int().nonnegative().safe(),
  personalPayments: z.number().int().nonnegative().safe(),
});
export async function canonicalReadback(input: {
  cli: string;
  linkedWorktree: string;
  privateDirectory: string;
  actorId: string;
  budget: CRequestBudget;
}) {
  z.uuid().parse(input.actorId);
  const stat = lstatSync(input.privateDirectory);
  if (
    stat.isSymbolicLink() ||
    (stat.mode & 0o777) !== 0o700 ||
    stat.uid !== process.getuid?.()
  )
    throw Error("C_READBACK_PRIVATE_DIRECTORY_REQUIRED");
  const file = join(input.privateDirectory, `read-${process.pid}-${Date.now()}.sql`);
  const trip = QA.tripId,
    actor = input.actorId;
  // Scope before selecting: no real-user scan, no command/RPC/Prepare/Preview invocation.
  const sql = `BEGIN READ ONLY; SET LOCAL statement_timeout='10s';
 SELECT jsonb_build_object('trip',(SELECT jsonb_build_object('id',id,'created_by',created_by,'name',name,'destination',destination,'start_date',start_date,'end_date',end_date,'metadata_revision',metadata_revision) FROM public.trips WHERE id='${trip}'::uuid AND created_by='${actor}'::uuid),
 'owners',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'role',role,'status',status)),'[]'::jsonb) FROM public.journey_members WHERE trip_id='${trip}'::uuid AND user_id='${actor}'::uuid),
 'ledger',(SELECT jsonb_build_object('journey_id',journey_id,'settlement_currency',settlement_currency,'revision',revision) FROM public.ledger_settings WHERE journey_id='${trip}'::uuid),
 'expenses',(SELECT count(*) FROM public.expenses WHERE journey_id='${trip}'::uuid),
 'payments',(SELECT count(*) FROM public.payment_records WHERE journey_id='${trip}'::uuid),
 'settlements',(SELECT count(*) FROM public.settlements WHERE journey_id='${trip}'::uuid),
 'personalPayments',(SELECT count(*) FROM public.personal_settlement_payment_records WHERE journey_id='${trip}'::uuid)) AS qa; ROLLBACK;`;
  writeFileSync(file, sql, { flag: "wx", mode: 0o600 });
  try {
    input.budget.reserve("reads");
    const { stdout } = await execute(
      input.cli,
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
      { cwd: input.linkedWorktree, timeout: 15000, maxBuffer: 200000 },
    );
    const value = JSON.parse(stdout),
      rows = Array.isArray(value) ? value : value.rows;
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0].qa)
      throw Error("C_READBACK_INVALID");
    input.budget.assertOpen();
    const result = canonicalReadbackSchema.parse(rows[0].qa);
    if (
      (result.trip && result.trip.created_by !== input.actorId) ||
      result.owners.some((o) => o.user_id !== input.actorId)
    )
      throw Error("C_READBACK_SCOPE_MISMATCH");
    return result;
  } catch {
    throw Error("C_READBACK_UNAVAILABLE_STOP");
  } finally {
    unlinkSync(file);
  }
}

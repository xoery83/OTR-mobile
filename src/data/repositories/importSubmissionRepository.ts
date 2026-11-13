import { Directory, File, Paths } from "expo-file-system";
import { z } from "zod";
import type { CaptureJobReadModel } from "../../domain/capture/captureSubmission";
import { requireAdoptedUserId } from "../auth/authRepository";
import { universalV3Candidate } from "../api/universalV3Contracts";

const decision = z.discriminatedUnion("action", [
  z.object({ action: z.literal("NEW") }),
  z.object({
    action: z.literal("LINK"),
    itemId: z.uuid(),
    revision: z.number().int().positive(),
  }),
]);
export const importSubmissionSchema = z.object({
  version: z.literal(1),
  accountId: z.uuid(),
  tripId: z.uuid(),
  batchId: z.uuid(),
  confirmBeforeSave: z.boolean(),
  confirmed: z.boolean(),
  resolutions: z
    .record(
      z.uuid(),
      z.object({
        candidate: universalV3Candidate,
        decision,
        manual: z.boolean().optional(),
      }),
    )
    .default({}),
});
export type ImportSubmission = z.infer<typeof importSubmissionSchema>;
export function importConfirmBeforeSave() {
  const configured = process.env.EXPO_PUBLIC_OTR_IMPORT_CONFIRM_BEFORE_SAVE;
  return (
    configured === "true" ||
    (configured !== "false" && process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev")
  );
}
async function location(model: CaptureJobReadModel) {
  const accountId = await requireAdoptedUserId();
  const tripId = model.batch.context.tripPrior?.id ?? model.assignedTripId;
  if (accountId !== model.batch.accountId || !tripId)
    throw Error("IMPORT_SUBMISSION_SCOPE");
  const scope = z
    .object({ accountId: z.uuid(), tripId: z.uuid(), batchId: z.uuid() })
    .parse({ accountId, tripId, batchId: model.batch.batchId });
  const directory = new Directory(Paths.document, "import-submissions", scope.accountId);
  return { scope, directory, file: new File(directory, `${scope.batchId}.json`) };
}
export async function readImportSubmission(
  model: CaptureJobReadModel,
): Promise<ImportSubmission | null> {
  const { scope, file } = await location(model);
  const previous = new File(file.uri.replace(/\.json$/, ".previous"));
  if (!file.exists && !previous.exists) return null; // Historical Activity never implies a new Submit.
  let record: ImportSubmission | undefined;
  for (const candidate of [file, previous]) {
    if (!candidate.exists) continue;
    try {
      record = importSubmissionSchema.parse(JSON.parse(candidate.textSync()));
      break;
    } catch {
      /* A failed native replacement may retain the previous valid intent. */
    }
  }
  if (!record) throw Error("IMPORT_SUBMISSION_CORRUPT");
  if (
    record.accountId !== scope.accountId ||
    record.tripId !== scope.tripId ||
    record.batchId !== scope.batchId
  )
    throw Error("IMPORT_SUBMISSION_SCOPE");
  return record;
}
export async function retainImportSubmission(model: CaptureJobReadModel) {
  const prior = await readImportSubmission(model);
  if (prior) return prior;
  const { scope, directory, file } = await location(model);
  const confirmBeforeSave = importConfirmBeforeSave();
  const record = importSubmissionSchema.parse({
    ...scope,
    version: 1,
    confirmBeforeSave,
    confirmed: !confirmBeforeSave,
  });
  directory.create({ idempotent: true, intermediates: true });
  file.create({ overwrite: false });
  file.write(JSON.stringify(record));
  return record;
}
async function editImportSubmission(
  model: CaptureJobReadModel,
  edit: (prior: ImportSubmission) => ImportSubmission,
) {
  const { file, directory } = await location(model);
  const prior = await readImportSubmission(model);
  if (!prior) throw Error("IMPORT_SUBMISSION_MISSING");
  const next = importSubmissionSchema.parse(edit(prior));
  if (
    next.accountId !== prior.accountId ||
    next.tripId !== prior.tripId ||
    next.batchId !== prior.batchId ||
    next.confirmBeforeSave !== prior.confirmBeforeSave ||
    (prior.confirmed && !next.confirmed)
  )
    throw Error("IMPORT_SUBMISSION_SCOPE");
  // Synchronous native replacement has no await between read and write; serialize edits in this JS instance.
  const pending = new File(directory, `${prior.batchId}.pending`);
  pending.create({ overwrite: true });
  pending.write(JSON.stringify(next));
  if (file.exists)
    file.copySync(new File(directory, `${prior.batchId}.previous`), { overwrite: true });
  pending.move(file, { overwrite: true });
  return next;
}

let mutation = Promise.resolve();
export function updateImportSubmission(
  model: CaptureJobReadModel,
  edit: (prior: ImportSubmission) => ImportSubmission,
) {
  const result = mutation.then(() => editImportSubmission(model, edit));
  mutation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

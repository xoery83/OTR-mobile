import { z } from "zod";
import {
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import {
  captureFailureFactsSchema,
  captureFailureFactSchema,
  matchesUpdatesFilter,
  isActionableIntakeFailure,
  updatesFilterSchema,
  type CaptureFailureFact,
  type CaptureUpdateCard,
  type UpdatesFilter,
  type UpdatesPresentationText,
} from "@/domain/updates/updatesInbox";
import type { LocalCaptureDatabase } from "./localCaptureInboxRepository";

const rowSchema = z.strictObject({
  notificationId: z.string(),
  jobId: z.uuid(),
  batchId: z.uuid(),
  materialVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: z.iso.datetime(),
  factsJson: z.string(),
  readVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
type Row = z.infer<typeof rowSchema>;
const select = `SELECT notification_id AS notificationId,job_id AS jobId,batch_id AS batchId,
  material_version AS materialVersion,created_at AS createdAt,failure_facts_json AS factsJson,
  read_material_version AS readVersion FROM updates_capture_intake`;
const identity = (jobId: string) => `capture-intake:${jobId}`;
const unavailable = () => {
  throw new Error("UPDATES_SOURCE_UNAVAILABLE");
};

// The C3 owner calls this inside its existing failure-CAS transaction.
export async function recordCommittedCaptureFailure(
  db: LocalCaptureDatabase,
  context: AccountRequestContext,
  job: CaptureJobReadModel,
  inputId: string,
  createdAt: string,
) {
  const input = job.inputs.find((i) => i.id === inputId);
  if (
    job.batch.accountId !== context.accountId ||
    !input ||
    input.state !== "FAILED" ||
    !isActionableIntakeFailure(input.failureCode) ||
    !job.availableActions.reacquireInputIds.includes(inputId)
  )
    unavailable();
  const fact = captureFailureFactSchema.parse({
    inputId,
    revision: input!.revision,
    failureCode: input!.failureCode,
  });
  const existing = await db.getFirstAsync<Row>(
    `${select} WHERE account_id=? AND notification_id=?`,
    context.accountId,
    identity(job.batch.jobId),
  );
  const facts = existing
    ? captureFailureFactsSchema.parse(JSON.parse(rowSchema.parse(existing).factsJson))
    : [];
  if (
    existing &&
    (existing.jobId !== job.batch.jobId || existing.batchId !== job.batch.batchId)
  )
    unavailable();
  const previous = facts.find((f) => f.inputId === inputId);
  const changed = !previous || previous.failureCode !== fact.failureCode;
  const next = [...facts.filter((f) => f.inputId !== inputId), fact].sort((a, b) =>
    a.inputId.localeCompare(b.inputId),
  );
  captureFailureFactsSchema.parse(next);
  if (!existing) {
    await db.runAsync(
      `INSERT INTO updates_capture_intake(account_id,notification_id,job_id,batch_id,
      material_version,created_at,failure_facts_json,read_material_version) VALUES(?,?,?,?,1,?,?,0)`,
      context.accountId,
      identity(job.batch.jobId),
      job.batch.jobId,
      job.batch.batchId,
      z.iso.datetime().parse(createdAt),
      JSON.stringify(next),
    );
  } else {
    const version = existing.materialVersion + Number(changed);
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(version);
    const result = await db.runAsync(
      `UPDATE updates_capture_intake SET material_version=?,failure_facts_json=?
      WHERE account_id=? AND notification_id=? AND material_version=?`,
      version,
      JSON.stringify(next),
      context.accountId,
      existing.notificationId,
      existing.materialVersion,
    );
    if (result.changes !== 1) unavailable();
  }
}

type Source = {
  load(context: AccountRequestContext, jobId: string): Promise<CaptureJobReadModel>;
};
export function createUpdatesInboxRepository(
  db: LocalCaptureDatabase,
  account: () => Promise<string>,
  source: Source,
) {
  async function scoped<T>(context: AccountRequestContext, work: () => Promise<T>) {
    return withAccountApplyGate(async () => {
      let result!: T;
      await db.withTransactionAsync(async () => {
        await assertAccountRequestContext(context, account);
        result = await work();
        await assertAccountRequestContext(context, account);
      });
      await assertAccountRequestContext(context, account);
      return result;
    });
  }
  async function qualify(raw: Row, context: AccountRequestContext) {
    const row = rowSchema.parse(raw);
    if (
      row.notificationId !== identity(row.jobId) ||
      row.readVersion > row.materialVersion
    )
      unavailable();
    const facts = captureFailureFactsSchema.parse(JSON.parse(row.factsJson));
    const base = {
      notificationId: row.notificationId,
      materialVersion: row.materialVersion,
      jobId: row.jobId,
      batchId: row.batchId,
      createdAt: row.createdAt,
      source: "CAPTURE_INTAKE" as const,
      scope: "ACCOUNT_PERSONAL" as const,
      tripId: null,
      clock: "DEVICE_WALL" as const,
      unread: row.readVersion < row.materialVersion,
    };
    try {
      const job = await source.load(context, row.jobId);
      if (
        job.batch.accountId !== context.accountId ||
        job.batch.batchId !== row.batchId ||
        job.batch.jobId !== row.jobId
      )
        unavailable();
      const recoveryInputs: CaptureFailureFact[] = [];
      let recovered = true;

      for (const fact of facts) {
        const input = job.inputs.find((i) => i.id === fact.inputId);
        if (!input) unavailable();
        let accepted = input!.state === "ACCEPTED";
        for (const link of input!.continuedIn) {
          const successor = await source.load(context, link.jobId);
          if (successor.batch.accountId !== context.accountId) unavailable();
          const next = successor.inputs.find((i) => i.id === link.inputId);
          if (
            !next ||
            next.continuesFromJobId !== row.jobId ||
            next.continuesFromInputId !== input!.id
          )
            unavailable();
          accepted ||= next!.state === "ACCEPTED";
        }
        recovered &&= accepted;
        if (!accepted && input!.state === "FAILED") {
          if (
            input!.revision !== fact.revision ||
            input!.failureCode !== fact.failureCode ||
            !job.availableActions.reacquireInputIds.includes(input!.id)
          )
            unavailable();
          recoveryInputs.push(fact);
        }
      }
      const card: CaptureUpdateCard = {
        ...base,
        recoveryInputs,
        sourceState: recoveryInputs.length
          ? "ACTION_REQUIRED"
          : recovered
            ? "RECOVERED"
            : "INACTIVE",
        searchText: [
          "capture intake import",
          ...recoveryInputs.map((i) => i.failureCode),
        ].join(" "),
      };
      return { card, job };
    } catch {
      await assertAccountRequestContext(context, account);
      const card: CaptureUpdateCard = {
        ...base,
        sourceState: "UNAVAILABLE",
        recoveryInputs: [],
        searchText: "capture intake import",
      };
      return { card, job: null };
    }
  }
  async function rows(
    context: AccountRequestContext,
    before?: { createdAt: string; notificationId: string },
    limit = 100,
  ) {
    return db.getAllAsync<Row>(
      `${select} WHERE account_id=? ${before ? "AND (created_at<? OR (created_at=? AND notification_id<?))" : ""}
      ORDER BY created_at DESC,notification_id DESC LIMIT ?`,
      context.accountId,
      ...(before ? [before.createdAt, before.createdAt, before.notificationId] : []),
      limit,
    );
  }
  async function mark(context: AccountRequestContext, card: CaptureUpdateCard) {
    const result = await db.runAsync(
      `UPDATE updates_capture_intake SET read_material_version=?
      WHERE account_id=? AND notification_id=? AND material_version=? AND read_material_version<?`,
      card.materialVersion,
      context.accountId,
      card.notificationId,
      card.materialVersion,
      card.materialVersion,
    );
    return result.changes;
  }
  return {
    async list(
      rawFilter: UpdatesFilter,
      context: AccountRequestContext,
      options: {
        presentationText?: UpdatesPresentationText;
        limit?: number;
        before?: { createdAt: string; notificationId: string };
      } = {},
    ) {
      const filter = updatesFilterSchema.parse(rawFilter);
      const limit = z
        .number()
        .int()
        .min(1)
        .max(100)
        .parse(options.limit ?? 20);
      if (options.before) {
        z.iso.datetime().parse(options.before.createdAt);
        z.string()
          .regex(/^capture-intake:[0-9a-f-]{36}$/)
          .parse(options.before.notificationId);
      }
      return scoped(context, async () => {
        const page = await rows(context, options.before, limit + 1);
        const hasMore = page.length > limit;
        const selected = page.slice(0, limit);
        const qualified: CaptureUpdateCard[] = [];
        for (const row of selected) qualified.push((await qualify(row, context)).card);
        const cards = qualified.filter((card) =>
          matchesUpdatesFilter(card, filter, options.presentationText),
        );
        const last = selected.at(-1);
        return {
          cards,
          coverage: "CAPTURE_INTAKE_ONLY" as const,
          unknownSourcesInPage: qualified.filter((r) => r.sourceState === "UNAVAILABLE")
            .length,
          unreadAttentionInPage: cards.filter(
            (c) => c.unread && c.sourceState === "ACTION_REQUIRED",
          ).length,
          next:
            hasMore && last
              ? { createdAt: last.createdAt, notificationId: last.notificationId }
              : null,
        };
      });
    },
    // COMPLETE covers the installed Capture intake source, not future unread producers.
    async unreadActionableSignal(
      context: AccountRequestContext,
      currentTripId: string | null,
    ): Promise<{
      coverage: "COMPLETE" | "UNKNOWN";
      unreadActionableCards: number | null;
    }> {
      const filter = updatesFilterSchema.parse({
        category: "NEEDS_ATTENTION",
        query: "",
        unreadOnly: true,
        currentTripId,
      });
      try {
        return await scoped(context, async () => {
          let before: { createdAt: string; notificationId: string } | undefined;
          let count = 0,
            unknown = false;
          for (;;) {
            const page = await rows(context, before);
            for (const row of page) {
              const { card } = await qualify(row, context);
              if (card.unread && card.sourceState === "UNAVAILABLE") unknown = true;
              if (matchesUpdatesFilter(card, filter)) count++;
            }
            if (page.length < 100) break;
            const last = page.at(-1)!;
            before = { createdAt: last.createdAt, notificationId: last.notificationId };
          }
          return unknown
            ? { coverage: "UNKNOWN", unreadActionableCards: null }
            : { coverage: "COMPLETE", unreadActionableCards: count };
        });
      } catch {
        await assertAccountRequestContext(context, account);
        return { coverage: "UNKNOWN", unreadActionableCards: null };
      }
    },
    async open(
      notificationId: string,
      observedVersion: number,
      observedRecoveryInputs: readonly CaptureFailureFact[],
      context: AccountRequestContext,
    ) {
      z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(observedVersion);
      return scoped(context, async () => {
        const row = await db.getFirstAsync<Row>(
          `${select} WHERE account_id=? AND notification_id=?`,
          context.accountId,
          notificationId,
        );
        if (!row || row.materialVersion !== observedVersion) unavailable();
        const result = await qualify(row!, context);
        if (
          !result.job ||
          result.card.sourceState === "UNAVAILABLE" ||
          JSON.stringify(result.card.recoveryInputs) !==
            JSON.stringify(observedRecoveryInputs)
        )
          unavailable();
        await mark(context, result.card);
        return { job: result.job!, recoveryInputs: result.card.recoveryInputs };
      });
    },
    async markAllRead(
      rawFilter: UpdatesFilter,
      context: AccountRequestContext,
      options: { presentationText?: UpdatesPresentationText } = {},
    ) {
      const filter = updatesFilterSchema.parse(rawFilter);
      return scoped(context, async () => {
        let before: { createdAt: string; notificationId: string } | undefined;
        let marked = 0,
          unavailableCount = 0;
        for (;;) {
          const page = await rows(context, before);
          for (const row of page) {
            const { card } = await qualify(row, context);
            if (card.sourceState === "UNAVAILABLE") {
              unavailableCount++;
              continue;
            }
            if (matchesUpdatesFilter(card, filter, options.presentationText))
              marked += await mark(context, card);
          }
          if (page.length < 100) break;
          const last = page.at(-1)!;
          before = { createdAt: last.createdAt, notificationId: last.notificationId };
        }
        return { marked, unavailableCount };
      });
    },
  };
}

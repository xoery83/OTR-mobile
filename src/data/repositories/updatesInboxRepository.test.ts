import { DatabaseSync } from "node:sqlite";
import { migrations } from "@/data/db/migrations";
import type { LocalCaptureDatabase } from "./localCaptureInboxRepository";
import { updatesInboxMigration } from "@/data/db/migrations/updatesInbox";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { fixture, sha256 } from "./__fixtures__/captureBatchAssessment";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { LocalCaptureError } from "@/domain/capture/localCapture";
import type { CapturePayloadInput } from "@/data/files/capturePayloadReader";
import type { UpdatesFilter } from "@/domain/updates/updatesInbox";
import {
  createCaptureSubmissionRepository,
  createCaptureSubmissionTransactionStore,
} from "./captureSubmissionRepository";
import { createUpdatesInboxRepository } from "./updatesInboxRepository";
const filter: UpdatesFilter = {
  category: "ALL",
  query: "",
  unreadOnly: false,
  currentTripId: null,
};
const at = "2026-10-15T04:25:36.000Z";
function setup(disk = false) {
  const f = fixture(disk),
    deps = { sha256, now: () => at, newId: randomUUID };
  const submissions = createCaptureSubmissionRepository(f.db, f.getAccount, deps);
  const source = createCaptureSubmissionTransactionStore(f.db, deps);
  const inbox = createUpdatesInboxRepository(f.db, f.getAccount, source);
  const context = () => captureAccountRequestContext("", f.getAccount);
  async function fail(n = 1) {
    const r = f.request(n);
    r.context.tripPrior = { id: randomUUID(), origin: "PRIOR", observedAt: r.createdAt };
    r.inputs.forEach((i) => {
      i.originalFilename = "PRIVATE secret-name.pdf";
    });
    await submissions.submit(
      r,
      new Map(r.inputs.map((i) => [i.id, async () => ({ text: "" })])),
    );
    return r;
  }
  return { f, source, submissions, inbox, context, fail };
}
it("normal committed intake failures create one personal Batch card with new notice time, independent read version and no private fields", async () => {
  const s = setup(true),
    r = await s.fail(2),
    c = await s.context();
  const page = await s.inbox.list(filter, c),
    card = page.cards[0];
  expect(page.cards).toHaveLength(1);
  expect(card).toMatchObject({
    batchId: r.batchId,
    jobId: r.jobId,
    createdAt: at,
    tripId: null,
    scope: "ACCOUNT_PERSONAL",
    unread: true,
    materialVersion: 2,
    sourceState: "ACTION_REQUIRED",
  });
  expect(card.createdAt).not.toBe(r.createdAt);
  expect(card.recoveryInputs).toHaveLength(2);
  expect(JSON.stringify(card)).not.toMatch(/secret-name|PRIVATE|tripPrior|payload|uri/);
  expect(
    (await s.inbox.list({ ...filter, currentTripId: randomUUID() }, c)).cards,
  ).toEqual(page.cards);
  const original = await s.submissions.reopen(r.jobId);
  await s.inbox.open(card.notificationId, card.materialVersion, card.recoveryInputs, c);
  expect((await s.inbox.list(filter, c)).cards[0].unread).toBe(false);
  expect(await s.submissions.reopen(r.jobId)).toEqual(original);
  s.f.reopen();
  expect((await s.inbox.list(filter, await s.context())).cards[0]).toEqual({
    ...card,
    unread: false,
  });
});
it("same-failure replay/retry never reorders or resets unread, but a meaningful new failure code is unread", async () => {
  const s = setup(),
    r = await s.fail(),
    c = await s.context();
  const first = (await s.inbox.list(filter, c)).cards[0];
  await s.inbox.open(
    first.notificationId,
    first.materialVersion,
    first.recoveryInputs,
    c,
  );
  await s.submissions.submit(r, new Map([[r.inputs[0].id, async () => ({ text: "" })]]));
  const repeated = (await s.inbox.list(filter, c)).cards[0];
  expect(repeated).toMatchObject({
    unread: false,
    materialVersion: 1,
    createdAt: first.createdAt,
  });
  await expect(
    s.inbox.open(first.notificationId, first.materialVersion, first.recoveryInputs, c),
  ).rejects.toThrow("UNAVAILABLE");
  await s.submissions.submit(
    r,
    new Map([[r.inputs[0].id, async () => ({ bytes: new Uint8Array([255]) })]]),
  );
  const changed = (await s.inbox.list(filter, c)).cards[0];
  expect(changed).toMatchObject({
    unread: true,
    materialVersion: 2,
    createdAt: first.createdAt,
  });
  expect(changed.recoveryInputs[0].failureCode).toBe("INVALID_UTF8");
  await expect(
    s.inbox.open(first.notificationId, 1, first.recoveryInputs, c),
  ).rejects.toThrow("UNAVAILABLE");
});
it("normal accepted continuation resolves attention without a new card/time or automatic read; corrupt successor bytes make action unavailable", async () => {
  const s = setup(),
    r = await s.fail(),
    c = await s.context();
  const first = (await s.inbox.list(filter, c)).cards[0];
  const next = s.f.request();
  next.inputs[0].continuesFromInputId = r.inputs[0].id;
  const old = await s.submissions.reopen(r.jobId);
  await s.submissions.submit(
    next,
    new Map([[next.inputs[0].id, async () => ({ text: "verified original" })]]),
    undefined,
    undefined,
    { [r.inputs[0].id]: old.inputs[0].revision },
  );
  const solved = (await s.inbox.list(filter, c)).cards[0];
  expect(solved).toMatchObject({
    notificationId: first.notificationId,
    materialVersion: first.materialVersion,
    createdAt: first.createdAt,
    sourceState: "RECOVERED",
    unread: true,
    recoveryInputs: [],
  });
  expect(
    (await s.inbox.list({ ...filter, category: "NEEDS_ATTENTION" }, c)).cards,
  ).toEqual([]);
  const read = s.f.db.getFirstAsync.bind(s.f.db);
  vi.spyOn(s.f.db, "getFirstAsync").mockImplementation(
    async <T>(q: string, ...p: unknown[]) => {
      const row = await read<T>(q, ...(p as never[]));
      return q.includes("THEN bytes ELSE NULL") && row
        ? { ...row, bytes: new Uint8Array([1]) }
        : row;
    },
  );
  const unknown = await s.inbox.list(filter, c);
  expect(unknown.unknownSourcesInPage).toBe(1);
  expect(unknown.cards[0]).toMatchObject({
    sourceState: "UNAVAILABLE",
    unread: true,
    recoveryInputs: [],
  });
  expect(await s.inbox.markAllRead(filter, c)).toEqual({
    marked: 0,
    unavailableCount: 1,
  });
  await expect(
    s.inbox.open(first.notificationId, first.materialVersion, [], c),
  ).rejects.toThrow("UNAVAILABLE");
});
it("notification write failure rolls back the same owning C3 failure CAS", async () => {
  const s = setup(),
    r = s.f.request(),
    run = s.f.db.runAsync.bind(s.f.db);
  vi.spyOn(s.f.db, "runAsync").mockImplementation(async (q, ...p) => {
    if (q.includes("INSERT INTO updates_capture_intake"))
      throw new Error("owned failure write unavailable");
    return run(q, ...(p as never[]));
  });
  await expect(
    s.submissions.submit(r, new Map([[r.inputs[0].id, async () => ({ text: "" })]])),
  ).rejects.toThrow("write unavailable");
  expect((await s.submissions.reopen(r.jobId)).inputs[0]).toMatchObject({
    state: "PENDING",
    revision: 1,
    failureCode: null,
  });
  expect((await s.inbox.list(filter, await s.context())).cards).toHaveLength(0);
});
it("pending/NOT_INSTALLED, reader/hash infra, quotas and generic errors do not create notifications", async () => {
  const s = setup();
  await s.submissions.register(s.f.request());
  for (const code of [
    "READER_FAILURE",
    "HASH_FAILURE",
    "ROW_QUOTA",
    "ACCOUNT_BYTE_QUOTA",
    "DEVICE_BYTE_QUOTA",
  ] as const) {
    const r = s.f.request();
    const sources = new Map<string, () => Promise<CapturePayloadInput>>([
      [
        r.inputs[0].id,
        async () => {
          throw new LocalCaptureError(code);
        },
      ],
    ]);
    expect((await s.submissions.submit(r, sources)).inputs[0]).toMatchObject({
      state: "FAILED",
      failureCode: code,
    });
  }
  const generic = s.f.request();
  await expect(
    s.submissions.submit(
      generic,
      new Map([
        [
          generic.inputs[0].id,
          async () => {
            throw new Error("transient");
          },
        ],
      ]),
    ),
  ).rejects.toThrow("transient");
  expect((await s.inbox.list(filter, await s.context())).cards).toHaveLength(0);
});
it("read never manufactures historical notices and current pending is not attention or a false completed result", async () => {
  const s = setup(),
    r = await s.fail(),
    c = await s.context();
  const failed = (await s.submissions.reopen(r.jobId)).inputs[0];
  await s.submissions.resume(r.jobId, failed.id, failed.revision);
  expect((await s.inbox.list(filter, c)).cards[0].sourceState).toBe("INACTIVE");
  expect(
    (await s.inbox.list({ ...filter, category: "NEEDS_ATTENTION" }, c)).cards,
  ).toHaveLength(0);
  // Owned test removes the notice only, leaving normal historical C3 facts; reads must not backfill it.
  await s.f.db.runAsync(
    "DELETE FROM updates_capture_intake WHERE account_id=?",
    c.accountId,
  );
  expect((await s.inbox.list(filter, c)).cards).toHaveLength(0);
  expect(await s.inbox.markAllRead(filter, c)).toEqual({
    marked: 0,
    unavailableCount: 0,
  });
});
it("Mark All respects current category/query/unread and keeps personal cards across Trip switches, never another Account", async () => {
  const s = setup();
  const one = await s.fail(),
    two = await s.fail(),
    c = await s.context();
  const secondInput = two.inputs[0];
  await s.submissions.submit(
    two,
    new Map([[secondInput.id, async () => ({ bytes: new Uint8Array([255]) })]]),
  );
  expect(await s.inbox.markAllRead({ ...filter, category: "MESSAGES" }, c)).toEqual({
    marked: 0,
    unavailableCount: 0,
  });
  expect(
    await s.inbox.markAllRead(
      {
        ...filter,
        category: "NEEDS_ATTENTION",
        query: "INVALID_UTF8",
        unreadOnly: true,
        currentTripId: randomUUID(),
      },
      c,
    ),
  ).toEqual({ marked: 1, unavailableCount: 0 });
  const page = await s.inbox.list(filter, c);
  expect(page.cards.find((x) => x.jobId === one.jobId)!.unread).toBe(true);
  expect(page.cards.find((x) => x.jobId === two.jobId)!.unread).toBe(false);
  const foreign = randomUUID();
  await s.f.switchTo(foreign);
  await s.fail();
  const other = await s.context();
  expect(await s.inbox.markAllRead(filter, other)).toEqual({
    marked: 1,
    unavailableCount: 0,
  });
  await s.f.switchTo(c.accountId);
  expect(
    (await s.inbox.list(filter, await s.context())).cards.find(
      (x) => x.jobId === one.jobId,
    )!.unread,
  ).toBe(true);
  await expect(s.inbox.list(filter, c)).rejects.toThrow("Account changed");
  await expect(
    s.inbox.open(
      page.cards[0].notificationId,
      page.cards[0].materialVersion,
      page.cards[0].recoveryInputs,
      other,
    ),
  ).rejects.toThrow("Account changed");
});
it("filtered bounded pages remain honest and Mark All processes every matching owned page", async () => {
  const s = setup();
  for (let i = 0; i < 102; i++) await s.fail();
  const c = await s.context(),
    page = await s.inbox.list(filter, c, { limit: 2 });
  expect(page.cards).toHaveLength(2);
  expect(page.next).not.toBeNull();
  const next = await s.inbox.list(filter, c, { limit: 2, before: page.next! });
  expect(
    next.cards.every(
      (x) => !page.cards.some((a) => a.notificationId === x.notificationId),
    ),
  ).toBe(true);
  expect(await s.inbox.markAllRead({ ...filter, unreadOnly: true }, c)).toEqual({
    marked: 102,
    unavailableCount: 0,
  });
  expect((await s.inbox.list({ ...filter, unreadOnly: true }, c)).cards).toHaveLength(0);
});

it("actual SQLite62→63 additive upgrade preserves normal accepted originals and creates no historical cards", async () => {
  const sql = new DatabaseSync(":memory:");
  const account = randomUUID();
  const db: LocalCaptureDatabase = {
    async getFirstAsync<T>(q: string, ...params: unknown[]) {
      return (sql.prepare(q).get(...(params as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(q: string, ...params: unknown[]) {
      return sql.prepare(q).all(...(params as never[])) as T[];
    },
    async runAsync(q: string, ...params: unknown[]) {
      const r = sql.prepare(q).run(...(params as never[]));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async withTransactionAsync(work) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  try {
    sql.exec("PRAGMA foreign_keys=ON");
    for (const migration of migrations.filter((m) => m.id <= 62)) sql.exec(migration.sql);
    const request = setup().f.request();
    request.accountId = account;
    request.context.accountId = account;
    const deps = { sha256, now: () => at, newId: randomUUID },
      getAccount = async () => account;
    const submissions = createCaptureSubmissionRepository(db, getAccount, deps);
    await submissions.submit(
      request,
      new Map([[request.inputs[0].id, async () => ({ text: "retained before63" })]]),
    );
    const before = await submissions.reopen(request.jobId);
    const payload = sql
      .prepare(
        "SELECT hex(bytes) AS bytes FROM local_capture_payloads WHERE account_id=?",
      )
      .get(account);
    sql.exec(updatesInboxMigration.sql);
    expect(await submissions.reopen(request.jobId)).toEqual(before);
    expect(
      sql
        .prepare(
          "SELECT hex(bytes) AS bytes FROM local_capture_payloads WHERE account_id=?",
        )
        .get(account),
    ).toEqual(payload);
    const inbox = createUpdatesInboxRepository(
      db,
      getAccount,
      createCaptureSubmissionTransactionStore(db, deps),
    );
    const context = await captureAccountRequestContext("", getAccount);
    expect((await inbox.list(filter, context)).cards).toHaveLength(0);
    await submissions.submit(request, new Map());
    expect((await inbox.list(filter, context)).cards).toHaveLength(0);
    expect(await submissions.reopen(request.jobId)).toEqual(before);
  } finally {
    sql.close();
  }
});
it("safe presentation text uses identical list and snapshot Mark All predicates without exposing private source fields", async () => {
  const s = setup(),
    first = await s.fail(1),
    second = await s.fail(2),
    context = await s.context();
  const presentationText = (state: string, count: number) =>
    `${state} · ${count}项材料需要重新选取`;
  const query = {
    ...filter,
    category: "NEEDS_ATTENTION" as const,
    unreadOnly: true,
    query: "1项材料需要重新选取",
  };
  const page = await s.inbox.list(query, context, { presentationText });
  expect(page.cards.map((card) => card.jobId)).toEqual([first.jobId]);
  expect(await s.inbox.markAllRead(query, context, { presentationText })).toMatchObject({
    marked: 1,
  });
  const unread = (await s.inbox.list({ ...filter, unreadOnly: true }, context)).cards;
  expect(unread.map((card) => card.jobId)).toEqual([second.jobId]);
  expect(
    (
      await s.inbox.list({ ...filter, query: "PRIVATE secret-name" }, context, {
        presentationText,
      })
    ).cards,
  ).toHaveLength(0);
  expect(
    (
      await s.inbox.list({ ...query, category: "MESSAGES" }, context, {
        presentationText,
      })
    ).cards,
  ).toHaveLength(0);
});

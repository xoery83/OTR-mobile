import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureAccountRequestContext,
  withAccountApplyGate,
} from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import {
  fixture,
  sha256,
  now,
} from "@/data/repositories/__fixtures__/captureBatchAssessment";
import { createCaptureBatchAssessmentAdapter } from "@/data/repositories/captureBatchAssessmentAdapter";
import { createCaptureBatchAssessmentObservationRepository } from "@/data/repositories/captureBatchAssessmentObservationRepository";
import {
  observationJson,
  validateAssessmentObservation,
  type AssessmentObservationBody,
} from "@/domain/capture/batchAssessmentObservation";
import { importDigest } from "@/domain/trip/flightImportReview";
import type { Json } from "@/domain/trip/eventIntentJson";
import { createCaptureBatchAssessmentComposer } from "./captureBatchAssessmentComposer";

afterEach(() => vi.restoreAllMocks());
type Fixture = ReturnType<typeof fixture>;
const deps = { sha256, now, newId: randomUUID };
const composer = (f: Fixture, hash = sha256) =>
  createCaptureBatchAssessmentComposer(f.db, f.admission.transactionStore, f.getAccount, {
    ...deps,
    sha256: hash,
  });
const context = (f: Fixture) => captureAccountRequestContext("", f.getAccount);
const rows = (f: Fixture) =>
  f.sql
    .prepare(
      "SELECT * FROM capture_batch_assessment_observations ORDER BY assessment_revision",
    )
    .all();
const count = (f: Fixture) => rows(f).length;
async function body(f: Fixture, jobId: string): Promise<AssessmentObservationBody> {
  const a = await f.adapter.assess(jobId);
  return {
    version: 1,
    c2RequestSha256: a.c2.requestSha256,
    c2ManifestSha256: a.c2.manifestSha256,
    contextSha256: a.manifest.contextSha256,
    parentBodySha256: null,
    manifest: a.manifest,
    snapshot: a.snapshot,
    envelope: a.assessment,
  };
}
async function tx(f: Fixture, work: () => Promise<void>) {
  await withAccountApplyGate(() => f.db.withTransactionAsync(work));
}
function transitionInput(f: Fixture, id: string, reason: "REACQUIRE" | "RECOVER_COMMIT") {
  expect(
    f.sql
      .prepare(
        "UPDATE capture_submission_inputs SET pending_reason=?,row_revision=row_revision+1 WHERE input_id=? AND acceptance_state='PENDING'",
      )
      .run(reason, id).changes,
  ).toBe(1);
}
const latch = () => {
  let release!: () => void;
  return {
    promise: new Promise<void>((r) => {
      release = r;
    }),
    release: () => release(),
  };
};

describe("dormant integrated C4 Composer", () => {
  it("persists the complete duplicate occurrence roster and UNKNOWN, without business/queue/network writes", async () => {
    const f = fixture(),
      r = await f.submit(2),
      c = composer(f);
    const before = await f.submissions.reopen(r.jobId);
    const writes = vi.spyOn(f.db, "runAsync");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("NETWORK_DENIED"));
    const result = await c.assess(await context(f), r.jobId);
    expect(result.status).toBe("APPENDED");
    const verified = await validateAssessmentObservation(
      rows(f)[0].body_json as string,
      sha256,
    );
    expect(verified.body.snapshot.inputs.map((i) => i.inputId)).toEqual(
      r.inputs.map((i) => i.id),
    );
    expect(verified.body.snapshot.inputs.map((i) => i.processing)).toEqual([
      "UNKNOWN",
      "UNKNOWN",
    ]);
    const originals = verified.body.snapshot.inputs.map((i) =>
      i.acquisition.state === "ACCEPTED" ? i.acquisition.original : null,
    );
    expect(originals[0]!.payloadId).toBe(originals[1]!.payloadId);
    expect(originals[0]!.captureId).not.toBe(originals[1]!.captureId);
    expect(verified.body.envelope).toMatchObject({
      barrier: "PENDING",
      preparation: "NOT_AUTHORIZED",
      domainAdmission: "NOT_AUTHORIZED",
    });
    expect(writes.mock.calls).toHaveLength(1);
    expect(writes.mock.calls[0][0]).toContain(
      "INSERT INTO capture_batch_assessment_observations",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(await f.submissions.reopen(r.jobId)).toEqual(before);
    expect((await c.assess(await context(f), r.jobId)).status).toBe("UNCHANGED");
    expect(count(f)).toBe(1);
  });
  it("uses trusted installed Membership while preserving unproven sibling blocking and private projection", async () => {
    const f = fixture(),
      r = await f.submit(2);
    await f.publish(r);
    const c = composer(f),
      result = await c.assess(await context(f), r.jobId);
    expect(result.status).toBe("APPENDED");
    const raw = JSON.parse(rows(f)[0].body_json as string);
    expect(raw.snapshot.inputs.map((i: { processing: string }) => i.processing)).toEqual([
      "UNDERSTOOD",
      "UNKNOWN",
    ]);
    expect(raw.envelope.findings[0]).toMatchObject({
      dependencyState: "BLOCKED",
      reasons: ["DEPENDENCY_UNKNOWN"],
      matureActionableAttention: false,
    });
    const writes = vi.spyOn(f.db, "runAsync");
    const projection = await c.readAssessment(await context(f), r.jobId);
    expect(projection).toMatchObject({
      status: "OBSERVED",
      historicalOnly: true,
      currentAuthority: "NOT_ASSERTED",
      summary: {
        inputCount: 2,
        findingCount: 1,
        blockedFindingCount: 1,
        supportedFindingCount: 0,
        matureActionableAttention: false,
        preparation: "NOT_AUTHORIZED",
        domainAdmission: "NOT_AUTHORIZED",
      },
    });
    expect(Object.keys(projection).sort()).toEqual([
      "currentAuthority",
      "historicalOnly",
      "receipt",
      "status",
      "summary",
    ]);
    expect(JSON.stringify(projection)).not.toMatch(
      /proposal|locator|Flight|source_id|tripId/,
    );
    expect(writes).not.toHaveBeenCalled();
    expect((await f.submissions.reopen(r.jobId)).processing.capability).toBe(
      "NOT_INSTALLED",
    );
  });
  it.each(["NULL", "stale"] as const)(
    "withholds discovered %s Membership intact",
    async (kind) => {
      const f = fixture(),
        r = await f.submit();
      await f.publish(r, undefined, kind !== "NULL");
      if (kind === "stale")
        expect(
          f.sql
            .prepare("UPDATE trip_source_candidates SET proposal_sha256=?")
            .run("0".repeat(64)).changes,
        ).toBe(1);
      expect(["UNAVAILABLE", "REJECTED"]).toContain(
        (await composer(f).assess(await context(f), r.jobId)).status,
      );
      expect(count(f)).toBe(0);
    },
  );
  it("recomputes durable revisions/parent/envelope; semantic A→B→A transitions retain three rows", async () => {
    const f = fixture(),
      r = f.request();
    await f.submissions.register(r);
    const c = composer(f),
      ctx = await context(f);
    expect((await c.assess(ctx, r.jobId)).status).toBe("APPENDED");
    transitionInput(f, r.inputs[0].id, "RECOVER_COMMIT");
    expect((await c.assess(ctx, r.jobId)).status).toBe("APPENDED");
    transitionInput(f, r.inputs[0].id, "REACQUIRE");
    expect((await c.assess(ctx, r.jobId)).status).toBe("APPENDED");
    expect((await c.assess(ctx, r.jobId)).status).toBe("UNCHANGED");
    const retained = rows(f);
    expect(retained.map((r) => r.assessment_revision)).toEqual([1, 2, 3]);
    for (let n = 0; n < retained.length; n++) {
      const verified = await validateAssessmentObservation(
        retained[n].body_json as string,
        sha256,
      );
      expect(verified.body.snapshot.assessmentRevision).toBe(n + 1);
      expect(verified.body.envelope.assessmentRevision).toBe(n + 1);
      expect(verified.body.parentBodySha256).toBe(n ? retained[n - 1].body_sha256 : null);
      expect(verified.body.envelope.snapshotSha256).toBe(
        await importDigest(
          "otr-capture-processing-snapshot-v1",
          verified.body.snapshot as Json,
          sha256,
        ),
      );
    }
    expect(
      JSON.parse(retained[0].body_json as string).snapshot.inputs[0].acquisition.state,
    ).toBe("PENDING");
    expect(
      JSON.parse(retained[1].body_json as string).snapshot.inputs[0].acquisition.state,
    ).toBe("UNKNOWN");
    expect(
      JSON.parse(retained[2].body_json as string).snapshot.inputs[0].acquisition.state,
    ).toBe("PENDING");
    expect(retained[2].body_sha256).not.toBe(retained[0].body_sha256);
  });
  it("concurrent identical callbacks append once and exactly replay", async () => {
    const f = fixture(),
      r = await f.submit(),
      both = latch();
    let hashes = 0;
    const c = composer(f, async (bytes) => {
      if (
        new TextDecoder()
          .decode(bytes)
          .startsWith("otr-capture-assessment-observation-v1\n") &&
        hashes++ < 2
      ) {
        if (hashes === 2) both.release();
        await both.promise;
      }
      return sha256(bytes);
    });
    const ctx = await context(f);
    const results = await Promise.all([c.assess(ctx, r.jobId), c.assess(ctx, r.jobId)]);
    expect(results.map((r) => r.status).sort()).toEqual(["APPENDED", "EXACT_REPLAY"]);
    expect(count(f)).toBe(1);
  });

  it("an already sealed concurrent attempt cannot NEW append while a sibling outcome is unresolved", async () => {
    const f = fixture(),
      r = await f.submit(),
      firstSealed = latch(),
      secondSealed = latch(),
      firstRelease = latch(),
      secondRelease = latch();
    let hashes = 0;
    const c = composer(f, async (bytes) => {
      if (
        new TextDecoder()
          .decode(bytes)
          .startsWith("otr-capture-assessment-observation-v1\n")
      ) {
        if (++hashes === 1) {
          firstSealed.release();
          await firstRelease.promise;
        } else if (hashes === 2) {
          secondSealed.release();
          await secondRelease.promise;
        }
      }
      return sha256(bytes);
    });
    const ctx = await context(f),
      first = c.assess(ctx, r.jobId);
    await firstSealed.promise;
    const second = c.assess(ctx, r.jobId);
    await secondSealed.promise;
    const run = f.db.runAsync.bind(f.db);
    let failed = false;
    vi.spyOn(f.db, "runAsync").mockImplementation(async (q, ...args) => {
      if (!failed && q.includes("INSERT INTO capture_batch_assessment")) {
        failed = true;
        throw new Error("SQLITE_IOERR");
      }
      return run(q, ...args);
    });
    firstRelease.release();
    expect((await first).status).toBe("OUTCOME_UNKNOWN");
    secondRelease.release();
    const result = await second;
    expect(result.status).toBe("OUTCOME_UNKNOWN");
    expect(count(f)).toBe(0);
    if (result.status !== "OUTCOME_UNKNOWN") throw new Error("missing receipt");
    expect((await c.recover(ctx, result.receipt)).status).toBe("ABSENT");
    expect((await c.assess(ctx, r.jobId)).status).toBe("APPENDED");
  });
  it.each(["before INSERT", "before COMMIT", "after COMMIT"] as const)(
    "queued real Account A→B→A at %s denies old-generation disclosure",
    async (point) => {
      const f = fixture(),
        r = await f.submit(),
        c = composer(f),
        ctx = await context(f);
      let transition: Promise<void> | undefined;
      const change = () => {
        transition ??= f.switchTo(randomUUID()).then(() => f.switchTo(r.accountId));
      };
      const run = f.db.runAsync.bind(f.db),
        all = f.db.getAllAsync.bind(f.db),
        first = f.db.getFirstAsync.bind(f.db),
        transaction = f.db.withTransactionAsync.bind(f.db);
      let inserted = false,
        transactions = 0;
      vi.spyOn(f.db, "runAsync").mockImplementation(async (q, ...args) => {
        if (q.includes("INSERT INTO capture_batch_assessment")) inserted = true;
        return run(q, ...args);
      });
      vi.spyOn(f.db, "getAllAsync").mockImplementation(async (q, ...args) => {
        const value = await all(q, ...args);
        if (
          point === "before COMMIT" &&
          inserted &&
          q.includes("FROM capture_batch_assessment_observations")
        )
          change();
        return value;
      });
      vi.spyOn(f.db, "getFirstAsync").mockImplementation(async (q, ...args) => {
        const value = await first(q, ...args);
        if (
          point === "before INSERT" &&
          q.includes("FROM capture_submission_batches") &&
          transactions === 4
        )
          change();
        return value;
      });
      vi.spyOn(f.db, "withTransactionAsync").mockImplementation(async (work) => {
        const current = ++transactions;
        await transaction(work);
        if (point === "after COMMIT" && current === 4) change();
      });
      const result = await c.assess(ctx, r.jobId);
      expect(transition).toBeDefined();
      await transition;
      expect(result.status).toBe(
        point === "before INSERT" ? "UNAVAILABLE" : "OUTCOME_UNKNOWN",
      );
      expect(count(f)).toBe(point === "after COMMIT" ? 1 : 0);
      if (result.status === "OUTCOME_UNKNOWN")
        expect((await c.recover(await context(f), result.receipt)).status).toBe(
          count(f) ? "FOUND" : "ABSENT",
        );
      expect((await c.readAssessment(ctx, r.jobId)).status).toBe("UNAVAILABLE");
    },
  );

  it("concurrent changed content loses revision CAS without rebasing its sealed body", async () => {
    const f = fixture(),
      r = f.request();
    await f.submissions.register(r);
    const sealed = latch(),
      release = latch();
    let hold = true;
    const c = composer(f, async (bytes) => {
      if (
        hold &&
        new TextDecoder()
          .decode(bytes)
          .startsWith("otr-capture-assessment-observation-v1\n")
      ) {
        hold = false;
        sealed.release();
        await release.promise;
      }
      return sha256(bytes);
    });
    const ctx = await context(f),
      first = c.assess(ctx, r.jobId);
    await sealed.promise;
    transitionInput(f, r.inputs[0].id, "RECOVER_COMMIT");
    expect((await c.assess(ctx, r.jobId)).status).toBe("APPENDED");
    release.release();
    expect(await first).toEqual({
      status: "REASSESS_REQUIRED",
      code: "REVISION_CONFLICT",
    });
    expect(count(f)).toBe(1);
  });
  it.each([
    "Capture",
    "Trip",
    "Source",
    "Run",
    "Candidate",
    "Representation",
    "Input",
    "C2",
  ] as const)(
    "rejects a successful late %s mutation in the actual append transaction",
    async (kind) => {
      const f = fixture(),
        r = f.request(2);
      await f.submissions.submit(
        r,
        new Map([
          [r.inputs[0].id, async () => ({ bytes: new TextEncoder().encode("abc") })],
        ]),
      );
      await f.publish(r);
      const c = composer(f),
        original = f.db.withTransactionAsync.bind(f.db);
      let transactions = 0,
        mutated = false,
        finalReads = 0;
      const read = f.db.getAllAsync.bind(f.db);
      vi.spyOn(f.db, "getAllAsync").mockImplementation(async (q, ...args) => {
        if (mutated && q.includes("typeof(row_revision) AS revisionStorage"))
          finalReads++;
        return read(q, ...args);
      });
      vi.spyOn(f.db, "withTransactionAsync").mockImplementation(async (work) => {
        // Initial/final Adapter + head read; next transaction is the NEW owning append.
        if (++transactions === 4) {
          if (kind === "Capture") {
            const item = f.sql
              .prepare(
                "SELECT capture_id FROM capture_submission_inputs WHERE input_id=?",
              )
              .get(r.inputs[0].id)!;
            expect(
              f.sql
                .prepare(
                  "UPDATE local_capture_inbox SET trip_id=NULL,state='INBOX',revision=revision+1 WHERE id=?",
                )
                .run(item.capture_id).changes,
            ).toBe(1);
          } else if (kind === "Trip")
            expect(f.sql.prepare("DELETE FROM ledger_actor_context").run().changes).toBe(
              1,
            );
          else if (kind === "C2") transitionInput(f, r.inputs[1].id, "RECOVER_COMMIT");
          else {
            const table = {
              Source: "trip_sources",
              Run: "trip_source_runs",
              Candidate: "trip_source_candidates",
              Representation: "trip_source_representations",
              Input: "trip_source_inputs",
            }[kind];
            expect(
              f.sql
                .prepare(
                  kind === "Candidate"
                    ? "UPDATE trip_source_candidates SET registration_state='PENDING'"
                    : kind === "Input"
                      ? "UPDATE trip_source_inputs SET registration_state='PENDING'"
                      : "UPDATE " + table + " SET row_revision=row_revision+1",
                )
                .run().changes,
            ).toBeGreaterThan(0);
          }
          mutated = true;
        }
        return original(work);
      });
      const result = await c.assess(await context(f), r.jobId);
      expect(mutated).toBe(true);
      expect(finalReads).toBeGreaterThan(0);
      expect(result).toEqual({ status: "REASSESS_REQUIRED", code: "STALE_OBSERVATION" });
      expect(count(f)).toBe(0);
    },
  );
  it.each([
    "observe",
    "head",
    "seal",
    "append",
    "insert",
    "before commit",
    "after commit",
  ] as const)("fences the original Account generation at %s", async (point) => {
    const f = fixture(),
      r = await f.submit();
    let changed = false,
      transactions = 0;
    const change = () => {
      changed = true;
      advanceAccountGeneration();
    };
    const transaction = f.db.withTransactionAsync.bind(f.db);
    vi.spyOn(f.db, "withTransactionAsync").mockImplementation(async (work) => {
      transactions++;
      const target =
        point === "observe" ? 1 : point === "head" ? 3 : point === "append" ? 4 : 0;
      if (target === transactions) change();
      if (point === "before commit" && transactions === 4)
        return transaction(async () => {
          await work();
          change();
        });
      await transaction(work);
      if (point === "after commit" && transactions === 4) change();
    });
    const run = f.db.runAsync.bind(f.db);
    vi.spyOn(f.db, "runAsync").mockImplementation(async (q, ...args) => {
      if (point === "insert" && q.includes("INSERT INTO capture_batch_assessment"))
        change();
      return run(q, ...args);
    });
    const c = composer(f, async (bytes) => {
      if (
        point === "seal" &&
        !changed &&
        new TextDecoder()
          .decode(bytes)
          .startsWith("otr-capture-assessment-observation-v1\n")
      ) {
        await f.switchTo(randomUUID());
        await f.switchTo(r.accountId);
        changed = true;
      }
      return sha256(bytes);
    });
    const result = await c.assess(await context(f), r.jobId);
    expect(changed).toBe(true);
    expect(["UNAVAILABLE", "OUTCOME_UNKNOWN", "REASSESS_REQUIRED"]).toContain(
      result.status,
    );
    expect(count(f)).toBe(point === "before commit" || point === "after commit" ? 1 : 0);
    if (result.status === "OUTCOME_UNKNOWN")
      expect((await c.recover(await context(f), result.receipt)).status).toBe(
        count(f) ? "FOUND" : "ABSENT",
      );
    await f.switchTo(randomUUID());
    expect((await c.readAssessment(await context(f), r.jobId)).status).toBe(
      "UNAVAILABLE",
    );
    await f.switchTo(r.accountId);
  });
  it.each(["preflight", "before INSERT", "before COMMIT", "after COMMIT"] as const)(
    "cancellation at %s preserves exact uncertain recovery",
    async (point) => {
      const f = fixture(),
        r = await f.submit(),
        c = composer(f),
        abort = new AbortController();
      if (point === "preflight") abort.abort();
      const run = f.db.runAsync.bind(f.db);
      const read = f.db.getAllAsync.bind(f.db);
      let inserted = false;
      vi.spyOn(f.db, "runAsync").mockImplementation(async (q, ...args) => {
        if (q.includes("INSERT INTO capture_batch_assessment")) inserted = true;
        return run(q, ...args);
      });
      vi.spyOn(f.db, "getAllAsync").mockImplementation(async (q, ...args) => {
        const value = await read(q, ...args);
        if (
          point === "before COMMIT" &&
          inserted &&
          q.includes("FROM capture_batch_assessment_observations")
        )
          abort.abort();
        return value;
      });
      const first = f.db.getFirstAsync.bind(f.db);
      let c2Reads = 0;
      vi.spyOn(f.db, "getFirstAsync").mockImplementation(async (q, ...args) => {
        const value = await first(q, ...args);
        if (
          point === "before INSERT" &&
          q.includes("FROM capture_submission_batches") &&
          ++c2Reads === 6
        )
          abort.abort();
        return value;
      });
      const transaction = f.db.withTransactionAsync.bind(f.db);
      let transactions = 0;
      vi.spyOn(f.db, "withTransactionAsync").mockImplementation(async (work) => {
        await transaction(work);
        if (point === "after COMMIT" && ++transactions === 4) abort.abort();
      });
      const result = await c.assess(await context(f), r.jobId, abort.signal);
      expect(abort.signal.aborted).toBe(true);
      if (point === "preflight") expect(result.status).toBe("CANCELED");
      else {
        expect(result.status).toBe("OUTCOME_UNKNOWN");
        if (result.status !== "OUTCOME_UNKNOWN") throw new Error("missing exact receipt");
        expect((await c.assess(await context(f), r.jobId)).status).toBe(
          "OUTCOME_UNKNOWN",
        );
        expect((await c.recover(await context(f), result.receipt)).status).toBe(
          point === "after COMMIT" ? "FOUND" : "ABSENT",
        );
      }
      expect(count(f)).toBe(point === "after COMMIT" ? 1 : 0);
    },
  );
  it("lost COMMIT ACK blocks replacement, then recovers exactly after file restart and authority loss", async () => {
    const f = fixture(true),
      r = await f.submit(),
      c = composer(f);
    await f.publish(r);
    const transaction = f.db.withTransactionAsync.bind(f.db);
    let transactions = 0;
    const spy = vi
      .spyOn(f.db, "withTransactionAsync")
      .mockImplementation(async (work) => {
        await transaction(work);
        if (++transactions === 4) throw new Error("LOST_COMMIT_ACK");
      });
    const result = await c.assess(await context(f), r.jobId);
    expect(result.status).toBe("OUTCOME_UNKNOWN");
    if (result.status !== "OUTCOME_UNKNOWN") throw new Error("missing exact receipt");
    spy.mockRestore();
    const raw = rows(f)[0].body_json;
    expect((await c.assess(await context(f), r.jobId)).status).toBe("OUTCOME_UNKNOWN");
    f.reopen();
    await f.captures.assign(
      (await f.submissions.reopen(r.jobId)).inputs[0].captureId!,
      null,
      2,
    );
    expect(await composer(f).recover(await context(f), result.receipt)).toMatchObject({
      status: "FOUND",
      receipt: result.receipt,
      historicalOnly: true,
    });
    expect(rows(f)[0].body_json).toBe(raw);
    expect(count(f)).toBe(1);
  });
  it.each(["BUSY", "IOERR", "FULL", "rollback"] as const)(
    "preserves history and exact absence for SQLite %s",
    async (kind) => {
      const f = fixture(true),
        r = f.request();
      await f.submissions.register(r);
      const c = composer(f);
      expect((await c.assess(await context(f), r.jobId)).status).toBe("APPENDED");
      const old = rows(f)[0].body_json;
      transitionInput(f, r.inputs[0].id, "RECOVER_COMMIT");
      const run = f.db.runAsync.bind(f.db);
      const spy = vi.spyOn(f.db, "runAsync").mockImplementation(async (q, ...args) => {
        if (q.includes("INSERT INTO capture_batch_assessment")) {
          if (kind === "FULL") {
            const pages = f.sql.prepare("PRAGMA page_count").get()!.page_count;
            f.sql.exec("PRAGMA max_page_count=" + pages);
            f.sql.exec(
              "CREATE TABLE full_probe(data BLOB); INSERT INTO full_probe VALUES(zeroblob(10485760))",
            );
          }
          throw new Error("SQLITE_" + kind);
        }
        return run(q, ...args);
      });
      const transaction = f.db.withTransactionAsync.bind(f.db);
      const rollback =
        kind === "rollback"
          ? vi.spyOn(f.db, "withTransactionAsync").mockImplementation(async (work) => {
              let caught: unknown;
              await transaction(async () => {
                try {
                  await work();
                } catch (e) {
                  caught = e;
                }
              });
              if (caught) throw new Error("ROLLBACK_ACK_UNKNOWN");
            })
          : null;
      const result = await c.assess(await context(f), r.jobId);
      expect(result.status).toBe("OUTCOME_UNKNOWN");
      expect(rows(f)[0].body_json).toBe(old);
      expect(count(f)).toBe(1);
      spy.mockRestore();
      rollback?.mockRestore();
      f.reopen();
      if (result.status !== "OUTCOME_UNKNOWN") throw new Error("missing receipt");
      expect((await c.recover(await context(f), result.receipt)).status).toBe("ABSENT");
      expect(rows(f)[0].body_json).toBe(old);
    },
  );
  it("cold reassessment without receipt is UNCHANGED; reads are write-free and unavailable is not empty", async () => {
    const f = fixture(true),
      r = await f.submit(),
      c = composer(f);
    expect(await c.readAssessment(await context(f), r.jobId)).toMatchObject({
      status: "UNASSESSED",
      receipt: null,
    });
    expect((await c.assess(await context(f), r.jobId)).status).toBe("APPENDED");
    f.reopen();
    const fresh = composer(f),
      writes = vi.spyOn(f.db, "runAsync");
    expect((await fresh.assess(await context(f), r.jobId)).status).toBe("UNCHANGED");
    expect((await fresh.readAssessment(await context(f), r.jobId)).status).toBe(
      "OBSERVED",
    );
    expect(writes).not.toHaveBeenCalled();
    vi.spyOn(f.db, "getAllAsync").mockRejectedValue(new Error("SQLITE_IOERR"));
    expect((await fresh.readAssessment(await context(f), r.jobId)).status).toBe(
      "UNAVAILABLE",
    );
  });
  it("corrupt tails never promote a historical prefix or allocate a NEW row", async () => {
    const f = fixture(),
      r = await f.submit(),
      c = composer(f);
    const result = await c.assess(await context(f), r.jobId);
    if (result.status !== "APPENDED") throw new Error("no retained observation");
    f.sql.exec(
      "DROP TRIGGER capture_assessment_no_update; UPDATE capture_batch_assessment_observations SET body_sha256='" +
        "0".repeat(64) +
        "'",
    );
    expect((await c.assess(await context(f), r.jobId)).status).toBe("INTEGRITY_BLOCKED");
    expect((await c.readAssessment(await context(f), r.jobId)).status).toBe(
      "INTEGRITY_BLOCKED",
    );
    expect((await c.recover(await context(f), result.receipt)).status).toBe(
      "INTEGRITY_BLOCKED",
    );
    expect(count(f)).toBe(1);
  });
  it("receipt recovery is exact, readonly and Account/Job scoped", async () => {
    const f = fixture(),
      r = await f.submit(),
      c = composer(f);
    const result = await c.assess(await context(f), r.jobId);
    if (result.status !== "APPENDED") throw new Error("missing receipt");
    const writes = vi.spyOn(f.db, "runAsync");
    expect((await c.recover(await context(f), result.receipt)).status).toBe("FOUND");
    expect(
      (
        await c.recover(await context(f), {
          ...result.receipt,
          bodySha256: "0".repeat(64),
        })
      ).status,
    ).toBe("REVISION_CONFLICT");
    expect(
      (await c.recover(await context(f), { ...result.receipt, jobId: randomUUID() }))
        .status,
    ).toBe("UNAVAILABLE");
    expect(
      (
        await c.recover(await context(f), {
          ...result.receipt,
          revision: Number.MAX_SAFE_INTEGER + 1,
        })
      ).status,
    ).toBe("UNAVAILABLE");
    await f.switchTo(randomUUID());
    expect((await c.recover(await context(f), result.receipt)).status).toBe(
      "UNAVAILABLE",
    );
    await f.switchTo(r.accountId);
    expect((await c.recover(await context(f), result.receipt)).status).toBe("FOUND");
    expect(writes).not.toHaveBeenCalled();
  });

  it("F1 correlates two real Jobs and Batches before accepting healthy exact absence or presence", async () => {
    const f = fixture(),
      first = await f.submit(),
      second = await f.submit(),
      c = composer(f),
      ctx = await context(f);
    expect(first.batchId).not.toBe(second.batchId);
    expect(first.jobId).not.toBe(second.jobId);
    expect(first.accountId).toBe(second.accountId);
    const receipt = {
      accountId: first.accountId,
      batchId: first.batchId,
      jobId: first.jobId,
      revision: 1,
      bodySha256: "0".repeat(64),
    };
    const writes = vi.spyOn(f.db, "runAsync");
    const before = f.sql.prepare("SELECT total_changes() n").get()!.n;
    expect(await c.recover(ctx, { ...receipt, jobId: second.jobId })).toEqual({
      status: "UNAVAILABLE",
    });
    expect(await c.recover(ctx, receipt)).toEqual({ status: "ABSENT" });
    expect(writes).not.toHaveBeenCalled();
    expect(f.sql.prepare("SELECT total_changes() n").get()!.n).toBe(before);
    const committed = await c.assess(ctx, first.jobId);
    if (committed.status !== "APPENDED") throw new Error("missing committed receipt");
    writes.mockClear();
    const retained = rows(f);
    expect(await c.recover(ctx, { ...committed.receipt, jobId: second.jobId })).toEqual({
      status: "UNAVAILABLE",
    });
    expect(
      await c.recover(ctx, { ...committed.receipt, jobId: second.jobId, revision: 2 }),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(await c.recover(ctx, { ...committed.receipt, revision: 2 })).toEqual({
      status: "ABSENT",
    });
    expect(await c.recover(ctx, committed.receipt)).toMatchObject({
      status: "FOUND",
      historicalOnly: true,
      receipt: committed.receipt,
    });
    expect(writes).not.toHaveBeenCalled();
    expect(rows(f)).toEqual(retained);
    const all = f.db.getAllAsync.bind(f.db);
    vi.spyOn(f.db, "getAllAsync").mockImplementation(async (q, ...args) => {
      if (q.includes("FROM capture_batch_assessment_observations"))
        throw new Error("SQLITE_IOERR");
      return all(q, ...args);
    });
    expect(await c.recover(ctx, { ...committed.receipt, revision: 2 })).toEqual({
      status: "UNAVAILABLE",
    });
  });
  it.each(["missing", "corrupt"] as const)(
    "F1 rejects %s immutable C2 header before any conclusive recovery",
    async (kind) => {
      const f = fixture(),
        r = await f.submit(),
        c = composer(f),
        ctx = await context(f);
      const result = await c.assess(ctx, r.jobId);
      if (result.status !== "APPENDED") throw new Error("missing receipt");
      let receipt = result.receipt;
      if (kind === "missing") receipt = { ...receipt, batchId: randomUUID() };
      else {
        // TEST-ONLY damage: accepted C2 guards prohibit editing its immutable header.
        f.sql.exec("DROP TRIGGER capture_submission_header_update");
        expect(
          f.sql
            .prepare(
              "UPDATE capture_submission_batches SET request_sha256=? WHERE batch_id=?",
            )
            .run("0".repeat(64), r.batchId).changes,
        ).toBe(1);
      }
      const writes = vi.spyOn(f.db, "runAsync"),
        before = f.sql.prepare("SELECT total_changes() n").get()!.n;
      expect(await c.recover(ctx, receipt)).toEqual({ status: "UNAVAILABLE" });
      expect(await c.recover(ctx, { ...receipt, revision: 2 })).toEqual({
        status: "UNAVAILABLE",
      });
      expect(writes).not.toHaveBeenCalled();
      expect(f.sql.prepare("SELECT total_changes() n").get()!.n).toBe(before);
      expect(count(f)).toBe(1);
    },
  );
  it("F1 recovery remains historical after real Account A→B→A and current Capture/Trip/Source authority loss", async () => {
    const f = fixture(true),
      r = await f.submit();
    await f.publish(r);
    const c = composer(f),
      ctx = await context(f),
      committed = await c.assess(ctx, r.jobId);
    if (committed.status !== "APPENDED") throw new Error("missing receipt");
    const job = await f.submissions.reopen(r.jobId);
    await f.captures.assign(job.inputs[0].captureId!, null, 2);
    f.sql.exec(
      "DELETE FROM ledger_actor_context; UPDATE trip_sources SET row_revision=row_revision+1",
    );
    await f.switchTo(randomUUID());
    await f.switchTo(r.accountId);
    expect(await c.recover(ctx, committed.receipt)).toEqual({ status: "UNAVAILABLE" });
    f.reopen();
    const fresh = composer(f),
      writes = vi.spyOn(f.db, "runAsync"),
      retained = rows(f);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("NETWORK_DENIED"));
    expect(await fresh.recover(await context(f), committed.receipt)).toMatchObject({
      status: "FOUND",
      historicalOnly: true,
      currentAuthority: "NOT_ASSERTED",
      receipt: committed.receipt,
    });
    expect(
      await fresh.recover(await context(f), { ...committed.receipt, revision: 2 }),
    ).toEqual({ status: "ABSENT" });
    expect(writes).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(rows(f)).toEqual(retained);
  });
  it.each(["header", "exact", "post read"] as const)(
    "F1 fences a same-Account new generation at recovery %s boundary",
    async (point) => {
      const f = fixture(),
        r = await f.submit(),
        c = composer(f),
        ctx = await context(f);
      const committed = await c.assess(ctx, r.jobId);
      if (committed.status !== "APPENDED") throw new Error("missing receipt");
      const first = f.db.getFirstAsync.bind(f.db),
        all = f.db.getAllAsync.bind(f.db),
        transaction = f.db.withTransactionAsync.bind(f.db);
      let changed = false,
        transactions = 0;
      const change = () => {
        if (!changed) {
          advanceAccountGeneration();
          changed = true;
        }
      };
      vi.spyOn(f.db, "getFirstAsync").mockImplementation(async (q, ...args) => {
        const value = await first(q, ...args);
        if (
          point === "header" &&
          q.includes("SELECT job_id AS jobId FROM capture_submission_batches")
        )
          change();
        return value;
      });
      vi.spyOn(f.db, "getAllAsync").mockImplementation(async (q, ...args) => {
        const value = await all(q, ...args);
        if (point === "exact" && q.includes("FROM capture_batch_assessment_observations"))
          change();
        return value;
      });
      vi.spyOn(f.db, "withTransactionAsync").mockImplementation(async (work) => {
        await transaction(work);
        if (point === "post read" && ++transactions === 2) change();
      });
      const writes = vi.spyOn(f.db, "runAsync"),
        retained = rows(f);
      expect(await c.recover(ctx, committed.receipt)).toEqual({ status: "UNAVAILABLE" });
      expect(changed).toBe(true);
      expect(writes).not.toHaveBeenCalled();
      expect(rows(f)).toEqual(retained);
    },
  );

  it("rejects whole oversized roster and missing schema without any fallback", async () => {
    const f = fixture(),
      r = f.request(65);
    await f.submissions.register(r);
    expect(await composer(f).assess(await context(f), r.jobId)).toEqual({
      status: "REJECTED",
      code: "C4A_RESOURCE_LIMIT",
    });
    expect(count(f)).toBe(0);
    f.sql.exec("DROP TABLE capture_batch_assessment_observations");
    expect((await composer(f).assess(await context(f), r.jobId)).status).toBe(
      "UNAVAILABLE",
    );
  });
});

describe("Adapter seal and SQLite52 synchronous admission", () => {
  it.each(["forged", "copied", "other factory", "other attempt", "mutated"] as const)(
    "rejects %s seals/body without writes",
    async (kind) => {
      const f = fixture(),
        r = await f.submit(),
        ctx = await context(f);
      const a = await f.adapter.observeForComposer(ctx, r.jobId),
        b = await body(f, r.jobId);
      let seal = a.seal;
      const adapter =
        kind === "other factory"
          ? createCaptureBatchAssessmentAdapter(
              f.db,
              f.admission.transactionStore,
              f.getAccount,
              deps,
            )
          : f.adapter;
      if (kind === "forged") seal = {};
      if (kind === "copied") seal = { ...a.seal };
      if (kind === "other attempt") {
        const other = await f.submit();
        seal = (await f.adapter.observeForComposer(ctx, other.jobId)).seal;
      }
      if (kind === "mutated") b.snapshot.inputs[0].processing = "PENDING";
      await expect(
        tx(f, () => adapter.assertCurrentForAppend(ctx, seal, b)),
      ).rejects.toThrow("C4A_ADAPTER_PROVENANCE_INVALID");
      expect(count(f)).toBe(0);
    },
  );
  it("requires transaction, original generation and exact content while preserving legacy revision1", async () => {
    const f = fixture(),
      r = await f.submit(),
      ctx = await context(f);
    const a = await f.adapter.observeForComposer(ctx, r.jobId),
      b = await body(f, r.jobId);
    await expect(f.adapter.assertCurrentForAppend(ctx, a.seal, b)).rejects.toThrow(
      "TRANSACTION_REQUIRED",
    );
    await tx(f, () => f.adapter.assertCurrentForAppend(ctx, a.seal, b));
    expect((await f.adapter.assess(r.jobId)).snapshot.assessmentRevision).toBe(1);
    await f.switchTo(randomUUID());
    await f.switchTo(r.accountId);
    await expect(
      tx(f, async () => f.adapter.assertCurrentForAppend(await context(f), a.seal, b)),
    ).rejects.toThrow("PROVENANCE_INVALID");
  });
  it.each([1, 2])(
    "approved append hook aborts at boundary %s, then historical replay bypasses it",
    async (boundary) => {
      const f = fixture(),
        r = await f.submit(),
        ctx = await context(f),
        raw = observationJson(await body(f, r.jobId));
      let calls = 0;
      const owning = vi.fn(async () => {});
      const repo = createCaptureBatchAssessmentObservationRepository(f.db, f.getAccount, {
        ...deps,
        // TEST-ONLY direct store fixture; Composer tests above use the real seal validator.
        assertCurrentOwningData: owning,
        assertAppendActive: () => {
          if (++calls === boundary) throw new Error("CANCELED");
        },
      });
      expect(
        (await repo.append(ctx, { revision: 0, bodySha256: null }, raw)).status,
      ).toBe("OUTCOME_UNKNOWN");
      expect(calls).toBe(boundary);
      expect(count(f)).toBe(0);
      const accepted = createCaptureBatchAssessmentObservationRepository(
        f.db,
        f.getAccount,
        { ...deps, assertCurrentOwningData: owning },
      );
      expect(
        (await accepted.append(ctx, { revision: 0, bodySha256: null }, raw)).status,
      ).toBe("APPENDED");
      owning.mockClear();
      expect(
        (await repo.append(ctx, { revision: 0, bodySha256: null }, raw)).status,
      ).toBe("EXACT_REPLAY");
      expect(owning).not.toHaveBeenCalled();
      expect(calls).toBe(boundary);
    },
  );
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isDeepStrictEqual } from "node:util";
import { serializeDatabaseTransactions } from "../db/databaseConnection";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "../auth/accountGeneration";
import { createTtrSelectionRepository } from "./ttrSelectionRepository";
import {
  createTtrInteractionController,
  type TtrInteractionSource,
} from "@/features/ttr/interactionController";
import { ttrFixture } from "@/domain/trip/__fixtures__/ttr";
import { ttrIdentityKey, type TtrMode } from "@/domain/trip/ttr";
import {
  openTtr,
  projectTtr,
  reduceTtr,
  type TtrPresentationProjection,
} from "@/domain/trip/ttrState";
import type { ComposedTransition } from "@/features/day-feed/TransitionRow";
import { ttrLabFixture } from "@/features/ttr/labFixtures";
import { composeDayStream } from "@/features/day-feed/composition";

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
const copy = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>;
const disposals: (() => void)[] = [];
afterEach(() => {
  while (disposals.length) disposals.pop()!();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "otr-ttr-controller-"));
  const path = join(dir, "selection.sqlite");
  let sql = new DatabaseSync(path);
  // Exact accepted test-only schema; no application database/migration is opened.
  const acceptedTest = readFileSync(
    new URL("./ttrSelectionRepository.test.ts", import.meta.url),
    "utf8",
  );
  sql.exec(acceptedTest.match(/const schema = `([\s\S]*?)`;/)![1]);
  const input = ttrFixture();
  input.scope.generation = getAccountGeneration();
  input.expiry = { eventDate: "2027-01-15", zone: "UTC" };
  let context = {
    accountId: input.scope.accountId,
    tripId: input.scope.tripId,
    generation: input.scope.generation,
  };
  let now = "2027-01-14T12:00:00Z";
  let current: TtrInteractionSource | null = {
    relation: { input, accessRevision: 1, publicationVersion: 4 },
    projection: projectTtr(openTtr(input, null, 4), { now, displayPermission: "DENIED" }),
    presentation: { key: "synthetic-feed/date/1", authorized: true },
  };
  let writes = 0,
    failCommit = false,
    lostAck = false;
  let beforeCommit: (() => Promise<void>) | undefined;
  let authorityHook: (() => Promise<void>) | undefined;
  const database = serializeDatabaseTransactions({
    async getFirstAsync<T>(query: string, ...params: unknown[]) {
      return (sql.prepare(query).get(...(params as never[])) ?? null) as T | null;
    },
    async runAsync(query: string, ...params: unknown[]) {
      ++writes;
      return sql.prepare(query).run(...(params as never[])) as never;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      let committed = false;
      try {
        await work();
        await beforeCommit?.();
        if (failCommit) throw new Error("SQLITE_ROLLBACK");
        sql.exec("COMMIT");
        committed = true;
        if (lostAck) throw new Error("UNCERTAIN_COMMIT_ACK");
      } catch (e) {
        if (!committed) sql.exec("ROLLBACK");
        throw e;
      }
    },
  });
  const repo = () =>
    createTtrSelectionRepository(database, async () => context.accountId, {
      clock: () => ({ instant: now, certain: true }),
      isCurrentRelation: async (_ctx, relation) => {
        await authorityHook?.();
        return (
          !!current?.presentation.authorized &&
          isDeepStrictEqual(current.relation, relation)
        );
      },
    });
  const real = repo();
  const repository = { read: vi.fn(real.read), confirm: vi.fn(real.confirm) };
  const publications: TtrPresentationProjection[] = [];
  const publish = vi.fn((p: TtrPresentationProjection, _key: string) => {
    publications.push(p);
  });
  const makeController = () =>
    createTtrInteractionController({
      repository,
      context: () => context,
      resolve: () => current,
      clock: () => now,
      publish,
    });
  const controller = makeController();
  function vector() {
    const p = current!.projection;
    return [
      copy(p.actions.openTtr!),
      { key: ttrIdentityKey(p.identity!), inputFingerprint: p.inputFingerprint },
    ] as const;
  }
  const open = () => controller.onOpenTtr(...vector());
  function reproject(selection = null as Awaited<ReturnType<typeof real.read>>) {
    current = {
      ...current!,
      projection: projectTtr(
        openTtr(current!.relation.input, selection, current!.relation.publicationVersion),
        { now, displayPermission: "DENIED" },
      ),
    };
  }
  disposals.push(() => {
    controller.dispose();
    sql.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    controller,
    makeController,
    repository,
    real,
    open,
    vector,
    publish,
    publications,
    reproject,
    current: () => current!,
    setCurrent: (s: TtrInteractionSource | null) => {
      current = s;
    },
    context: () => context,
    setContext: (s: typeof context) => {
      context = s;
    },
    setNow: (s: string) => {
      now = s;
    },
    writes: () => writes,
    rows: () => sql.prepare("SELECT * FROM ttr_selections").all(),
    raw: () => sql,
    reopen: () => {
      sql.close();
      sql = new DatabaseSync(path);
    },
    failCommit: (value = true) => {
      failCommit = value;
    },
    loseAck: (v: boolean) => {
      lostAck = v;
    },
    holdAuthority: () => {
      const entered = deferred(),
        release = deferred();
      let once = true;
      authorityHook = async () => {
        if (once) {
          once = false;
          entered.resolve();
          await release.promise;
        }
      };
      return { entered, release };
    },
    holdCommit: () => {
      const entered = deferred(),
        release = deferred();
      beforeCommit = async () => {
        entered.resolve();
        await release.promise;
      };
      return { entered, release };
    },
  };
}
it("UNKNOWN equal geometry survives Controller requalification and durable Confirm", async () => {
  const f = fixture();
  const src = copy(f.current());
  src.relation.input.to!.endpoint!.coordinates = {
    ...src.relation.input.from!.endpoint!.coordinates!,
  };
  f.setCurrent(src);
  f.reproject();
  await f.open();
  expect(f.controller.snapshot()!.state.qualification).toMatchObject({
    spatialEquivalence: { equivalence: "UNKNOWN" },
    geometricDistance: { meters: 0 },
  });
  f.controller.preview("walking");
  expect(await f.controller.confirm()).toMatchObject({ status: "PUBLISHED" });
  expect(f.rows()).toHaveLength(1);
  expect(f.publications[0]).toMatchObject({
    visibility: "SELECTED_MODE",
    mode: "walking",
    geometricDistance: { meters: 0 },
  });
});
it("unchanged G2 ttr-presentation/1 consumer composes zero-distance UNKNOWN", () => {
  const f = ttrLabFixture("STRAIGHT_LINE");
  const input = copy(f.supplemental!.input);
  input.to!.endpoint!.coordinates = { ...input.from!.endpoint!.coordinates! };
  const p = projectTtr(openTtr(input), { now: f.instant, displayPermission: "DENIED" });
  const stream = composeDayStream(f.query!(f.selectedDate, f.zone), f.instant, {
    ...f.ports,
    transitions: [p],
  });
  expect(stream.rows[1].transition).toMatchObject({
    visibility: "STRAIGHT_LINE",
    geometricDistance: { meters: 0 },
    mode: null,
  });
});

describe("synthetic interaction lifecycle with accepted SQLite repository", () => {
  it("opens a current intent with no selected mode, request, write or draft publication", async () => {
    const f = fixture();
    await f.open();
    expect(f.controller.snapshot()!.state.preview!.mode).toBeNull();
    expect(f.current().projection.visibility).toBe("STRAIGHT_LINE");
    expect(f.current().projection.geometricDistance!.source).toBe("LOCAL_GEOMETRY");
    expect(f.writes()).toBe(0);
    expect(f.publish).not.toHaveBeenCalled();
    expect(f.controller.snapshot()!.state.route.status).toBe("MISSING");
    expect(() => f.controller.confirm()).toThrow("NO_MODE");
  });
  it.each(["walking", "driving", "transit"] as const)(
    "previews %s and dismisses with zero writes",
    async (mode) => {
      const f = fixture();
      await f.open();
      f.controller.preview(mode);
      expect(f.controller.snapshot()!.state.preview!.mode).toBe(mode);
      expect(f.current().projection.mode).toBeNull();
      f.controller.dismiss();
      expect(f.controller.snapshot()).toBeNull();
      expect(f.writes()).toBe(0);
      expect(f.publications).toEqual([]);
    },
  );
  it("rejects Cycling and rapidly switches only the draft", async () => {
    const f = fixture();
    await f.open();
    expect(() => f.controller.preview("cycling" as TtrMode)).toThrow();
    for (const mode of ["walking", "driving", "transit"] as const)
      f.controller.preview(mode);
    expect(f.controller.snapshot()!.state.preview!.mode).toBe("transit");
    expect(f.writes()).toBe(0);
    expect(f.publish).not.toHaveBeenCalled();
  });
  it("a system suggestion is not automatically selected or persisted", async () => {
    const f = fixture();
    const c = copy(f.current());
    c.relation.input.period = "TODAY";
    c.relation.input.queryTime = {
      kind: "DEPARTURE",
      instant: "2027-01-14T12:30:00Z",
      zone: "UTC",
      quality: "EXACT",
      precision: 0,
      comparable: true,
    };
    c.projection = projectTtr(openTtr(c.relation.input, null, 4), {
      now: "2027-01-14T12:00:00Z",
      displayPermission: "DENIED",
      suggestion: { source: "SYNTHETIC_TRUSTED_CONTEXT", mode: "walking" },
    }) as Mutable<TtrPresentationProjection>;
    f.setCurrent(c);
    await f.open();
    expect(f.current().projection.modeOrigin).toBe("SYSTEM_SUGGESTED");
    expect(f.controller.snapshot()!.state.preview!.mode).toBeNull();
    expect(() => f.controller.confirm()).toThrow("NO_MODE");
    expect(f.writes()).toBe(0);
  });
  it("restores existing durable mode; Preview/Dismiss preserves the previous choice", async () => {
    const f = fixture();
    const saved = await f.real.confirm(f.context(), f.current().relation, "walking");
    f.reproject(saved);
    await f.open();
    f.controller.preview("driving");
    f.controller.dismiss();
    expect(f.rows()[0].confirmed_mode).toBe("walking");
    await f.open();
    expect(f.controller.snapshot()!.state.preview!.mode).toBe("walking");
    expect(f.writes()).toBe(1);
  });
  it("Confirms offline, publishes only USER_CONFIRMED geometry and closes the local session", async () => {
    const f = fixture();
    await f.open();
    f.controller.preview("transit");
    expect((await f.controller.confirm()).status).toBe("PUBLISHED");
    const p = f.publications[0];
    expect(p.mode).toBe("transit");
    expect(p.modeOrigin).toBe("USER_CONFIRMED");
    expect(p.route).toEqual({ status: "MISSING" });
    expect(p.geometricDistance).toEqual(f.current().projection.geometricDistance);
    expect(p.identity).toEqual(f.current().projection.identity);
    expect(f.publish).toHaveBeenCalledWith(p, "synthetic-feed/date/1");
    expect(f.controller.snapshot()).toBeNull();
    expect(f.rows()).toHaveLength(1);
  });
  it.each(["PENDING", "FAILED", "AVAILABLE"] as const)(
    "incoming synthetic route %s never gates Confirm or leaks metrics",
    async (status) => {
      const f = fixture();
      const seed = await f.real.confirm(f.context(), f.current().relation, "walking");
      let state = openTtr(f.current().relation.input, seed, 4);
      state = reduceTtr(state, { type: "BEGIN_FIXTURE_REQUEST" });
      if (state.route.status !== "PENDING") throw new Error("fixture");
      const ticket = state.route.ticket;
      if (status === "FAILED")
        state = reduceTtr(state, {
          type: "FIXTURE_FAILURE",
          ticket,
          reason: "TIMEOUT",
        });
      if (status === "AVAILABLE")
        state = reduceTtr(state, {
          type: "FIXTURE_RESULT",
          ticket,
          observation: {
            source: "SYNTHETIC_FIXTURE",
            provider: "SYNTHETIC",
            method: "ETA",
            mode: "walking",
            observedAt: "2027-01-14T11:00:00Z",
            durationSeconds: 600,
            routeDistanceMeters: 1500,
          },
        });
      f.setCurrent({
        ...f.current(),
        projection: projectTtr(state, {
          now: "2027-01-14T12:00:00Z",
          displayPermission: "SYNTHETIC_ALLOWED",
        }),
      });
      await f.open();
      f.controller.preview("driving");
      await f.controller.confirm();
      expect(f.publications[0].mode).toBe("driving");
      expect(f.publications[0].route).toEqual({ status: "MISSING" });
      expect(JSON.stringify(f.publications)).not.toMatch(
        /durationSeconds|routeDistanceMeters/,
      );
    },
  );
  it("double Confirm shares one durable write and cannot acknowledge before commit", async () => {
    const f = fixture();
    await f.open();
    f.controller.preview("walking");
    const hold = f.holdCommit();
    const a = f.controller.confirm();
    const b = f.controller.confirm();
    expect(a).toBe(b);
    await hold.entered.promise;
    expect(f.publications).toEqual([]);
    expect(f.controller.snapshot()!.saving).toBe(true);
    hold.release.resolve();
    expect((await a).status).toBe("PUBLISHED");
    expect(f.repository.confirm).toHaveBeenCalledTimes(1);
    expect(f.writes()).toBe(1);
  });
  it.each(["dismiss", "dispose", "invalidate"] as const)(
    "%s during commit fences publication, retaining the durable row",
    async (action) => {
      const f = fixture();
      await f.open();
      f.controller.preview("walking");
      const hold = f.holdCommit();
      const saved = f.controller.confirm();
      await hold.entered.promise;
      f.controller[action]();
      hold.release.resolve();
      expect((await saved).status).toBe("SAVED_UNPUBLISHED");
      expect(f.rows()[0].confirmed_mode).toBe("walking");
      expect(f.publish).not.toHaveBeenCalled();
      expect(f.controller.snapshot()).toBeNull();
    },
  );
  it("reopens a closed pending Confirm after commit and restores durable mode from a cold file", async () => {
    const f = fixture();
    await f.open();
    f.controller.preview("walking");
    const hold = f.holdCommit();
    const request = f.controller.confirm();
    await hold.entered.promise;
    f.controller.dismiss();
    hold.release.resolve();
    await request;
    f.reopen();
    await f.open();
    expect(f.controller.snapshot()!.state.confirmed!.mode).toBe("walking");
  });
  it("a newer explicit choice cannot be overwritten/published by the older completion", async () => {
    const f = fixture();
    await f.open();
    f.controller.preview("walking");
    const hold = f.holdAuthority();
    const old = f.controller.confirm();
    await hold.entered.promise;
    f.controller.preview("driving");
    const newer = f.controller.confirm();
    hold.release.resolve();
    await Promise.all([old, newer]);
    expect(f.publications.map((p) => p.mode)).toEqual(["driving"]);
    expect(f.rows()[0].confirmed_mode).toBe("driving");
    expect(f.writes()).toBe(1);
  });
  it("SQL rollback never publishes and explicit re-read retains the draft", async () => {
    const f = fixture();
    await f.open();
    f.controller.preview("walking");
    f.failCommit();
    expect((await f.controller.confirm()).status).toBe("UNCERTAIN");
    expect(f.rows()).toEqual([]);
    expect(f.publications).toEqual([]);
    expect(f.controller.snapshot()!.uncertain).toBe(true);
    expect(() => f.controller.confirm()).toThrow("REREAD_REQUIRED");
    f.failCommit(false);
    expect(await f.controller.recover()).toBeNull();
    expect(f.controller.snapshot()!.state.preview!.mode).toBe("walking");
  });
  it("uncertain post-commit acknowledgment is safely re-read, never blindly retried", async () => {
    const f = fixture();
    await f.open();
    f.controller.preview("walking");
    f.loseAck(true);
    expect((await f.controller.confirm()).status).toBe("UNCERTAIN");
    expect(f.rows()[0].confirmed_mode).toBe("walking");
    expect(f.publish).not.toHaveBeenCalled();
    expect(() => f.controller.preview("driving")).toThrow("REREAD_REQUIRED");
    f.loseAck(false);
    await f.controller.recover();
    expect(f.publications[0].mode).toBe("walking");
    expect(f.writes()).toBe(1);
  });
  it("publisher failure is saved but unpublished, with no retry or lost durable choice", async () => {
    const f = fixture();
    await f.open();
    f.controller.preview("walking");
    f.publish.mockImplementationOnce(() => {
      throw new Error("consumer detached");
    });
    expect((await f.controller.confirm()).status).toBe("SAVED_UNPUBLISHED");
    expect(f.rows()[0].confirmed_mode).toBe("walking");
    expect(f.controller.snapshot()).toBeNull();
  });
  it.each(["repeat", "reverse"] as const)(
    "opens a new %s identity without carrying the previous mode",
    async (kind) => {
      const f = fixture();
      await f.real.confirm(f.context(), f.current().relation, "walking");
      const c = copy(f.current());
      if (kind === "repeat")
        c.relation.input.to!.occurrenceToken = c.relation.input.continuity!.toToken =
          "synthetic-entry-2";
      else {
        [c.relation.input.from, c.relation.input.to] = [
          c.relation.input.to,
          c.relation.input.from,
        ];
        [c.relation.input.continuity!.fromToken, c.relation.input.continuity!.toToken] = [
          c.relation.input.continuity!.toToken,
          c.relation.input.continuity!.fromToken,
        ];
      }
      ++c.relation.publicationVersion;
      f.setCurrent(c);
      f.reproject();
      await f.open();
      expect(f.controller.snapshot()!.state.confirmed).toBeNull();
      f.controller.preview("transit");
      await f.controller.confirm();
      expect(f.rows()).toHaveLength(2);
      expect(f.publications[0].mode).toBe("transit");
    },
  );
  it("read failure during uncertain recovery preserves the draft and uncertainty", async () => {
    const f = fixture();
    await f.open();
    f.controller.preview("walking");
    f.loseAck(true);
    await f.controller.confirm();
    f.repository.read.mockRejectedValueOnce(new Error("read unavailable"));
    await expect(f.controller.recover()).rejects.toThrow("read unavailable");
    expect(f.controller.snapshot()!.uncertain).toBe(true);
    expect(f.publish).not.toHaveBeenCalled();
  });
});

describe("current authority, identity and session fencing", () => {
  it.each([
    "missing",
    "applicability",
    "continuity",
    "revoked",
    "past",
    "expired",
    "presentation",
  ] as const)("rejects %s without action or deletion", async (kind) => {
    const f = fixture();
    const vector = f.vector();
    const c = copy(f.current());
    if (kind === "missing") f.setCurrent(null);
    else {
      if (kind === "applicability") c.relation.input.to!.applicable = "UNKNOWN";
      if (kind === "continuity") c.relation.input.continuity = null;
      if (kind === "revoked") c.relation.input.source.accessible = false;
      if (kind === "past") c.relation.input.period = "PAST";
      if (kind === "presentation")
        c.presentation = { ...c.presentation, authorized: false };
      if (kind === "expired") f.setNow("2027-01-30T00:00:00Z");
      f.setCurrent(c);
    }
    await expect(f.controller.onOpenTtr(...vector)).rejects.toThrow();
    expect(f.repository.read).not.toHaveBeenCalled();
    expect(f.writes()).toBe(0);
    expect(f.publish).not.toHaveBeenCalled();
  });
  it.each(["version", "key", "fingerprint", "reversed", "repeat"] as const)(
    "rejects stale/mismatched %s intent",
    async (kind) => {
      const f = fixture();
      const [intent, presentation] = copy(f.vector());
      if (kind === "version") ++intent.publicationVersion;
      if (kind === "key") presentation.key = "DayRow/0";
      if (kind === "fingerprint") presentation.inputFingerprint = "stale";
      if (kind === "reversed")
        [intent.identity.fromEventId, intent.identity.toEventId] = [
          intent.identity.toEventId,
          intent.identity.fromEventId,
        ];
      if (kind === "repeat")
        intent.identity.occurrenceDiscriminator =
          '["person","new","END","other","START"]';
      await expect(f.controller.onOpenTtr(intent, presentation)).rejects.toThrow();
      expect(f.writes()).toBe(0);
    },
  );
  it.each([
    "account",
    "trip",
    "traveller",
    "access",
    "version",
    "location",
    "time",
    "qualification",
    "presentation",
  ] as const)("%s changes during Open fence the old async callback", async (kind) => {
    const f = fixture();
    const original = f.repository.read.getMockImplementation()!;
    const entered = deferred(),
      release = deferred();
    f.repository.read.mockImplementationOnce(async (...args) => {
      const value = await original(...args);
      entered.resolve();
      await release.promise;
      return value;
    });
    const opening = f.open();
    await entered.promise;
    const c = copy(f.current());
    if (kind === "account") {
      advanceAccountGeneration();
      advanceAccountGeneration();
      f.setContext({ ...f.context(), generation: getAccountGeneration() });
    }
    if (kind === "trip")
      f.setContext({ ...f.context(), tripId: "90000000-0000-4000-8000-000000000001" });
    if (kind === "traveller") c.relation.input.scope.travellerKey = "other";
    if (kind === "access") ++c.relation.accessRevision;
    if (kind === "version") ++c.relation.publicationVersion;
    if (kind === "location") c.relation.input.to!.endpoint!.coordinates!.longitude = 2;
    if (kind === "time")
      c.relation.input.queryTime = {
        kind: "DEPARTURE",
        instant: "2027-01-14T13:00:00Z",
        zone: "UTC",
        quality: "EXACT",
        precision: 0,
        comparable: true,
      };
    if (kind === "qualification") c.relation.input.continuity = null;
    if (kind === "presentation") c.presentation = { ...c.presentation, key: "other-day" };
    f.setCurrent(c);
    release.resolve();
    await expect(opening).rejects.toThrow();
    expect(f.controller.snapshot()).toBeNull();
  });
  it.each([
    "account",
    "trip",
    "traveller",
    "access",
    "version",
    "location",
    "time",
    "presentation",
  ] as const)(
    "%s changes during Confirm suppress current-context publication",
    async (kind) => {
      const f = fixture();
      await f.open();
      f.controller.preview("walking");
      const hold = f.holdCommit();
      const request = f.controller.confirm();
      await hold.entered.promise;
      const c = copy(f.current());
      if (kind === "account") {
        advanceAccountGeneration();
        advanceAccountGeneration();
        f.setContext({ ...f.context(), generation: getAccountGeneration() });
      }
      if (kind === "trip")
        f.setContext({ ...f.context(), tripId: "90000000-0000-4000-8000-000000000001" });
      if (kind === "traveller") c.relation.input.scope.travellerKey = "other";
      if (kind === "access") ++c.relation.accessRevision;
      if (kind === "version") ++c.relation.publicationVersion;
      if (kind === "location") c.relation.input.to!.endpoint!.coordinates!.longitude = 2;
      if (kind === "time")
        c.relation.input.queryTime = {
          kind: "DEPARTURE",
          instant: "2027-01-14T13:00:00Z",
          zone: "UTC",
          quality: "EXACT",
          precision: 0,
          comparable: true,
        };
      if (kind === "presentation")
        c.presentation = { ...c.presentation, key: "new-date" };
      f.setCurrent(c);
      hold.release.resolve();
      await request;
      expect(f.publish).not.toHaveBeenCalled();
      expect(f.controller.snapshot()).toBeNull();
    },
  );
  it("revalidates before Preview/Confirm and retains selection while authority is unavailable", async () => {
    const f = fixture();
    await f.real.confirm(f.context(), f.current().relation, "walking");
    await f.open();
    f.setCurrent(null);
    expect(() => f.controller.preview("driving")).toThrow("STALE");
    expect(() => f.controller.confirm()).toThrow("STALE");
    expect(f.rows()[0].confirmed_mode).toBe("walking");
  });
  it("disposal and a newer Open fence an older Open completion", async () => {
    const f = fixture();
    const entered = deferred(),
      release = deferred();
    f.repository.read.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      return null;
    });
    const old = f.open();
    await entered.promise;
    await f.open();
    f.controller.preview("transit");
    release.resolve();
    await expect(old).rejects.toThrow("STALE");
    expect(f.controller.snapshot()!.state.preview!.mode).toBe("transit");
    f.controller.dispose();
    await expect(f.open()).rejects.toThrow("CONTEXT_CHANGED");
  });
  it("captures the intent before async read rather than accepting caller mutation", async () => {
    const f = fixture();
    const [intent, presentation] = copy(f.vector());
    const entered = deferred(),
      release = deferred();
    f.repository.read.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      return null;
    });
    const opening = f.controller.onOpenTtr(intent, presentation);
    await entered.promise;
    intent.publicationVersion = 999;
    intent.identity.accountId = "tampered";
    presentation.key = "tampered";
    release.resolve();
    await opening;
    expect(f.controller.snapshot()!.state.publicationVersion).toBe(4);
    expect(f.controller.snapshot()!.state.identity!.accountId).toBe(
      f.context().accountId,
    );
  });
  it("mutable snapshots cannot change the controller's captured intent or draft", async () => {
    const f = fixture();
    await f.open();
    const state = f.controller.snapshot()!;
    state.state.input!.scope.accountId = "tampered";
    expect(f.controller.snapshot()!.state.input!.scope.accountId).toBe(
      f.context().accountId,
    );
  });
  it("accepts the actual composed G2 intent without depending on row index or shared Focus", async () => {
    const f = fixture();
    const lab = ttrLabFixture("STRAIGHT_LINE");
    const input = structuredClone(lab.supplemental!.input);
    input.scope.generation = f.context().generation;
    f.setContext({ ...f.context(), tripId: input.scope.tripId });
    const projection = projectTtr(openTtr(input, null, 0), {
      now: lab.instant,
      displayPermission: "DENIED",
    });
    f.setNow(lab.instant);
    f.setCurrent({
      relation: { input, accessRevision: 1, publicationVersion: 0 },
      projection,
      presentation: { key: "accepted-lab", authorized: true },
    });
    const controller = f.makeController();
    const rows = composeDayStream(lab.query!(lab.selectedDate, lab.zone), lab.instant, {
      scope: { accountId: input.scope.accountId, tripId: input.scope.tripId },
      transitions: [projection],
    }).rows;
    const transition: ComposedTransition = rows.find((r) => r.transition)!.transition!;
    await controller.onOpenTtr(transition.openTtr, {
      key: transition.key,
      inputFingerprint: transition.inputFingerprint,
    });
    expect(controller.snapshot()).not.toBeNull();
    controller.dismiss();
    controller.dispose();
    const source = readFileSync(
      new URL("../../features/ttr/interactionController.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(
      /supabase|\/sync\/|fetch\(|MapKit|setFocus|setDate|setScroll|composeDayStream/,
    );
    expect(f.writes()).toBe(0);
  });
});

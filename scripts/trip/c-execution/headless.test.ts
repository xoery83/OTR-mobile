import { createHash } from "node:crypto";
import {
  encodeSharedLedgerCursor,
  serializeParticipationVector,
} from "../../../src/domain/trip/participationSnapshot";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import {
  CRequestBudget,
  assertExactUndispatchedCreateResume,
  assertAcceptedQaCurrencyResume,
  createAuthenticatedHeadlessRunner,
  openQaDatabase,
} from "./headless";
const A = "10000000-0000-4000-8000-000000000001",
  B = "10000000-0000-4000-8000-000000000002";
const window = () => ({
  startsAt: new Date(Date.now() - 5000).toISOString(),
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  actorIds: { A, B },
  mode: "ISOLATED_PROTOCOL_FIXTURE" as const,
});
test("budget pins window/actors, never refunds throws, immutable snapshots", () => {
  const w = window();
  const b = new CRequestBudget(w);
  w.expiresAt = "2099-01-01T00:00:00Z";
  w.actorIds.A = B;
  assert.notEqual(b.window.expiresAt, w.expiresAt);
  assert.equal(b.window.actorIds.A, A);
  assert.throws(() => {
    (b.counts as { mutations: number }).mutations = 0;
  });
  b.reserveMutation("create");
  assert.throws(() => b.reserveMutation("create"));
  assert.equal(b.counts.mutations, 1);
  for (let i = 0; i < 16; i++) b.reserve("reads");
  assert.throws(() => b.reserve("reads"));
});
test("dedicated SQLite rejects App path and restores real migrations on reopen", async () => {
  await assert.rejects(openQaDatabase("/tmp/user-app.sqlite"));
  assert.throws(
    () => assertExactUndispatchedCreateResume("/tmp/user-app.sqlite", A),
    /C_PRIVATE_QA_DATABASE_REQUIRED/,
  );
  const dir = mkdtempSync("/private/tmp/otr-c-qa-test-");
  try {
    const db = await openQaDatabase(dir + "/qa-state.sqlite");
    const count = db.sql.prepare("SELECT count(*) AS n FROM sqlite_master").get();
    assert.ok(Number(count!.n) > 10);
    db.close();
    const reopened = await openQaDatabase(dir + "/qa-state.sqlite");
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test("actual loopback password login + server getUser + ordinary selfprofile + adoptedAccount; rejects identity mismatch", async () => {
  const seen: string[] = [];
  let mismatch = false,
    profileAbsent = false,
    denyProfile = false;
  const server = createServer(async (req, res) => {
    seen.push(req.method + " " + req.url);
    let text = "";
    for await (const c of req) text += c;
    res.setHeader("Content-Type", "application/json");
    const email = text ? JSON.parse(text).email : undefined;
    const id = email?.includes("-b@") ? B : A;
    const user = {
      id,
      email: email ?? "otr-meta-qa-20261022-01-a@example.invalid",
      aud: "authenticated",
      role: "authenticated",
      created_at: new Date().toISOString(),
    };
    if (req.url === "/auth/v1/token?grant_type=password")
      res.end(
        JSON.stringify({
          access_token: "fixture-access-token-" + id,
          refresh_token: "fixture-only",
          token_type: "bearer",
          expires_in: 3600,
          user,
        }),
      );
    else if (req.url === "/auth/v1/user")
      res.end(JSON.stringify({ ...user, id: mismatch ? B : A }));
    else if (req.url?.startsWith("/rest/v1/profiles") && req.method === "GET")
      res.end(
        JSON.stringify(profileAbsent ? [] : [{ id: A, account_role: "free_user" }]),
      );
    else if (req.url === "/rest/v1/profiles" && req.method === "POST" && !denyProfile) {
      res.statusCode = 201;
      res.end("");
    } else {
      res.statusCode = 403;
      res.end(JSON.stringify({ message: "fixture rejected" }));
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const dir = mkdtempSync("/private/tmp/otr-c-qa-auth-");
  const input = {
    window: window(),
    databasePath: dir + "/qa-state.sqlite",
    publishableKey: "isolated-public-key",
    authOrigin: `http://127.0.0.1:${port}`,
    backendOrigin: `http://127.0.0.1:${port}`,
  };
  const runner = await createAuthenticatedHeadlessRunner(input);
  try {
    const receipt = await runner.login("A", "fixture-password", {
      id: A,
      email: "otr-meta-qa-20261022-01-a@example.invalid",
    });
    assert.equal(receipt.serverVerified, true);
    input.databasePath = "/tmp/user-app.sqlite";
    await runner.reopen();
    assert.equal(runner.budget.counts.signIns, 1);
    assert.equal(runner.budget.counts.identityReads, 1);
    assert.ok(seen.includes("GET /auth/v1/user"));
    assert.ok(seen.some((s) => s.includes("/rest/v1/profiles")));
    await assert.rejects(
      runner.login("A", "fixture-password", {
        id: A,
        email: "otr-meta-qa-20261022-01-a@example.invalid",
      }),
    );
    mismatch = true;
    const otherDir = mkdtempSync("/private/tmp/otr-c-qa-denied-");
    const deniedRunner = await createAuthenticatedHeadlessRunner({
      ...input,
      databasePath: otherDir + "/qa-state.sqlite",
    });
    try {
      await assert.rejects(
        deniedRunner.login("A", "fixture-password", {
          id: A,
          email: "otr-meta-qa-20261022-01-a@example.invalid",
        }),
        /C_SERVER_IDENTITY_MISMATCH/,
      );
    } finally {
      await deniedRunner.close();
      rmSync(otherDir, { recursive: true });
    }
    mismatch = false;
    profileAbsent = true;
    denyProfile = true;
    const profileDir = mkdtempSync("/private/tmp/otr-c-qa-profile-");
    const profileRunner = await createAuthenticatedHeadlessRunner({
      ...input,
      databasePath: profileDir + "/qa-state.sqlite",
    });
    try {
      await assert.rejects(
        profileRunner.login("A", "fixture-password", {
          id: A,
          email: "otr-meta-qa-20261022-01-a@example.invalid",
        }),
        /C_SELF_PROFILE_INITIALIZATION_FAILED/,
      );
      assert.equal(profileRunner.budget.counts.profileInitializations, 1);
      await assert.rejects(profileRunner.saveCreate());
    } finally {
      await profileRunner.close();
      rmSync(profileDir, { recursive: true });
    }
  } finally {
    await runner.close();
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(dir, { recursive: true });
  }
});

async function runProtocolFixture(currencyOnlyCase: boolean) {
  const { QA } = await import("./headless");
  const { default: p } = await import("./proposed-payloads.json");
  const owner = "10000000-0000-4000-8000-000000000003",
    epoch = "10000000-0000-4000-8000-000000000004";
  let delayCreate = false,
    releaseCreate: () => void = () => {},
    signalCreate: () => void = () => {},
    denyCreate = false;
  let createReceipt: unknown = null,
    metaReceipt: unknown = null,
    currency = "NZD",
    commits = 0;
  const seen: string[] = [];
  const server = createServer(async (req, res) => {
    let text = "";
    for await (const c of req) text += c;
    const body = text ? JSON.parse(text) : {};
    const id = req.headers.authorization?.endsWith(B) ? B : A;
    res.setHeader("Content-Type", "application/json");
    seen.push(req.method + " " + req.url);
    const send = (v: unknown) => res.end(JSON.stringify(v));
    const fail = (status: number, code: string) => {
      res.statusCode = status;
      send({ error: { code, message: code } });
    };
    if (req.url === "/auth/v1/token?grant_type=password") {
      const userId = body.email.includes("-b@") ? B : A;
      return send({
        access_token: "fixture-" + userId,
        refresh_token: "fixture",
        token_type: "bearer",
        expires_in: 3600,
        user: {
          id: userId,
          email: body.email,
          aud: "authenticated",
          role: "authenticated",
          created_at: new Date().toISOString(),
        },
      });
    }
    if (req.url === "/auth/v1/user")
      return send({
        id,
        email: `otr-meta-qa-20261022-01-${id === A ? "a" : "b"}@example.invalid`,
        aud: "authenticated",
        role: "authenticated",
        created_at: new Date().toISOString(),
      });
    if (req.url?.startsWith("/rest/v1/profiles"))
      return send([{ id, account_role: "free_user" }]);
    if (req.url === `/v2/trip-create-operations/${QA.createOperationId}`) {
      if (delayCreate) {
        signalCreate();
        await new Promise<void>((r) => {
          releaseCreate = r;
        });
      }
      if (denyCreate) return fail(401, "UNAUTHORIZED");
      return createReceipt
        ? send(createReceipt)
        : fail(404, "TRIP_CREATE_RECEIPT_NOT_FOUND");
    }
    if (req.url === "/v2/trips") {
      createReceipt = {
        ...p.create.body,
        actorAccountId: A,
        ownerPersonId: owner,
        coreEpoch: epoch,
        coreRevision: 1,
        coreAccessRevision: 1,
      };
      req.socket.destroy();
      return;
    }
    if (req.url === `/v2/trip-metadata-operations/${QA.metadataOperationId}`)
      return metaReceipt
        ? send(metaReceipt)
        : fail(404, "TRIP_METADATA_RECEIPT_NOT_FOUND");
    if (req.url === `/v2/trips/${QA.tripId}/metadata`) {
      if (id !== A) return fail(403, "TRIP_METADATA_FORBIDDEN");
      if (req.method === "GET")
        return send({
          formatVersion: 2,
          actorAccountId: A,
          tripId: QA.tripId,
          metadataRevision: 0,
          metadata: p.editProposal.body.before,
        });
      if (body.after.name === "FORBIDDEN-COLLISION")
        return fail(409, "TRIP_METADATA_COLLISION");
      metaReceipt = { ...body, actorAccountId: A, resultMetadataRevision: 1 };
      return send(metaReceipt);
    }
    if (req.url?.endsWith("/journey-currency/preview"))
      return send({
        currentCurrency: "NZD",
        currentScale: 2,
        proposedCurrency: "USD",
        proposedScale: 2,
        settingsRevision: 1,
        previewDigest: "a".repeat(64),
        affectedExpenses: 0,
        sameCurrencyCount: 0,
        referenceCandidateCount: 0,
        missingEconomicDateCount: 0,
        missingHistoricalQuoteCount: 0,
        manualAgreedCount: 0,
        actualPayerCostCount: 0,
        otherPolicyCount: 0,
        conflictCount: 0,
        expectedUnresolvedCount: 0,
        openSettlementCount: 0,
        finalizedSettlementCount: 0,
        totalsAvailable: true,
        requiresAbandonPreview: false,
      });
    if (req.url?.endsWith("/journey-currency/commit")) {
      currency = "USD";
      return send({
        changeId: epoch,
        settlementCurrency: "USD",
        settlementScale: 2,
        settingsRevision: 2,
        affectedExpenses: 0,
        unresolvedExpenses: 0,
        idempotentReplay: commits++ > 0,
      });
    }
    if (req.url?.endsWith("/ledger/bootstrap"))
      return send({
        journey: {
          id: QA.tripId,
          title: p.editProposal.body.after.name,
          startDate: "2026-11-01",
          endDate: "2026-11-03",
          settlementCurrency: currency,
          settlementScale: 2,
          valuationPolicy: "REFERENCE_RATE",
          updatedAt: new Date().toISOString(),
        },
        members: [],
        households: [],
        expenses: [],
        corrections: [],
        actor: {
          userId: A,
          memberId: owner,
          role: "owner",
          capabilities: {
            canCreateExpense: true,
            canEditOwnExpense: true,
            canRead: true,
            canCorrectAnyExpense: true,
            canSuggestCorrection: true,
            canResolveOwnExpenseConflict: true,
            canManageMembers: true,
            canManageHouseholds: true,
            canManageCurrency: true,
            canSettle: true,
          },
        },
        cursor: encodeSharedLedgerCursor(
          1,
          QA.tripId,
          A,
          createHash("sha256").update(serializeParticipationVector([])).digest("hex"),
        ),
        participationSnapshot: {
          contractVersion: 1,
          complete: true,
          personCount: 0,
          fingerprintVersion: 1,
          fingerprint: createHash("sha256")
            .update(serializeParticipationVector([]))
            .digest("hex"),
          observedAt: "2026-10-23T00:00:00.000000Z",
        },
        serverTime: new Date().toISOString(),
      });
    fail(404, "UNEXPECTED_FIXTURE_ROUTE");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port,
    dir = mkdtempSync("/private/tmp/otr-c-qa-flow-");
  let runner = await createAuthenticatedHeadlessRunner({
    window: window(),
    databasePath: dir + "/qa-state.sqlite",
    publishableKey: "isolated",
    authOrigin: `http://127.0.0.1:${port}`,
    backendOrigin: `http://127.0.0.1:${port}`,
  });
  try {
    for (const label of ["A", "B"] as const)
      await runner.login(label, "fixture", {
        id: label === "A" ? A : B,
        email: `otr-meta-qa-20261022-01-${label.toLowerCase()}@example.invalid`,
      });
    await runner.select("A");
    runner.setOnline(false);
    await runner.saveCreate();
    assert.doesNotThrow(() =>
      assertExactUndispatchedCreateResume(dir + "/qa-state.sqlite", A),
    );
    assert.throws(() => assertExactUndispatchedCreateResume(dir + "/qa-state.sqlite", B));
    const resumeDb = await openQaDatabase(dir + "/qa-state.sqlite");
    resumeDb.sql.exec("UPDATE sync_operations SET attempt_count=1");
    assert.throws(() => assertExactUndispatchedCreateResume(dir + "/qa-state.sqlite", A));
    assert.throws(() =>
      assertExactUndispatchedCreateResume(dir + "/qa-state.sqlite", A, true),
    );
    resumeDb.sql.exec(
      "UPDATE sync_operations SET attempt_count=2,status='RETRYABLE',last_error_code='TRIP_CREATE_UNAVAILABLE'",
    );
    assert.doesNotThrow(() =>
      assertExactUndispatchedCreateResume(dir + "/qa-state.sqlite", A, true),
    );
    assert.throws(() => assertExactUndispatchedCreateResume(dir + "/qa-state.sqlite", A));
    resumeDb.sql.exec("UPDATE sync_operations SET last_error_code='UNKNOWN_OUTCOME'");
    assert.throws(() =>
      assertExactUndispatchedCreateResume(dir + "/qa-state.sqlite", A, true),
    );
    resumeDb.sql.exec(
      "UPDATE sync_operations SET attempt_count=0,status='PENDING',last_error_code=NULL",
    );
    resumeDb.close();
    await runner.dispatchCreate();
    assert.equal(seen.filter((s) => s.startsWith("POST /v2/")).length, 0);
    await runner.reopen();
    runner.setOnline(true);
    await runner.dispatchCreate();
    await runner.recoverQueuedReceipt("create");
    assert.equal(runner.queueState()[0].status, "COMPLETED");
    assert.equal(runner.localState().ledger?.settlement_currency, "NZD");
    await runner.saveEdit();
    runner.setOnline(false);
    await runner.dispatchEdit();
    await runner.reopen();
    await runner.select("B");
    const count = seen.length;
    await runner.dispatchEdit();
    assert.equal(seen.length, count);
    await runner.select("A");
    runner.setOnline(true);
    await runner.dispatchEdit();
    assert.ok(runner.queueState().every((r) => r.status === "COMPLETED"));
    if (currencyOnlyCase) {
      assert.doesNotThrow(() =>
        assertAcceptedQaCurrencyResume(dir + "/qa-state.sqlite", A),
      );
      assert.throws(() => assertAcceptedQaCurrencyResume(dir + "/qa-state.sqlite", B));
      await runner.close();
      runner = await createAuthenticatedHeadlessRunner({
        window: window(),
        databasePath: dir + "/qa-state.sqlite",
        publishableKey: "isolated",
        authOrigin: `http://127.0.0.1:${port}`,
        backendOrigin: `http://127.0.0.1:${port}`,
        previousReadCharges: 15,
        currencyOnlyContinuation: "APPROVED_CURRENCY_ONLY_20",
      });
      const before = seen.length;
      await runner.login("A", "fixture", {
        id: A,
        email: "otr-meta-qa-20261022-01-a@example.invalid",
      });
      await runner.select("A");
      await assert.rejects(
        runner.login("B", "fixture", {
          id: B,
          email: "otr-meta-qa-20261022-01-b@example.invalid",
        }),
        /C_CURRENCY_ONLY_ACTOR_A/,
      );
      // Management readback is independently tested elsewhere; count its two
      // actual CLI dispatch boundaries explicitly in this loopback-only fixture.
      runner.budget.reserve("reads");
      await runner.previewCurrency();
      await runner.commitCurrency();
      const replay = await runner.commitCurrency();
      assert.equal(replay.idempotentReplay, true);
      runner.budget.reserve("reads");
      await runner.reopen();
      assert.equal(runner.localState().ledger?.settlement_currency, "USD");
      assert.equal(runner.budget.counts.reads, 20);
      assert.equal(runner.budget.counts.mutations, 5);
      assert.throws(() => runner.budget.reserve("reads"));
      const atCap = seen.length;
      await assert.rejects(
        runner.originalCreateReceipt(),
        (error: { kind?: string }) => error.kind === "network",
      );
      assert.equal(seen.length, atCap);
      assert.ok(
        seen
          .slice(before)
          .every((row) => !row.includes("metadata") && !row.includes("trip-create")),
      );
      // A fresh real normal Auth session consumes the actual independent-read
      // profile proof; certified bootstrap still uses the existing repository.
      await runner.close();
      const recoveryWindow = window();
      const recoveryBudget = new CRequestBudget(
        recoveryWindow,
        Date.now,
        18,
        "APPROVED_CURRENCY_RECEIPT_RECOVERY_20",
      );
      recoveryBudget.reserve("reads");
      const profileReadsBefore = seen.filter((row) => row.includes("profiles")).length;
      runner = await createAuthenticatedHeadlessRunner({
        window: recoveryWindow,
        databasePath: dir + "/qa-state.sqlite",
        publishableKey: "isolated",
        authOrigin: `http://127.0.0.1:${port}`,
        backendOrigin: `http://127.0.0.1:${port}`,
        currencyOnlyContinuation: "APPROVED_CURRENCY_RECEIPT_RECOVERY_20",
        recovery: {
          budget: recoveryBudget,
          profile: { id: A, account_role: "free_user" },
          preview: {
            currentCurrency: "NZD",
            currentScale: 2,
            proposedCurrency: "USD",
            proposedScale: 2,
            settingsRevision: 1,
            previewDigest: "a".repeat(64),
            affectedExpenses: 0,
            sameCurrencyCount: 0,
            referenceCandidateCount: 0,
            missingEconomicDateCount: 0,
            missingHistoricalQuoteCount: 0,
            manualAgreedCount: 0,
            actualPayerCostCount: 0,
            otherPolicyCount: 0,
            conflictCount: 0,
            expectedUnresolvedCount: 0,
            openSettlementCount: 0,
            finalizedSettlementCount: 0,
            totalsAvailable: true,
            requiresAbandonPreview: false,
          },
        },
      });
      await runner.login("A", "fixture", {
        id: A,
        email: "otr-meta-qa-20261022-01-a@example.invalid",
      });
      assert.equal(
        seen.filter((row) => row.includes("profiles")).length,
        profileReadsBefore,
      );
      assert.equal((await runner.commitCurrency()).idempotentReplay, true);
      await runner.reopen();
      assert.equal(runner.localState().ledger?.settlement_currency, "USD");
      assert.equal(runner.budget.counts.reads, 20);
      assert.equal(runner.budget.counts.mutations, 5);
      return;
    }
    await runner.replayEdit();
    await assert.rejects(
      runner.collisionEdit(),
      (e: { status?: number }) => e.status === 409,
    );
    await runner.select("B");
    await assert.rejects(
      runner.replayEdit(),
      (e: { status?: number }) => e.status === 403,
    );
    await runner.select("A");
    assert.deepEqual(await runner.originalCreateReceipt(), createReceipt);
    await runner.previewCurrency();
    const c = await runner.commitCurrency();
    const replay = await runner.commitCurrency();
    assert.equal(c.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    await runner.reopen();
    assert.equal(runner.localState().ledger?.settlement_currency, "USD");
    assert.equal(runner.budget.counts.mutations, 8);
    delayCreate = true;
    const reached = new Promise<void>((r) => {
      signalCreate = r;
    });
    const pending = runner.originalCreateReceipt();
    await reached;
    await runner.select("B");
    await runner.select("A");
    releaseCreate();
    await assert.rejects(pending, /Account changed/);
    delayCreate = false;
    denyCreate = true;
    const beforeSigns = runner.budget.counts.signIns;
    await assert.rejects(runner.originalCreateReceipt());
    assert.equal(runner.budget.counts.signIns, beforeSigns);
  } finally {
    await runner.close();
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(dir, { recursive: true });
  }
}
test("real HTTP + existing SQLite/targeted workers and owning Currency commands", () =>
  runProtocolFixture(false));
test("Currency-only resumed protocol carries15/2, denies old routes and reaches exact cap20", () =>
  runProtocolFixture(true));

test("canonical readback refuses missing counts instead of assuming zero", async () => {
  const { canonicalReadbackSchema } = await import("./readback");
  assert.equal(
    canonicalReadbackSchema.safeParse({
      trip: null,
      owners: [],
      ledger: null,
      expenses: 0,
      payments: 0,
      settlements: 0,
      personalPayments: 0,
    }).success,
    true,
  );
  assert.equal(
    canonicalReadbackSchema.safeParse({ trip: null, owners: [], ledger: null }).success,
    false,
  );
  assert.equal(
    canonicalReadbackSchema.safeParse({
      trip: null,
      owners: [],
      ledger: null,
      expenses: null,
      payments: 0,
      settlements: 0,
      personalPayments: 0,
    }).success,
    false,
  );
});

test("Auth provisioning refuses malformed window/hash before any outbound attempt", async () => {
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync } = await import("node:fs");
  const dir = mkdtempSync("/private/tmp/otr-c-qa-provision-");
  try {
    const path = dir + "/gate.json";
    writeFileSync(
      path,
      JSON.stringify({
        ownerAuthorized: true,
        project: "tuqigdxrvrerfewsxqgm",
        startsAt: "bad",
        expiresAt: "bad",
        manifestSHA256: "not-valid",
      }),
    );
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/trip/c-execution/provision.ts", "--execute", path],
      { input: "{}", encoding: "utf8", timeout: 5000 },
    );
    assert.equal(result.status, 2);
    const value = JSON.parse(result.stderr.trim());
    assert.equal(value.attempts, 0);
    assert.deepEqual(value.receipts, {});
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("prior read charges carry across a resumed finite window without refund", () => {
  const b = new CRequestBudget(window(), () => Date.now(), 3);
  assert.equal(b.counts.reads, 3);
  for (let n = 0; n < 13; n++) b.reserve("reads");
  assert.equal(b.counts.reads, 16);
  assert.throws(() => b.reserve("reads"));
  for (const bad of [-1, 17, 1.5])
    assert.throws(() => new CRequestBudget(window(), () => Date.now(), bad));
});

test("explicit currency continuation alone permits cap20 and preserves prior mutations", () => {
  const b = new CRequestBudget(
    window(),
    () => Date.now(),
    15,
    "APPROVED_CURRENCY_ONLY_20",
  );
  assert.equal(b.counts.mutations, 2);
  assert.equal(b.counts.create, 1);
  assert.equal(b.counts.metadata, 1);
  for (let i = 0; i < 5; i++) b.reserve("reads");
  assert.equal(b.counts.reads, 20);
  assert.throws(() => b.reserve("reads"));
  assert.throws(() => b.reserveMutation("create"));
  assert.throws(() => b.reserveMutation("metadata"));
  b.reserveMutation("preview");
  b.reserveMutation("commit");
  b.reserveMutation("commit");
  assert.equal(b.counts.mutations, 5);
  assert.throws(() => b.reserveMutation("commit"));
  assert.throws(
    () => new CRequestBudget(window(), () => Date.now(), 14, "APPROVED_CURRENCY_ONLY_20"),
  );
});

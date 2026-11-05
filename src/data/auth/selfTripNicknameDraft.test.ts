import type { SelfNicknameReceipt } from "@/domain/trip/tripPersonSelfNickname";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { captureAccountRequestContext } from "./accountRequestContext";
import { advanceAccountGeneration } from "./accountGeneration";
import { createSelfTripNicknameDraft } from "./selfTripNicknameDraft";
async function fixture() {
  let id = randomUUID();
  const first = id;
  const account = async () => id,
    tripId = randomUUID(),
    personId = randomUUID();
  const scope = await captureAccountRequestContext(tripId, account);
  const context = {
    contractVersion: 1,
    accountId: id,
    tripId,
    personId,
    nickname: "Before",
    nicknameRevision: 7,
    observedAt: "2026-11-05T00:00:00Z",
  };
  const draft = await createSelfTripNicknameDraft(account, scope, personId, context);
  return {
    draft,
    context,
    account,
    scope,
    personId,
    first,
    switch(value = randomUUID()) {
      id = value;
      advanceAccountGeneration();
    },
  };
}
it("keeps omission out of command preparation and preserves explicit Clear without global-name fallback", async () => {
  const f = await fixture();
  await f.draft.edit({});
  expect(await f.draft.prepare("not-an-operation-needed-for-KEEP")).toEqual({
    kind: "KEEP",
  });
  await f.draft.edit({ nickname: null });
  const op = randomUUID(),
    planned = await f.draft.prepare(op);
  expect(planned).toEqual({
    kind: "COMMAND",
    original: {
      contractVersion: 1,
      command: "SET_SELF_TRIP_NICKNAME",
      operationId: op,
      tripId: f.context.tripId,
      personId: f.personId,
      expectedNicknameRevision: 7,
      nickname: null,
      intentDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    },
  });
  expect(await f.draft.recoveryInput()).toBe((planned as any).original);
});
it("copies local edits and freezes original identity/revision across newer draft edits", async () => {
  const f = await fixture(),
    patch = { nickname: "林 e\u0301" };
  const editing = f.draft.edit(patch);
  patch.nickname = "Changed";
  await editing;
  const planned = await f.draft.prepare(randomUUID());
  if (planned.kind === "KEEP") throw Error("fixture");
  expect(planned.original.nickname).toBe("林 e\u0301");
  await f.draft.edit({ nickname: "Later local edit" });
  expect((await f.draft.recoveryInput()).nickname).toBe("林 e\u0301");
  await expect(f.draft.prepare(randomUUID())).rejects.toThrow("ORIGINAL_RETAINED");
  expect((await f.draft.read()).base.nicknameRevision).toBe(7);
});
it.each(["", "   ", " padded"])(
  "does not treat invalid draft %j as Clear",
  async (nickname) => {
    const f = await fixture();
    await f.draft.edit({ nickname });
    await expect(f.draft.prepare(randomUUID())).rejects.toThrow();
    await expect(f.draft.recoveryInput()).rejects.toThrow("ORIGINAL_REQUIRED");
  },
);
it("requires actual loaded identity/revision and rejects caller authority fields", async () => {
  const f = await fixture();
  await expect(
    createSelfTripNicknameDraft(f.account, f.scope, f.personId, undefined),
  ).rejects.toThrow();
  for (const change of [
    { accountId: randomUUID() },
    { tripId: randomUUID() },
    { personId: randomUUID() },
    { nicknameRevision: undefined },
  ])
    await expect(
      createSelfTripNicknameDraft(f.account, f.scope, f.personId, {
        ...f.context,
        ...change,
      }),
    ).rejects.toThrow();
  await expect(
    f.draft.edit({ nickname: "Name", accountId: randomUUID() }),
  ).rejects.toThrow();
});
it("rejects old Account and A→B→A generations without exposing or writing B draft", async () => {
  const f = await fixture();
  await f.draft.edit({ nickname: "Private A" });
  await f.draft.prepare(randomUUID());
  f.switch();
  await expect(f.draft.read()).rejects.toThrow("Account changed");
  await expect(f.draft.edit({ nickname: "Wrong B" })).rejects.toThrow("Account changed");
  await expect(f.draft.recoveryInput()).rejects.toThrow("Account changed");
  f.switch(f.first);
  await expect(f.draft.read()).rejects.toThrow("Account changed");
});
async function prepared() {
  const f = await fixture();
  await f.draft.edit({ nickname: "After" });
  const p = await f.draft.prepare(randomUUID());
  if (p.kind === "KEEP") throw Error("fixture");
  const receipt: SelfNicknameReceipt = {
    receiptVersion: 1,
    receiptId: randomUUID(),
    acceptedAt: "2026-11-05T00:00:00Z",
    actorAccountId: f.first,
    tripId: f.context.tripId,
    personId: f.personId,
    operationId: p.original.operationId,
    intentDigest: p.original.intentDigest,
    expectedNicknameRevision: 7,
    desiredNickname: "After",
    outcome: "APPLIED",
    prior: { nickname: "Before", nicknameRevision: 7 },
    resulting: { nickname: "After", nicknameRevision: 8 },
  };
  return { ...f, receipt };
}
it("checks applied/unchanged/conflict semantics without applying historical receipts to current draft", async () => {
  const f = await prepared();
  await f.draft.edit({ nickname: "Unsaved newer draft" });
  await f.draft.checkReceipt(f.receipt);
  const conflict = {
    ...f.receipt,
    outcome: "REVISION_CONFLICT" as const,
    prior: { nickname: "Someone changed it", nicknameRevision: 9 },
    resulting: { nickname: "Someone changed it", nicknameRevision: 9 },
  };
  await f.draft.checkReceipt(conflict);
  const unchanged = {
    ...f.receipt,
    outcome: "UNCHANGED" as const,
    prior: { nickname: "After", nicknameRevision: 7 },
    resulting: { nickname: "After", nicknameRevision: 7 },
  };
  await f.draft.checkReceipt(unchanged);
  expect((await f.draft.read()).patch.nickname).toBe("Unsaved newer draft");
  expect((await f.draft.read()).base.nickname).toBe("Before");
});
it.each([
  "actorAccountId",
  "tripId",
  "personId",
  "operationId",
  "intentDigest",
  "expectedNicknameRevision",
  "desiredNickname",
  "resulting",
])("rejects a receipt with wrong %s binding", async (key) => {
  const f = await prepared();
  const altered = {
    ...f.receipt,
    [key]:
      key === "expectedNicknameRevision"
        ? 0
        : key === "resulting"
          ? { nickname: "After", nicknameRevision: 7 }
          : randomUUID(),
  };
  await expect(f.draft.checkReceipt(altered as any)).rejects.toThrow();
});
it("rejects a late old-account receipt and never infers revision0 after access loss", async () => {
  const f = await prepared();
  f.switch();
  await expect(f.draft.checkReceipt(f.receipt)).rejects.toThrow("Account changed");
});

it("freezes the Save input before an asynchronous account check while later typing stays local", async () => {
  const id = randomUUID(), tripId = randomUUID(), personId = randomUUID();
  let release!: () => void;
  let wait = false;
  const account = async () => { if (wait) await new Promise<void>((resolve) => { release = resolve; }); return id; };
  const scope = await captureAccountRequestContext(tripId, account);
  const draft = await createSelfTripNicknameDraft(account, scope, personId, {
    contractVersion: 1, accountId: id, tripId, personId, nickname: null,
    nicknameRevision: 7, observedAt: "2026-11-05T00:00:00Z",
  });
  await draft.edit({ nickname: "Pressed Save" }); wait = true;
  const saving = draft.prepare(randomUUID()); wait = false;
  await draft.edit({ nickname: "Later typing" }); release();
  const prepared = await saving;
  expect(prepared.kind === "COMMAND" && prepared.original.nickname).toBe("Pressed Save");
  expect((await draft.read()).patch.nickname).toBe("Later typing");
});

import { createHash, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { fixture, seal } from "./guestAdoptionCompositePlan.fixture";
import { prepareGuestAdoptionCompositePlan } from "./guestAdoptionCompositePlan";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
afterEach(() => vi.useRealTimers());
function staged(grant: unknown, checkpoint: { sha256: string }) {
  return { grant, preparationSha256: checkpoint.sha256 };
}
async function plan(
  user: Parameters<typeof prepareGuestAdoptionCompositePlan>[0],
  grant: unknown,
  checkpoint: { canonicalText: string; sha256: string; bytes: number },
) {
  return prepareGuestAdoptionCompositePlan(user, staged(grant, checkpoint), checkpoint);
}

it("seals exact source identities/names/Ledger without producing execution authority", async () => {
  const f = fixture(),
    input = await f.source();
  const result = await plan(f.user, f.grant, input);
  const parsed = JSON.parse(result.canonicalText);
  expect(parsed.authority).toBe("NONE");
  expect(parsed.preparation).toEqual(input);
  expect(
    JSON.parse(JSON.parse(parsed.preparation.canonicalText).source.canonicalText)
      .trips[0],
  ).toMatchObject({
    ledgerInitialization: { settlementCurrency: "JPY", settlementScale: 0 },
    creator: { personId: f.person, displayName: "旅人 Å" },
    queueOperationIds: f.body.trips[0].queueOperationIds,
  });
  expect(result.sha256).toBe(hash(result.canonicalText));
  expect(Object.isFrozen(result)).toBe(true);
  expect(await plan(f.user, f.grant, input)).toEqual(result);
});
it.each(["ANONYMOUS", "UNKNOWN", undefined] as const)(
  "refuses %s target classification",
  async (accountClass) => {
    const f = fixture();
    await expect(
      plan({ id: f.user.id, accountClass }, f.grant, await f.source()),
    ).rejects.toThrow("NORMAL_ACCOUNT_REQUIRED");
  },
);
it.each(["files", "fileBytes", "liveDrafts"] as const)(
  "refuses the whole dataset with %s instead of dropping it",
  async (kind) => {
    const f = fixture();
    f.grant.resources[kind] = 1;
    await expect(plan(f.user, f.grant, await f.source())).rejects.toThrow(
      "UNSUPPORTED_DATASET",
    );
  },
);
it.each(["trips", "people", "items"] as const)(
  "refuses preflight/source %s mismatch",
  async (kind) => {
    const f = fixture();
    f.grant.resources[kind]++;
    await expect(plan(f.user, f.grant, await f.source())).rejects.toThrow(
      "RESOURCE_MISMATCH",
    );
  },
);
it("refuses another target Account", async () => {
  const f = fixture();
  f.grant.targetAccountId = randomUUID();
  await expect(plan(f.user, f.grant, await f.source())).rejects.toThrow(
    "BINDING_MISMATCH",
  );
});
it("refuses another Guest and omitted or duplicated Trip", async () => {
  const f = fixture(),
    input = await f.source();
  await expect(
    plan(f.user, { ...f.grant, sourceGuestLocalId: randomUUID() }, input),
  ).rejects.toThrow();
  const prepared = JSON.parse(input.canonicalText);
  for (const tripIds of [[], [...prepared.tripIds, ...prepared.tripIds]])
    await expect(plan(f.user, f.grant, seal({ ...prepared, tripIds }))).rejects.toThrow();
});
it.each(["participation", "acl"] as const)(
  "refuses foreign %s Person even when source hashes are internally valid",
  async (kind) => {
    const f = fixture();
    f.body.trips[0].coreIntents[0].command.payload[kind].people = [randomUUID()];
    if (kind === "participation") {
      Object.assign(f.body.trips[0].coreIntents[0].command.payload.participation, {
        mode: "SELECTED_MEMBERS",
        selfPersonId: null,
      });
    }
    await expect(plan(f.user, f.grant, await f.source())).rejects.toThrow(
      "PERSON_REFERENCE_MISMATCH",
    );
  },
);
it("refuses tampered canonical source bytes", async () => {
  const f = fixture(),
    input = await f.source();
  input.canonicalText = input.canonicalText.replace("Guest walk", "different!");
  await expect(plan(f.user, f.grant, input)).rejects.toThrow();
});
it("pins target/grant/source before async work and rechecks server expiry afterwards", async () => {
  vi.useFakeTimers();
  const f = fixture(),
    input = await f.source(),
    target = f.user.id;
  const pending = plan(f.user, f.grant, input);
  f.user.id = randomUUID();
  f.grant.targetAccountId = randomUUID();
  input.canonicalText = "changed";
  expect(JSON.parse((await pending).canonicalText).grant.targetAccountId).toBe(target);
  const next = fixture(),
    nextInput = await next.source();
  const expired = plan(next.user, next.grant, nextInput);
  vi.setSystemTime(Date.now() + 60001);
  await expect(expired).rejects.toThrow("GRANT_EXPIRED");
});

it.each(["adoptionId", "targetAccountId", "sourceGuestLocalId", "inventorySha256"])(
  "pins checkpoint %s to the persisted grant, not just counts",
  async (field) => {
    const f = fixture(),
      checkpoint = await f.source();
    const prepared = JSON.parse(checkpoint.canonicalText);
    prepared[field] = field === "inventorySha256" ? "c".repeat(64) : randomUUID();
    await expect(plan(f.user, f.grant, seal(prepared))).rejects.toThrow(
      "BINDING_MISMATCH",
    );
  },
);
it("rejects a different same-count source revision against the original staged preparation hash", async () => {
  const f = fixture(),
    original = await f.source(),
    owningRow = staged(f.grant, original);
  f.body.trips[0].coreIntents[0].command.payload.core.title =
    "Changed same-count revision";
  const changed = await f.source();
  expect(changed.sha256).not.toBe(original.sha256);
  await expect(
    prepareGuestAdoptionCompositePlan(f.user, owningRow, changed),
  ).rejects.toThrow("STAGING_SOURCE_MISMATCH");
});
it("rejects checkpoint live drafts even if a stale grant says zero", async () => {
  const f = fixture(),
    checkpoint = await f.source();
  const prepared = JSON.parse(checkpoint.canonicalText);
  prepared.drafts = [
    {
      id: randomUUID(),
      canonicalText: "must survive",
      sha256: "a".repeat(64),
      bytes: 12,
    },
  ];
  await expect(plan(f.user, f.grant, seal(prepared))).rejects.toThrow();
});
it.each(["sha256", "bytes"] as const)(
  "revalidates actual checkpoint %s instead of trusting the supplied value",
  async (field) => {
    const f = fixture(),
      checkpoint = await f.source();
    if (field === "sha256") checkpoint.sha256 = "c".repeat(64);
    else checkpoint.bytes++;
    await expect(plan(f.user, f.grant, checkpoint)).rejects.toThrow(
      "PREPARATION_INVALID",
    );
  },
);

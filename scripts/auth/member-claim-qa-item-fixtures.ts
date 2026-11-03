import { createHash } from "node:crypto";
import { z } from "zod";
import qa from "../../docs/ops/auth-c04-item-fixture-20261104/CASE.json";
import { createCoreV2Transport } from "../../src/data/api/tripCoreV2Transport";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import {
  coreCapabilitiesSchema,
  validateCoreCommand,
} from "../../src/domain/trip/tripCoreV2Commands";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
import {
  coreHashValue,
  corePersonBindingSchema,
  type CoreReadRecord,
} from "../../src/domain/trip/tripCoreV2Read";
import type { CoreReceiptProjection } from "../../src/domain/trip/tripCoreV2Receipt";
import type { RegisteredQaHostContext } from "./registered-qa-host-session";
import { checkMemberRead } from "./member-claim-qa-member-read";

const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
type Transport = ReturnType<typeof createCoreV2Transport>;
type Context = Awaited<ReturnType<typeof captureAccountRequestContext>>;
function freeze(value: unknown) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}
freeze(qa);
export const fixtureCommands = qa.items.map((item) =>
  validateCoreCommand({
    contractVersion: 2,
    intentVersion: 2,
    operationId: item.operationId,
    tripId: qa.tripId,
    command: "CREATE_ITEM",
    target: { kind: "ITEM", id: item.itemId },
    baseVector: [{ kind: "ITEM", id: item.itemId, revision: null }],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    payload: {
      family: "P1",
      core: { title: item.title },
      schedule: { start: coreDateBoundary(qa.qaDate) },
      participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
      acl: { visibility: item.visibility, people: [] },
    },
  }),
);
freeze(fixtureCommands);

function requireBinding(records: CoreReadRecord[], accountId: string, personId: string) {
  const own = records
    .filter((r) => r.kind === "PERSON_BINDING")
    .map((r) => corePersonBindingSchema.parse(r.body))
    .filter((r) => r.active && r.account_id === accountId);
  if (own.length !== 1 || own[0].person_id !== personId)
    throw Error("C04_FIXTURE_BINDING_MISMATCH");
}
export function checkFixtureIsolation(owner: CoreReadRecord[], member: CoreReadRecord[]) {
  requireBinding(owner, qa.ownerAccountId, qa.ownerPersonId);
  const result = checkMemberRead(owner, member);
  for (const item of qa.items) {
    const a = owner.filter((r) => r.kind === "ITEM" && r.id === item.itemId);
    if (
      a.length !== 1 ||
      (a[0].body as { visibility?: string }).visibility !== item.visibility ||
      (a[0].body as { owner_account_id?: string }).owner_account_id !== qa.ownerAccountId
    )
      throw Error("C04_FIXTURE_OWNER_READ_MISMATCH");
    const b = member.filter((r) => r.kind === "ITEM" && r.id === item.itemId);
    if (b.length !== (item.visibility === "GROUP" ? 1 : 0))
      throw Error("C04_FIXTURE_VISIBILITY_MISMATCH");
  }
  return { ...result, sharedItemRead: "PASS", exactPrivateItemAbsent: "PASS" };
}

// Journal must durably reserve each original command before its only POST. UNKNOWN only reads that operation.
export async function createOwnerItemFixtures(input: {
  transport: Pick<Transport, "capabilities" | "collection" | "receipt" | "submit">;
  context: Context;
  reserve(command: (typeof fixtureCommands)[number], intentSha256: string): Promise<void>;
  note(value: Record<string, unknown>): void;
}) {
  const { transport: t, context: ctx } = input;
  if (ctx.accountId !== qa.ownerAccountId || ctx.tripId !== qa.tripId)
    throw Error("C04_FIXTURE_SCOPE_MISMATCH");
  const caps = coreCapabilitiesSchema.parse(await t.capabilities(ctx));
  if (
    caps.activationState !== "ENABLED" ||
    !caps.enabledCommands.includes("CREATE_ITEM") ||
    !caps.enabledFamilies.includes("P1") ||
    !caps.enabledAdmissionModes.includes("MANUAL")
  )
    throw Error("C04_FIXTURE_NORMAL_CREATE_NOT_AVAILABLE");
  const before = (await t.collection(ctx)).pages.flatMap((p) => p.records);
  requireBinding(before, qa.ownerAccountId, qa.ownerPersonId);
  if (before.some((r) => qa.items.some((i) => i.itemId === r.id)))
    throw Error("C04_FIXTURE_ALREADY_EXISTS");
  for (const command of fixtureCommands) {
    if (await t.receipt(ctx, command.operationId))
      throw Error("C04_FIXTURE_OPERATION_ALREADY_EXISTS");
    const intentSha256 = await coreHashValue("otr-trip-core-intent-v2", command, hash);
    await input.reserve(structuredClone(command), intentSha256);
    let response: CoreReceiptProjection | null;
    try {
      response = await t.submit(ctx, command);
    } catch {
      input.note({ phase: "SUBMIT_UNKNOWN", operationId: command.operationId });
      response = await t.receipt(ctx, command.operationId);
    }
    if (!response || response.projection !== "FULL")
      throw Error("C04_FIXTURE_UNKNOWN_OR_REDACTED");
    const r = response.receipt;
    if (
      r.actorAccountId !== ctx.accountId ||
      r.tripId !== ctx.tripId ||
      r.operationId !== command.operationId ||
      r.command !== "CREATE_ITEM" ||
      r.intentSha256 !== intentSha256 ||
      r.outcome !== "APPLIED" ||
      r.result.created.filter((v) => v.kind === "ITEM" && v.id === command.target.id)
        .length !== 1
    )
      throw Error("C04_FIXTURE_RECEIPT_MISMATCH");
    input.note({
      phase: "FIXTURE_APPLIED",
      operationId: r.operationId,
      itemId: command.target.id,
      intentSha256,
      receiptSha256: r.receiptSha256,
      domainReceiptId: response.domainReceiptId,
    });
  }
  return (await t.collection(ctx)).pages.flatMap((p) => p.records);
}

export function fixtureTransport(
  context: RegisteredQaHostContext,
  note: (value: Record<string, unknown>) => void,
) {
  if (
    context.tripId !== qa.tripId ||
    ![qa.ownerAccountId, qa.memberAccountId].includes(context.accountId)
  )
    throw Error("C04_FIXTURE_SESSION_SCOPE_MISMATCH");
  const account = async () => context.accountId;
  const submitted = new Set<string>();
  return createCoreV2Transport(
    account,
    hash,
    {
      baseUrl: "https://api-dev.xoery.art",
      timeoutMs: 90_000,
      fetchImplementation: async (url, init) => {
        const base = `https://api-dev.xoery.art/v2/trips/${qa.tripId}/core`;
        const method = init?.method;
        if (
          !(
            method === "GET" &&
            [
              base + "/collection",
              base + "/capabilities",
              ...qa.items.map((i) => base + "/operations/" + i.operationId),
            ].includes(String(url))
          ) &&
          !(
            method === "POST" &&
            context.accountId === qa.ownerAccountId &&
            String(url) === base + "/commands"
          )
        )
          throw Error("C04_FIXTURE_ROUTE_DENIED");
        if (
          method === "POST" &&
          !fixtureCommands.some((command) => init?.body === JSON.stringify(command))
        )
          throw Error("C04_FIXTURE_COMMAND_DENIED");
        if (method === "POST") {
          const body = String(init?.body);
          if (submitted.has(body)) throw Error("C04_FIXTURE_POST_ALREADY_ATTEMPTED");
          submitted.add(body);
        }
        const started = Date.now(),
          response = await fetch(url, init);
        note({
          phase: "CORE_RESPONSE",
          method,
          status: response.status,
          requestId: response.headers.get("x-request-id"),
          durationMs: Date.now() - started,
        });
        return response;
      },
    },
    async () => {
      const session = await context.readSession();
      if (session.identity?.userId !== context.accountId || !session.accessToken)
        throw Error("C04_FIXTURE_TOKEN_SCOPE_MISMATCH");
      return { userId: context.accountId, token: session.accessToken };
    },
  );
}

export async function runItemFixtureProbe(input: {
  withOwnerSession(
    work: (context: RegisteredQaHostContext) => Promise<void>,
  ): Promise<unknown>;
  withMemberSession(
    work: (context: RegisteredQaHostContext) => Promise<void>,
  ): Promise<unknown>;
  reserve: Parameters<typeof createOwnerItemFixtures>[0]["reserve"];
  note(value: Record<string, unknown>): void;
}) {
  let owner: CoreReadRecord[] | undefined, member: CoreReadRecord[] | undefined;
  const checkCleanup = (value: unknown, accountId: string) =>
    z
      .object({
        status: z.literal("PASS"),
        accountId: z.literal(accountId),
        tripId: z.literal(qa.tripId),
        ownSessionCleanup: z.literal("PASS_LOCAL_SCOPE_REFRESH_REVOKED"),
      })
      .parse(value);
  checkCleanup(
    await input.withOwnerSession(async (context) => {
      if (context.accountId !== qa.ownerAccountId)
        throw Error("C04_FIXTURE_OWNER_SESSION_MISMATCH");
      owner = await createOwnerItemFixtures({
        transport: fixtureTransport(context, input.note),
        context: await captureAccountRequestContext(
          qa.tripId,
          async () => context.accountId,
        ),
        reserve: input.reserve,
        note: input.note,
      });
    }),
    qa.ownerAccountId,
  );
  checkCleanup(
    await input.withMemberSession(async (context) => {
      if (context.accountId !== qa.memberAccountId)
        throw Error("C04_FIXTURE_MEMBER_SESSION_MISMATCH");
      member = (
        await fixtureTransport(context, input.note).collection(
          await captureAccountRequestContext(qa.tripId, async () => context.accountId),
        )
      ).pages.flatMap((p) => p.records);
    }),
    qa.memberAccountId,
  );
  if (!owner || !member) throw Error("C04_FIXTURE_READ_INCOMPLETE");
  return checkFixtureIsolation(owner, member);
}

import { createHash } from "node:crypto";
import { z } from "zod";
import qa from "../../docs/ops/auth-c04-item-fixture-20261104/CASE.json";
import distinct from "../../docs/ops/auth-c04-distinct-p1-next-day-20261104/CASE.json";
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
freeze(distinct);
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

// Closed next-day preparation case; never a replacement for the old UNKNOWN.
export const distinctSharedP1Command = validateCoreCommand({
  contractVersion: 2,
  intentVersion: 2,
  operationId: distinct.operationId,
  tripId: distinct.tripId,
  command: "CREATE_ITEM",
  target: { kind: "ITEM", id: distinct.itemId },
  baseVector: [{ kind: "ITEM", id: distinct.itemId, revision: null }],
  admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
  payload: {
    family: "P1",
    core: { title: distinct.intent.title, description: distinct.intent.description },
    schedule: { start: coreDateBoundary(distinct.intent.date) },
    participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
    acl: { visibility: "GROUP", people: [] },
  },
});
freeze(distinctSharedP1Command);
export const distinctSharedP1CaseId = "AUTH_C04_DISTINCT_SHARED_BRIEFING_20261106";
function commandsFor(caseId?: string) {
  if (caseId === undefined) return fixtureCommands;
  if (
    caseId !== distinctSharedP1CaseId || distinct.caseId !== caseId ||
    distinct.tripId !== qa.tripId || distinct.ownerAccountId !== qa.ownerAccountId ||
    distinct.memberAccountId !== qa.memberAccountId
  ) throw Error("C04_FIXTURE_CASE_NOT_REGISTERED");
  return [distinctSharedP1Command];
}
function requireDistinctItem(rows: CoreReadRecord[]) {
  const items = rows.filter((r) => r.kind === "ITEM" && r.id === distinct.itemId);
  if (items.length !== 1) throw Error("C04_DISTINCT_ITEM_READ_MISMATCH");
  const body = items[0].body as Record<string, unknown>;
  if (body.id !== distinct.itemId || body.trip_id !== qa.tripId ||
      body.owner_account_id !== qa.ownerAccountId || body.visibility !== "GROUP" ||
      body.title !== distinct.intent.title || body.description !== distinct.intent.description ||
      body.experience_family !== "P1" || body.start_local_date !== distinct.intent.date ||
      body.participation_mode !== "WHOLE_GROUP")
    throw Error("C04_DISTINCT_ITEM_READ_MISMATCH");
  return items[0];
}
export function checkDistinctSharedP1Read(owner: CoreReadRecord[], member: CoreReadRecord[]) {
  requireBinding(owner, qa.ownerAccountId, qa.ownerPersonId);
  const result = checkMemberRead(owner, member);
  if (requireDistinctItem(owner).revision !== requireDistinctItem(member).revision)
    throw Error("C04_DISTINCT_ITEM_REVISION_MISMATCH");
  return { ...result, sharedItemRead: "PASS", distinctCaseId: distinct.caseId };
}

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
  caseId?: typeof distinctSharedP1CaseId;
  qualifyDistinct?(): Promise<void>;
  context: Context;
  reserve(command: (typeof fixtureCommands)[number], intentSha256: string): Promise<void>;
  note(value: Record<string, unknown>): void;
}) {
  const { transport: t, context: ctx } = input;
  const commands = commandsFor(input.caseId);
  if (input.caseId) {
    if (!input.qualifyDistinct) throw Error("C04_DISTINCT_EXECUTION_QUALIFICATION_REQUIRED");
    await input.qualifyDistinct();
  }
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
  if (before.some((r) => commands.some((c) => c.target.id === r.id)))
    throw Error("C04_FIXTURE_ALREADY_EXISTS");
  for (const command of commands) {
    if (await t.receipt(ctx, command.operationId))
      throw Error("C04_FIXTURE_OPERATION_ALREADY_EXISTS");
    const intentSha256 = await coreHashValue("otr-trip-core-intent-v2", command, hash);
    await input.reserve(structuredClone(command), intentSha256);
    if (input.caseId) await input.qualifyDistinct!();
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

// Same selected operation only: absence is UNKNOWN; this recovery port has no submit capability.
export async function readOriginalFixtureOutcome(
  transport: Pick<Transport, "receipt" | "collection">,
  context: Context,
  caseId?: typeof distinctSharedP1CaseId,
) {
  const command = commandsFor(caseId)[0];
  if (context.accountId !== qa.ownerAccountId || context.tripId !== qa.tripId)
    throw Error("C04_FIXTURE_SCOPE_MISMATCH");
  const receipt = await transport.receipt(context, command.operationId);
  const records = (await transport.collection(context)).pages.flatMap((p) => p.records);
  requireBinding(records, qa.ownerAccountId, qa.ownerPersonId);
  const items = records.filter((r) => r.kind === "ITEM" && r.id === command.target.id);
  if (!receipt || receipt.projection !== "FULL")
    return { outcome: "UNKNOWN", itemObserved: items.length > 0, automaticRetry: false };
  const r = receipt.receipt;
  if (
    r.actorAccountId !== context.accountId ||
    r.tripId !== context.tripId ||
    r.operationId !== command.operationId ||
    r.command !== command.command ||
    r.intentSha256 !== (await coreHashValue("otr-trip-core-intent-v2", command, hash))
  )
    throw Error("C04_FIXTURE_RECEIPT_MISMATCH");
  if (
    r.outcome === "APPLIED" &&
    (items.length !== 1 ||
      (items[0].body as { owner_account_id?: string }).owner_account_id !==
        context.accountId ||
      (items[0].body as { visibility?: string }).visibility !== "GROUP" ||
      r.result.created.filter((v) => v.kind === "ITEM" && v.id === command.target.id)
        .length !== 1)
  )
    throw Error("C04_FIXTURE_APPLIED_READBACK_MISMATCH");
  if (caseId && r.outcome === "APPLIED") requireDistinctItem(records);
  return {
    outcome: r.outcome,
    itemObserved: items.length > 0,
    receiptSha256: r.receiptSha256,
    automaticRetry: false,
  };
}

export function fixtureTransport(
  context: RegisteredQaHostContext,
  note: (value: Record<string, unknown>) => void,
  caseId?: typeof distinctSharedP1CaseId,
  qualifyDistinct?: () => Promise<void>,
) {
  const commands = commandsFor(caseId);
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
              ...(caseId && context.accountId === qa.memberAccountId ? [] : [
                base + "/capabilities",
                ...commands.map((c) => base + "/operations/" + c.operationId),
              ]),
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
          !commands.some((command) => init?.body === JSON.stringify(command))
        )
          throw Error("C04_FIXTURE_COMMAND_DENIED");
        if (method === "POST") {
          const body = String(init?.body);
          if (submitted.has(body)) throw Error("C04_FIXTURE_POST_ALREADY_ATTEMPTED");
          submitted.add(body);
          if (caseId) {
            if (!qualifyDistinct) throw Error("C04_DISTINCT_EXECUTION_QUALIFICATION_REQUIRED");
            await qualifyDistinct();
          }
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
  caseId?: typeof distinctSharedP1CaseId;
  // Owning operator must verify exact current authority/resources before any session.
  beforeDistinctRun?(): Promise<void>;
  withOwnerSession(
    work: (context: RegisteredQaHostContext) => Promise<void>,
  ): Promise<unknown>;
  withMemberSession(
    work: (context: RegisteredQaHostContext) => Promise<void>,
  ): Promise<unknown>;
  reserve: Parameters<typeof createOwnerItemFixtures>[0]["reserve"];
  note(value: Record<string, unknown>): void;
}) {
  commandsFor(input.caseId);
  if (input.caseId) {
    if (!input.beforeDistinctRun) throw Error("C04_DISTINCT_EXECUTION_QUALIFICATION_REQUIRED");
    await input.beforeDistinctRun();
  }
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
        transport: fixtureTransport(context, input.note, input.caseId, input.beforeDistinctRun),
        caseId: input.caseId,
        qualifyDistinct: input.beforeDistinctRun,
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
  if (input.caseId) await input.beforeDistinctRun!();
  checkCleanup(
    await input.withMemberSession(async (context) => {
      if (context.accountId !== qa.memberAccountId)
        throw Error("C04_FIXTURE_MEMBER_SESSION_MISMATCH");
      if (input.caseId) await input.beforeDistinctRun!();
      member = (
        await fixtureTransport(context, input.note, input.caseId, input.beforeDistinctRun).collection(
          await captureAccountRequestContext(qa.tripId, async () => context.accountId),
        )
      ).pages.flatMap((p) => p.records);
    }),
    qa.memberAccountId,
  );
  if (!owner || !member) throw Error("C04_FIXTURE_READ_INCOMPLETE");
  return input.caseId
    ? checkDistinctSharedP1Read(owner, member)
    : checkFixtureIsolation(owner, member);
}

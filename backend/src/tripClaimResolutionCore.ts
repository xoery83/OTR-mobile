import { createHash } from "node:crypto";
import { z } from "zod";
import { coreText, coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  claimResolutionCommandSchema, claimResolutionScopeSchema, claimRequestSnapshotSchema,
  claimResolutionReceiptSchema, pendingClaimPreviewInputSchema, pendingClaimPreviewSchema,
  claimResolutionRecoveryInputSchema, type ClaimResolutionAuthority,
} from "../../src/data/api/claimResolutionContracts";
import { personCloudCreateReceiptSchema } from "../../src/domain/trip/tripPersonCloudCreate";
import { claimResolutionIntentDigest } from "./tripClaimResolutionAdapter";
import type { CorePgLease } from "./tripCoreV2PgStorage";

type Scope = z.infer<typeof claimResolutionScopeSchema>;
type Snapshot = z.infer<typeof claimRequestSnapshotSchema>;
type Receipt = z.infer<typeof claimResolutionReceiptSchema>;
type Command = z.infer<typeof claimResolutionCommandSchema>;
export type StoredClaimRequest = { inviteId: string; sourceFingerprint: string; snapshot: Snapshot };
export type ClaimResolutionTransaction = {
  lease: CorePgLease;
  now(): Promise<string>;
  resolver(): Promise<boolean>;
  request(id: string): Promise<StoredClaimRequest | null>;
  receipt(operation: string): Promise<{ version: number; actor: string; trip: string; request: string | null; digest: string; body: unknown } | null>;
  saveRequest(row: StoredClaimRequest, expectedRevision: number | null, operationId: string): Promise<void>;
  saveReceipt(row: StoredClaimRequest, receipt: Receipt, canonicalIntent: string): Promise<void>;
  revokeGrant(row: StoredClaimRequest, operation: string, reason: "REQUEST_REJECTED" | "REQUEST_LINKED"): Promise<Receipt["effects"]["provisionalRevocation"]>;
};
export type ClaimResolutionStorage = {
  // Existing dedicated lease/transaction infrastructure; scope must be checked before work.
  atomic<T>(scope: Scope, work: (tx: ClaimResolutionTransaction) => Promise<T>): Promise<T>;
};
const sourceFact = z.strictObject({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  access: z.enum(["READ", "COLLABORATE"]),
  expiresAt: z.iso.datetime({ offset: true }),
});
// Existing recipient-bound directed Source only; this never qualifies a general link/token.
export async function readClaimResolutionDirectedOriginOnTransaction(
  tx: ClaimResolutionTransaction, scope: Scope, input: z.infer<typeof pendingClaimPreviewInputSchema>,
): Promise<z.infer<typeof sourceFact> | null> {
  const trustedScope = claimResolutionScopeSchema.parse(scope);
  const parsed = pendingClaimPreviewInputSchema.parse(input);
  const rows = (await tx.lease.query(
    "SELECT public.trip_claim_resolution_state('directedOrigin',$1::uuid,$2::uuid,$3::jsonb) AS result",
    [trustedScope.actorAccountId, trustedScope.tripId, JSON.stringify(parsed)],
  )).rows;
  if (rows.length !== 1 || !("result" in rows[0])) throw Error("CLAIM_ORIGIN_RESULT_MISSING");
  return sourceFact.nullable().parse(rows[0].result);
}
export type ClaimResolutionOwningEffects = {
  // Required qualified origin verifier, not invite-ID possession or a fabricated invite.
  source(tx: ClaimResolutionTransaction, scope: Scope, input: z.infer<typeof pendingClaimPreviewInputSchema>): Promise<z.infer<typeof sourceFact> | null>;
  issueProvisional?(tx: ClaimResolutionTransaction, scope: Scope, row: StoredClaimRequest, operationId: string): Promise<Snapshot["provisionalGrant"]>;
  // Must recheck current source, collision, consent and legitimate proposer/Person issuer on tx.lease.
  // Existing withTripPersonCloudCreateOnTransaction is the Person technical seam; no separate COMMIT.
  finalize(tx: ClaimResolutionTransaction, scope: Scope, row: StoredClaimRequest, intent: { command: Command; intentDigest: string }): Promise<{
    linkedPersonId: string;
    personCreateReceipt: Receipt["effects"]["personCreateReceipt"];
  }>;
};
const digest = (domain: string, value: unknown) => createHash("sha256").update(domain + "\n" + JSON.stringify(value)).digest("hex");
const proposalDigest = (s: Snapshot, sourceFingerprint: string) => digest("otr-claim-proposal-v1", {
  requestId: s.requestId, tripId: s.tripId, claimant: s.claimantAccountId,
  revision: s.proposalRevision, proposal: s.proposal, access: s.proposedAccess, sourceFingerprint,
});
const terminal = (s: Snapshot) => ["LINKED", "REJECTED", "EXPIRED"].includes(s.state);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Default-closed canonical engine. No production origin/link/Person proof producer is supplied here.
export function createClaimResolutionCore(
  storage: ClaimResolutionStorage,
  effects?: ClaimResolutionOwningEffects,
  enabled = false,
): ClaimResolutionAuthority | undefined {
  if (!enabled || !effects) return undefined;
  const owningEffects = effects;
  const canRead = async (tx: ClaimResolutionTransaction, scope: Scope, row: StoredClaimRequest) =>
    row.snapshot.claimantAccountId === scope.actorAccountId || await tx.resolver();
  const preview = async (tx: ClaimResolutionTransaction, scope: Scope, input: z.infer<typeof pendingClaimPreviewInputSchema>) => {
    const raw = await owningEffects.source(tx, scope, input);
    if (!raw) return null;
    const fact = sourceFact.parse(raw);
    if (Date.parse(fact.expiresAt) <= Date.parse(await tx.now())) return null;
    return { fingerprint: fact.fingerprint, value: pendingClaimPreviewSchema.parse({ ...input, tripId: scope.tripId,
      claimantAccountId: scope.actorAccountId, proposedAccess: fact.access, expiresAt: fact.expiresAt,
      previewDigest: digest("otr-claim-preview-v1", { scope, input, fact }) }) };
  };
  async function execute(scopeInput: Scope, input: Command) {
    const scope = claimResolutionScopeSchema.parse(scopeInput), command = claimResolutionCommandSchema.parse(input);
    const intentDigest = claimResolutionIntentDigest(scope, command);
    return storage.atomic(scope, async tx => {
      const prior = await tx.receipt(command.operationId);
      if (prior) {
        if (prior.version !== 2 || prior.actor !== scope.actorAccountId || prior.trip !== scope.tripId ||
          prior.request !== command.requestId || prior.digest !== intentDigest)
          return { status: "CONFLICT" as const, currentRevision: null };
        const receipt = claimResolutionReceiptSchema.parse(prior.body);
        const current = await tx.request(command.requestId);
        return { status: "RECORDED" as const, receipt,
          snapshot: current && await canRead(tx, scope, current) ? current.snapshot : null };
      }
      let row = await tx.request(command.requestId);
      const revocationSource = row ? structuredClone(row) : null;
      const before = row?.snapshot.revision ?? null;
      const now = await tx.now();
      if (!Number.isFinite(Date.parse(now))) throw Error("CLAIM_CLOCK_UNAVAILABLE");
      if (command.kind === "SUBMIT_PENDING_CLAIM") {
        if (row) return { status: "CONFLICT" as const, currentRevision: await canRead(tx, scope, row) ? before : null };
        const p = await preview(tx, scope, { requestId: command.requestId, inviteId: command.inviteId, requestedPersonId: command.requestedPersonId });
        if (!p) return { status: "DENIED" as const };
        if (p.value.previewDigest !== command.expectedPreviewDigest) return { status: "CONFLICT" as const, currentRevision: null };
        const snapshot: Snapshot = {
          requestId: command.requestId, tripId: scope.tripId, claimantAccountId: scope.actorAccountId,
          originalPersonId: command.requestedPersonId, revision: 1, state: "PENDING_REVIEW",
          proposal: { kind: "EXISTING_PERSON", personId: command.requestedPersonId }, proposalRevision: 1,
          proposalOperationId: command.operationId, proposedByAccountId: scope.actorAccountId,
          proposalDigest: "", proposedAccess: p.value.proposedAccess,
          consent: { state: "RECORDED", proposalDigest: "", operationId: command.operationId },
          provisionalGrant: null, expiresAt: p.value.expiresAt,
        };
        snapshot.proposalDigest = proposalDigest(snapshot, p.fingerprint);
        snapshot.consent.proposalDigest = snapshot.proposalDigest;
        row = { inviteId: command.inviteId, sourceFingerprint: p.fingerprint, snapshot };
      } else {
        if (!row || !await canRead(tx, scope, row)) return { status: "DENIED" as const };
        if (before !== command.expectedRevision) return { status: "CONFLICT" as const, currentRevision: before };
        const s = row.snapshot;
        if (terminal(s) || Date.parse(s.expiresAt) <= Date.parse(now)) return { status: "DENIED" as const };
        if (command.kind === "RESOLVE_CLAIM_REQUEST") {
          if (!await tx.resolver()) return { status: "DENIED" as const };
          const decision = command.decision;
          if (decision.kind === "REJECT") s.state = "REJECTED";
          else if (decision.kind === "CONFIRM") {
            if (s.state !== "PENDING_REVIEW" || s.consent.state !== "RECORDED" || s.consent.proposalDigest !== s.proposalDigest)
              return { status: "DENIED" as const };
            s.state = "LINKED";
          } else {
            if (decision.kind === "CREATE_NEW" && decision.create.tripId !== scope.tripId) return { status: "DENIED" as const };
            s.proposal = decision.kind === "CHOOSE_ANOTHER" ? { kind: "EXISTING_PERSON", personId: decision.personId } : { kind: "NEW_PERSON", create: decision.create };
            s.proposalRevision = s.revision + 1;
            s.proposalOperationId = command.operationId;
            s.proposedByAccountId = scope.actorAccountId;
            s.proposalDigest = proposalDigest(s, row.sourceFingerprint);
            s.consent = { state: "REQUIRED", proposalDigest: s.proposalDigest, operationId: null };
            s.state = "AWAITING_CONSENT";
          }
        } else {
          if (s.claimantAccountId !== scope.actorAccountId || s.state !== "AWAITING_CONSENT" ||
            s.proposalDigest !== command.proposalDigest) return { status: "DENIED" as const };
          s.consent = { state: "RECORDED", proposalDigest: s.proposalDigest, operationId: command.operationId };
          s.state = "LINKED";
        }
        s.revision++;
      }
      let linkedPersonId: string | null = null;
      let personCreateReceipt: Receipt["effects"]["personCreateReceipt"] = null;
      if (row.snapshot.state === "LINKED") {
        const effect = await owningEffects.finalize(tx, scope, row, { command, intentDigest });
        const expected = row.snapshot.proposal.kind === "NEW_PERSON" ? row.snapshot.proposal.create.personId : row.snapshot.proposal.personId;
        if (effect.linkedPersonId !== expected) throw Error("CLAIM_LINK_PROOF_MISMATCH");
        linkedPersonId = effect.linkedPersonId;
        personCreateReceipt = effect.personCreateReceipt;
        if (row.snapshot.proposal.kind === "NEW_PERSON") {
          const child = personCloudCreateReceiptSchema.parse(personCreateReceipt);
          if (child.actorAccountId !== row.snapshot.proposedByAccountId || !same(child.request, row.snapshot.proposal.create)) throw Error("CLAIM_CHILD_INTENT_MISMATCH");
        } else if (personCreateReceipt !== null) throw Error("CLAIM_UNEXPECTED_PERSON_CREATE");
      }
      const provisionalRevocation = ["LINKED", "REJECTED"].includes(row.snapshot.state)
        ? await tx.revokeGrant(revocationSource!, command.operationId, row.snapshot.state === "LINKED" ? "REQUEST_LINKED" : "REQUEST_REJECTED") : null;
      if (provisionalRevocation) {
        const grant = row.snapshot.provisionalGrant;
        if (!grant || grant.grantId !== provisionalRevocation.grantId || grant.claimantAccountId !== row.snapshot.claimantAccountId)
          throw Error("CLAIM_GRANT_PROOF_MISMATCH");
        row.snapshot.provisionalGrant = { ...grant, state: "REVOKED", revision: provisionalRevocation.afterRevision };
      }
      row.snapshot = claimRequestSnapshotSchema.parse(row.snapshot);
      const receipt = claimResolutionReceiptSchema.parse({ receiptVersion: 2, operationId: command.operationId,
        actorAccountId: scope.actorAccountId, tripId: scope.tripId, requestId: command.requestId,
        intentDigest, commandKind: command.kind, beforeRevision: before, afterRevision: row.snapshot.revision,
        outcome: row.snapshot.state, acceptedAt: now, effects: { linkedPersonId, personCreateReceipt, provisionalRevocation } });
      await tx.saveRequest(row, before, command.operationId);
      if (command.kind === "SUBMIT_PENDING_CLAIM" && owningEffects.issueProvisional) {
        row.snapshot.provisionalGrant = await owningEffects.issueProvisional(tx, scope, row, command.operationId);
        row.snapshot = claimRequestSnapshotSchema.parse(row.snapshot);
      }
      await tx.saveReceipt(row, receipt, JSON.stringify({ scope, command }));
      return { status: "RECORDED" as const, receipt, snapshot: row.snapshot };
    });
  }
  return {
    previewPendingClaim: (s, p) => {
      const scope = claimResolutionScopeSchema.parse(s), input = pendingClaimPreviewInputSchema.parse(p);
      return storage.atomic(scope, async tx => (await preview(tx, scope, input))?.value ?? null);
    },
    submitPendingClaim: execute,
    resolveClaimRequest: execute,
    consentToResolution: execute,
    readRequest: (s, id) => {
      const scope = claimResolutionScopeSchema.parse(s);
      return storage.atomic(scope, async tx => {
        const row = await tx.request(id); return row && await canRead(tx, scope, row) ? row.snapshot : null;
      });
    },
    recoverOperation: (s, input) => {
      const scope = claimResolutionScopeSchema.parse(s);
      return storage.atomic(scope, async tx => {
      const p = claimResolutionRecoveryInputSchema.parse(input), found = await tx.receipt(p.operationId);
      if (!found) return { status: "ABSENT_UNCONFIRMED" as const };
      if (found.version !== 2 || found.actor !== scope.actorAccountId || found.trip !== scope.tripId || found.request !== p.requestId || found.digest !== p.intentDigest)
        return { status: "CONFLICT" as const };
      return { status: "FOUND" as const, receipt: claimResolutionReceiptSchema.parse(found.body) };
      });
    },
  };
}

// Explicit composition only. SQL and existing Person/read-state adapters require separate protected qualification.
export function createDirectedClaimResolutionSqlEffects(enabled = false): ClaimResolutionOwningEffects | undefined {
  if (!enabled) return undefined;
  return {
    source: readClaimResolutionDirectedOriginOnTransaction,
    async issueProvisional(tx, scope, row, operationId) {
      const rows = (await tx.lease.query(
        "SELECT public.trip_claim_resolution_state('issueGrant',$1::uuid,$2::uuid,$3::jsonb) AS result",
        [scope.actorAccountId, scope.tripId, JSON.stringify({ requestId: row.snapshot.requestId, operationId })],
      )).rows;
      if (rows.length !== 1 || !("result" in rows[0])) throw Error("CLAIM_GRANT_RESULT_MISSING");
      return claimRequestSnapshotSchema.shape.provisionalGrant.parse(rows[0].result);
    },
    async finalize(tx, scope, _row, intent) {
      const rows = (await tx.lease.query(
        "SELECT public.trip_claim_resolution_finalize($1::uuid,$2::uuid,$3::text) AS result",
        [scope.actorAccountId, scope.tripId, JSON.stringify({ scope, command: intent.command })],
      )).rows;
      if (rows.length !== 1 || !("result" in rows[0])) throw Error("CLAIM_FINALIZE_RESULT_MISSING");
      return z.strictObject({ linkedPersonId: claimResolutionScopeSchema.shape.actorAccountId,
        personCreateReceipt: personCloudCreateReceiptSchema.nullable() }).parse(rows[0].result);
    },
  };
}

export type ClaimResolutionViewV1 = {
  version: 1;
  request: Snapshot;
  proposalPreview: { personId: string; displayName: string } | null;
  eligibility: {
    requestRevision: number;
    allowedActions: ("CONFIRM" | "CHOOSE_ANOTHER" | "CREATE_NEW" | "REJECT")[];
    canConsent: boolean;
  };
};
// Read eligibility and snapshot together; execution always rechecks authority/CAS on a new request.
export async function readClaimResolutionViewOnTransaction(
  tx: ClaimResolutionTransaction, scopeInput: unknown, requestInput: unknown,
): Promise<ClaimResolutionViewV1 | null> {
  const scope = claimResolutionScopeSchema.parse(scopeInput);
  const requestId = claimResolutionScopeSchema.shape.tripId.parse(requestInput);
  const row = await tx.request(requestId);
  if (!row) return null;
  const resolver = await tx.resolver(), snapshot = claimRequestSnapshotSchema.parse(row.snapshot);
  if (snapshot.tripId !== scope.tripId || snapshot.requestId !== requestId) throw Error("CLAIM_VIEW_SCOPE_MISMATCH");
  if (snapshot.claimantAccountId !== scope.actorAccountId && !resolver) return null;
  const clock = await tx.now();
  if (!Number.isFinite(Date.parse(clock))) throw Error("CLAIM_CLOCK_UNAVAILABLE");
  const result = (await tx.lease.query(
    "SELECT public.trip_claim_resolution_state('writeAllowed',$1::uuid,$2::uuid,'{}'::jsonb) AS result",
    [scope.actorAccountId, scope.tripId],
  )).rows;
  if (result.length !== 1 || typeof result[0].result !== "boolean") throw Error("CLAIM_VIEW_AUTHORITY_UNAVAILABLE");
  const live = result[0].result && !terminal(snapshot) && Date.parse(snapshot.expiresAt) > Date.parse(clock);
  const factsRows = (await tx.lease.query(
    "SELECT public.trip_claim_resolution_state('decisionFacts',$1::uuid,$2::uuid,$3::jsonb) AS result",
    [scope.actorAccountId, scope.tripId, JSON.stringify({ requestId })],
  )).rows;
  if (factsRows.length !== 1 || !("result" in factsRows[0])) throw Error("CLAIM_VIEW_FACTS_UNAVAILABLE");
  const facts = z.strictObject({ sourceCurrent: z.boolean(), proposalPreview: z.strictObject({
    personId: claimResolutionScopeSchema.shape.tripId, displayName: z.string().min(1).max(256),
  }).nullable() }).nullable().parse(factsRows[0].result);
  if (!facts) return null;
  if (facts.proposalPreview && (snapshot.proposal.kind !== "EXISTING_PERSON" || facts.proposalPreview.personId !== snapshot.proposal.personId))
    throw Error("CLAIM_VIEW_PROPOSAL_LABEL_MISMATCH");
  const allowedActions: ClaimResolutionViewV1["eligibility"]["allowedActions"] = [];
  if (live && resolver) {
    if (facts.sourceCurrent && snapshot.state === "PENDING_REVIEW" && snapshot.consent.state === "RECORDED") allowedActions.push("CONFIRM");
    if (facts.sourceCurrent) allowedActions.push("CHOOSE_ANOTHER", "CREATE_NEW");
    allowedActions.push("REJECT");
  }
  return { version: 1, request: snapshot, proposalPreview: facts.proposalPreview, eligibility: { requestRevision: snapshot.revision, allowedActions,
    canConsent: live && facts.sourceCurrent && (snapshot.proposal.kind === "NEW_PERSON" || facts.proposalPreview !== null) && snapshot.claimantAccountId === scope.actorAccountId && snapshot.state === "AWAITING_CONSENT" } };
}

// General-token callers must first obtain a server-owned request binding; no token enters Claim DTO/receipt.
export function createClaimResolutionSqlEffects(enabled = false): ClaimResolutionOwningEffects | undefined {
  const effects = createDirectedClaimResolutionSqlEffects(enabled);
  if (!effects) return undefined;
  return { ...effects, async source(tx, scope, input) {
    const trustedScope = claimResolutionScopeSchema.parse(scope), parsed = pendingClaimPreviewInputSchema.parse(input);
    const rows = (await tx.lease.query(
      "SELECT public.trip_claim_resolution_state('origin',$1::uuid,$2::uuid,$3::jsonb) AS result",
      [trustedScope.actorAccountId, trustedScope.tripId, JSON.stringify(parsed)],
    )).rows;
    if (rows.length !== 1 || !("result" in rows[0])) throw Error("CLAIM_ORIGIN_RESULT_MISSING");
    return sourceFact.nullable().parse(rows[0].result);
  } };
}

// This separate transient input never enters the original Claim command, checkpoint or receipt.
export async function verifyClaimGeneralOriginOnTransaction(
  tx: ClaimResolutionTransaction, scopeInput: unknown, input: unknown,
) {
  const scope = claimResolutionScopeSchema.parse(scopeInput);
  const body = z.strictObject({ requestId: claimResolutionScopeSchema.shape.tripId,
    inviteId: claimResolutionScopeSchema.shape.tripId, purpose: z.literal("PERSON_CLAIM"), token: z.string().min(1) }).parse(input);
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 8192) throw Error("CLAIM_ORIGIN_BODY_LIMIT");
  const rows = (await tx.lease.query(
    "SELECT public.trip_claim_origin_verify($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text) AS result",
    [scope.actorAccountId, scope.tripId, body.requestId, body.inviteId, body.token],
  )).rows;
  if (rows.length !== 1 || !("result" in rows[0])) throw Error("CLAIM_ORIGIN_VERIFICATION_UNAVAILABLE");
  const result = z.strictObject({ accountId: claimResolutionScopeSchema.shape.actorAccountId,
    tripId: claimResolutionScopeSchema.shape.tripId, requestId: claimResolutionScopeSchema.shape.tripId,
    inviteId: claimResolutionScopeSchema.shape.tripId, purpose: z.literal("PERSON_CLAIM"),
    expiresAt: z.iso.datetime({ offset: true }), verified: z.literal(true) }).nullable().parse(rows[0].result);
  if (result && (result.accountId !== scope.actorAccountId || result.tripId !== scope.tripId || result.requestId !== body.requestId || result.inviteId !== body.inviteId))
    throw Error("CLAIM_ORIGIN_VERIFICATION_BINDING");
  return result;
}

export async function readClaimResolutionPendingRequestsOnTransaction(
  tx: ClaimResolutionTransaction, scopeInput: unknown, pageInput: unknown,
) {
  const scope = claimResolutionScopeSchema.parse(scopeInput), uuid = claimResolutionScopeSchema.shape.tripId;
  const page = z.strictObject({ afterRequestId: uuid.nullable() }).parse(pageInput);
  const rows = (await tx.lease.query(
    "SELECT public.trip_claim_resolution_state('pendingIndex',$1::uuid,$2::uuid,$3::jsonb) AS result",
    [scope.actorAccountId, scope.tripId, JSON.stringify(page)],
  )).rows;
  if (rows.length !== 1 || !("result" in rows[0])) throw Error("CLAIM_PENDING_INDEX_UNAVAILABLE");
  const value = z.strictObject({ requests: z.array(z.strictObject({ requestId: uuid, inviteId: uuid,
    initialSubmitOperationId: uuid, expiresAt: z.iso.datetime({ offset: true }), revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    state: z.enum(["PENDING_REVIEW", "AWAITING_CONSENT"]), originalPersonId: uuid, claimantAccountId: uuid })).max(50),
    nextRequestId: uuid.nullable() }).nullable().parse(rows[0].result);
  if (!value) return null;
  const ids = value.requests.map(r => r.requestId);
  if (new Set(ids).size !== ids.length || ids.some((id, i) => (page.afterRequestId !== null && id <= page.afterRequestId) || (i > 0 && id <= ids[i - 1])) ||
      (value.nextRequestId !== null && (ids.length !== 50 || value.nextRequestId !== ids.at(-1)))) throw Error("CLAIM_PENDING_INDEX_BINDING");
  return value;
}

const generalInviteReceiptSchema = z.strictObject({ receiptVersion: z.literal(3), operationId: coreUuid,
  actorAccountId: coreUuid, tripId: coreUuid, inviteId: coreUuid, intentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/), purpose: z.literal("PERSON_CLAIM"), outcome: z.literal("GENERAL_INVITE_ISSUED"),
  expiresAt: z.iso.datetime({ offset: true }), maxUses: z.number().int().min(1).max(2147483647).nullable(), acceptedAt: z.iso.datetime({ offset: true }) });

export async function issueClaimGeneralInviteOnTransaction(tx: ClaimResolutionTransaction, scopeInput: unknown, input: unknown) {
  const scope = claimResolutionScopeSchema.parse(scopeInput), uuid = claimResolutionScopeSchema.shape.tripId;
  const body = z.strictObject({ operationId: uuid, expiresAt: z.iso.datetime({ offset: true }).nullable(), maxUses: z.number().int().min(1).max(2147483647).nullable() }).parse(input);
  const rows = (await tx.lease.query(
    "SELECT public.trip_claim_general_invite_issue($1::uuid,$2::uuid,$3::uuid,$4::timestamptz,$5::integer) AS result",
    [scope.actorAccountId, scope.tripId, body.operationId, body.expiresAt, body.maxUses],
  )).rows;
  if (rows.length !== 1 || !("result" in rows[0])) throw Error("GENERAL_INVITE_RECEIPT_UNAVAILABLE");
  const receipt = generalInviteReceiptSchema.parse(rows[0].result);
  if (receipt.operationId !== body.operationId || receipt.actorAccountId !== scope.actorAccountId || receipt.tripId !== scope.tripId || receipt.maxUses !== body.maxUses ||
    (body.expiresAt !== null && Date.parse(receipt.expiresAt) !== Date.parse(body.expiresAt))) throw Error("GENERAL_INVITE_RECEIPT_BINDING");
  return receipt;
}

// Sensitive delivery only for normal authorized issuer/share consumption; never copy this into a receipt/checkpoint/log.
export async function readClaimGeneralInviteDeliveryOnTransaction(tx: ClaimResolutionTransaction, scopeInput: unknown, operationInput: unknown) {
  const scope = claimResolutionScopeSchema.parse(scopeInput), uuid = claimResolutionScopeSchema.shape.tripId, operationId = uuid.parse(operationInput);
  const rows = (await tx.lease.query("SELECT public.trip_claim_general_invite_delivery($1::uuid,$2::uuid,$3::uuid) AS result", [scope.actorAccountId, scope.tripId, operationId])).rows;
  if (rows.length !== 1 || !("result" in rows[0])) throw Error("GENERAL_INVITE_DELIVERY_UNAVAILABLE");
  const value = z.strictObject({ accountId: uuid, tripId: uuid, operationId: uuid, inviteId: uuid, token: z.string().min(1), expiresAt: z.iso.datetime({ offset: true }) }).nullable().parse(rows[0].result);
  if (value && (value.accountId !== scope.actorAccountId || value.tripId !== scope.tripId || value.operationId !== operationId)) throw Error("GENERAL_INVITE_DELIVERY_BINDING");
  return value;
}

// UNKNOWN uses this read-only original operation lookup, never issue/delivery as a substitute.
export async function recoverClaimGeneralInviteOnTransaction(tx: ClaimResolutionTransaction, scopeInput: unknown, operationInput: unknown) {
  const scope = claimResolutionScopeSchema.parse(scopeInput), uuid = claimResolutionScopeSchema.shape.tripId, operationId = uuid.parse(operationInput);
  const rows = (await tx.lease.query("SELECT public.trip_claim_general_invite_recover($1::uuid,$2::uuid,$3::uuid) AS result", [scope.actorAccountId, scope.tripId, operationId])).rows;
  if (rows.length !== 1 || !("result" in rows[0])) throw Error("GENERAL_INVITE_RECOVERY_UNAVAILABLE");
  const value = z.discriminatedUnion("status", [z.strictObject({ status: z.literal("ABSENT_UNCONFIRMED") }),
    z.strictObject({ status: z.literal("CONFLICT") }), z.strictObject({ status: z.literal("FOUND"), receipt: generalInviteReceiptSchema })]).parse(rows[0].result);
  if (value.status === "FOUND" && (value.receipt.actorAccountId !== scope.actorAccountId || value.receipt.tripId !== scope.tripId || value.receipt.operationId !== operationId))
    throw Error("GENERAL_INVITE_RECOVERY_BINDING");
  return value;
}

// Initial General selection is a source-bound projection, not ordinary membership access.
export async function readClaimGeneralInitialPersonsOnTransaction(
  tx: ClaimResolutionTransaction, scopeInput: unknown, input: unknown,
) {
  const scope = claimResolutionScopeSchema.parse(scopeInput);
  const body = z.strictObject({ requestId: coreUuid, inviteId: coreUuid, afterPersonId: coreUuid.nullable() }).parse(input);
  const rows = (await tx.lease.query(
    "SELECT public.trip_claim_resolution_state('generalInitialPersons',$1::uuid,$2::uuid,$3::jsonb) AS result",
    [scope.actorAccountId, scope.tripId, JSON.stringify(body)],
  )).rows;
  if (rows.length !== 1 || !("result" in rows[0])) throw Error("CLAIM_GENERAL_PERSONS_UNAVAILABLE");
  const value = z.strictObject({ version: z.literal(1), accountId: coreUuid, tripId: coreUuid, tripName: coreText(256),
    requestId: coreUuid, inviteId: coreUuid, expiresAt: z.iso.datetime({ offset: true }),
    persons: z.array(z.strictObject({ personId: coreUuid, displayName: coreText(256).refine(value => value.trim().length > 0) })).max(50),
    nextPersonId: coreUuid.nullable(),
  }).nullable().parse(rows[0].result);
  if (value && (value.accountId !== scope.actorAccountId || value.tripId !== scope.tripId ||
    value.requestId !== body.requestId || value.inviteId !== body.inviteId)) throw Error("CLAIM_GENERAL_PERSONS_BINDING");
  return value;
}

// Context for the existing Person command; this never creates a Person or substitutes its actor.
export async function readClaimCreatePersonContextOnTransaction(
  tx: ClaimResolutionTransaction, scopeInput: unknown, requestInput: unknown,
) {
  const scope = claimResolutionScopeSchema.parse(scopeInput), requestId = coreUuid.parse(requestInput);
  const rows = (await tx.lease.query(
    "SELECT public.trip_claim_resolution_state('createPersonContext',$1::uuid,$2::uuid,$3::jsonb) AS result",
    [scope.actorAccountId, scope.tripId, JSON.stringify({ requestId })],
  )).rows;
  if (rows.length !== 1 || !("result" in rows[0])) throw Error("CLAIM_PERSON_CONTEXT_UNAVAILABLE");
  const value = z.strictObject({ version: z.literal(1), actorAccountId: coreUuid, tripId: coreUuid,
    requestId: coreUuid, requestRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    tripCreateOperationId: coreUuid,
  }).nullable().parse(rows[0].result);
  if (value && (value.actorAccountId !== scope.actorAccountId || value.tripId !== scope.tripId || value.requestId !== requestId))
    throw Error("CLAIM_PERSON_CONTEXT_BINDING");
  return value;
}

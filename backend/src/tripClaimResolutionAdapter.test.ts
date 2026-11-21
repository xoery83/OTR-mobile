import { expect, it, vi } from "vitest";
import {
  claimResolutionCommandSchema,
  claimRequestSnapshotSchema,
  type ClaimResolutionAuthority,
  type ClaimResolutionCommand,
} from "../../src/data/api/claimResolutionContracts";
import {
  createClaimResolutionAdapter,
  claimResolutionIntentDigest,
} from "./tripClaimResolutionAdapter";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { actorAccountId: id(1), tripId: id(2) };
const requestId = id(3),
  operationId = id(4),
  personId = id(5),
  inviteId = id(6);
const digest = "a".repeat(64);
const submit = {
  operationId,
  requestId,
  kind: "SUBMIT_PENDING_CLAIM" as const,
  expectedRevision: null,
  inviteId,
  requestedPersonId: personId,
  expectedPreviewDigest: digest,
  explicitConsent: true as const,
};
const resolve = (kind = "CONFIRM"): ClaimResolutionCommand =>
  claimResolutionCommandSchema.parse({
    operationId,
    requestId,
    kind: "RESOLVE_CLAIM_REQUEST",
    expectedRevision: 1,
    decision:
      kind === "CHOOSE_ANOTHER"
        ? { kind, personId: id(7) }
        : kind === "CREATE_NEW"
          ? {
              kind,
              create: {
                version: 1,
                operationId: id(8),
                tripId: scope.tripId,
                personId: id(7),
                tripCreateOperationId: id(9),
                dataOwnership: "CLOUD_SHARED_AUTHORED",
                displayName: "同行人 林",
              },
            }
          : { kind },
  });
const consent = {
  operationId,
  requestId,
  kind: "CONSENT_TO_RESOLUTION" as const,
  expectedRevision: 2,
  proposalDigest: digest,
  explicitConsent: true as const,
};
function recorded(command: ClaimResolutionCommand, outcome = "LINKED"): any {
  return {
    status: "RECORDED",
    snapshot: null,
    receipt: {
      receiptVersion: 2,
      operationId,
      requestId,
      actorAccountId: scope.actorAccountId,
      tripId: scope.tripId,
      intentDigest: claimResolutionIntentDigest(scope, command),
      commandKind: command.kind,
      beforeRevision: command.expectedRevision,
      afterRevision: command.expectedRevision === null ? 1 : command.expectedRevision + 1,
      outcome,
      acceptedAt: "2026-11-15T02:00:00Z",
      effects: {
        linkedPersonId: outcome === "LINKED" ? personId : null,
        personCreateReceipt: null,
        provisionalRevocation: null,
      },
    },
  };
}
function fixture(result: unknown) {
  const port = {
    previewPendingClaim: vi.fn(async () => null),
    submitPendingClaim: vi.fn(async () => result),
    resolveClaimRequest: vi.fn(async () => result),
    consentToResolution: vi.fn(async () => result),
    readRequest: vi.fn(async () => null),
    recoverOperation: vi.fn(async () => result),
  };
  return {
    port,
    adapter: createClaimResolutionAdapter(port as ClaimResolutionAuthority),
  };
}
function snapshot(): any {
  return {
    requestId,
    tripId: scope.tripId,
    claimantAccountId: id(10),
    originalPersonId: personId,
    revision: 2,
    state: "AWAITING_CONSENT",
    proposal: { kind: "EXISTING_PERSON", personId: id(7) },
    proposalRevision: 2,
    proposalOperationId: operationId,
    proposedByAccountId: scope.actorAccountId,
    proposalDigest: digest,
    proposedAccess: "READ",
    consent: { state: "REQUIRED", proposalDigest: digest, operationId: null },
    provisionalGrant: {
      grantId: id(11),
      requestId,
      tripId: scope.tripId,
      claimantAccountId: id(10),
      revision: 1,
      access: "SHARED_READ_ONLY",
      state: "ACTIVE",
      expiresAt: "2026-11-16T00:00:00Z",
    },
    expiresAt: "2026-11-16T00:00:00Z",
  };
}

it("stays closed without the owning authority; absence/failure is never synthetic null", async () => {
  const adapter = createClaimResolutionAdapter();
  expect(await adapter.execute(scope, submit)).toEqual({ status: "CLOSED" });
  expect(
    await adapter.recover(scope, { operationId, requestId, intentDigest: digest }),
  ).toEqual({ status: "CLOSED" });
  await expect(
    adapter.preview(scope, { requestId, inviteId, requestedPersonId: personId }),
  ).rejects.toMatchObject({ status: 503, code: "CLAIM_RESOLUTION_CLOSED" });
  await expect(adapter.read(scope, requestId)).rejects.toMatchObject({ status: 503 });
});

it.each(["CONFIRM", "CHOOSE_ANOTHER", "CREATE_NEW", "REJECT"])(
  "%s dispatches once through the owning resolver without touching existing Claim",
  async (kind) => {
    const command = resolve(kind);
    const outcome =
      kind === "CONFIRM" ? "LINKED" : kind === "REJECT" ? "REJECTED" : "AWAITING_CONSENT";
    const f = fixture(recorded(command, outcome));
    expect(await f.adapter.execute(scope, command)).toEqual(recorded(command, outcome));
    expect(f.port.resolveClaimRequest).toHaveBeenCalledExactlyOnceWith(scope, command);
    expect(f.port.submitPendingClaim).not.toHaveBeenCalled();
    expect(f.port.consentToResolution).not.toHaveBeenCalled();
  },
);
it.each([submit, consent])(
  "dispatches original submission/consent to its specific port",
  async (command) => {
    const f = fixture(
      recorded(
        command,
        command.kind === "SUBMIT_PENDING_CLAIM" ? "PENDING_REVIEW" : "LINKED",
      ),
    );
    expect((await f.adapter.execute(scope, command)).status).toBe("RECORDED");
    expect(
      command.kind === "SUBMIT_PENDING_CLAIM"
        ? f.port.submitPendingClaim
        : f.port.consentToResolution,
    ).toHaveBeenCalledOnce();
    expect(f.port.resolveClaimRequest).not.toHaveBeenCalled();
  },
);

it.each(["actorAccountId", "role", "proposedAccess"])(
  "rejects body authority injection %s before IO",
  async (field) => {
    const f = fixture({ status: "DENIED" });
    await expect(
      f.adapter.execute(scope, { ...submit, [field]: "ORGANIZER" }),
    ).rejects.toThrow();
    expect(f.port.submitPendingClaim).not.toHaveBeenCalled();
  },
);
it.each([
  { expectedPreviewDigest: undefined },
  { explicitConsent: false },
  { expectedRevision: 0 },
])("requires exact preview consent at submission", async (change) => {
  const f = fixture({ status: "DENIED" });
  await expect(f.adapter.execute(scope, { ...submit, ...change })).rejects.toThrow();
  expect(f.port.submitPendingClaim).not.toHaveBeenCalled();
});
it.each([
  "actorAccountId",
  "tripId",
  "requestId",
  "operationId",
  "intentDigest",
  "beforeRevision",
])("refuses a foreign or mismatched receipt %s", async (field) => {
  const command = resolve();
  const result = recorded(command);
  result.receipt[field] =
    field === "intentDigest" ? "b".repeat(64) : field === "beforeRevision" ? 0 : id(90);
  const f = fixture(result);
  expect(await f.adapter.execute(scope, command)).toEqual({ status: "UNAVAILABLE" });
});
it("does not let an unconsented correction become LINKED", async () => {
  const command = resolve("CHOOSE_ANOTHER");
  expect(await fixture(recorded(command)).adapter.execute(scope, command)).toEqual({
    status: "UNAVAILABLE",
  });
});
it("does not forward a cross-Trip Person create intent", async () => {
  const command: any = resolve("CREATE_NEW");
  command.decision.create.tripId = id(99);
  const f = fixture({ status: "DENIED" });
  expect(await f.adapter.execute(scope, command)).toEqual({ status: "DENIED" });
  expect(f.port.resolveClaimRequest).not.toHaveBeenCalled();
});
it("stores the full stable Person creation proposal without claiming it was created", async () => {
  const command: any = resolve("CREATE_NEW");
  const result = recorded(command, "AWAITING_CONSENT");
  result.snapshot = snapshot();
  result.snapshot.proposal = { kind: "NEW_PERSON", create: command.decision.create };
  expect((await fixture(result).adapter.execute(scope, command)).status).toBe("RECORDED");
  result.snapshot.proposal = {
    kind: "NEW_PERSON",
    create: { ...command.decision.create, operationId: id(99) },
  };
  expect(await fixture(result).adapter.execute(scope, command)).toEqual({
    status: "UNAVAILABLE",
  });
});
it("binds rejection's actual grant evidence to the same request and claimant", async () => {
  const command = resolve("REJECT");
  const result = recorded(command, "REJECTED");
  result.snapshot = snapshot();
  result.snapshot.state = "REJECTED";
  result.snapshot.provisionalGrant.state = "REVOKED";
  result.receipt.effects.provisionalRevocation = {
    operationId,
    requestId,
    tripId: scope.tripId,
    grantId: id(11),
    claimantAccountId: id(10),
    beforeRevision: 1,
    afterRevision: 2,
    reason: "REQUEST_REJECTED",
    effectiveAt: "2026-11-15T02:00:00Z",
  };
  expect((await fixture(result).adapter.execute(scope, command)).status).toBe("RECORDED");
  result.receipt.effects.provisionalRevocation.claimantAccountId = id(99);
  expect(await fixture(result).adapter.execute(scope, command)).toEqual({
    status: "UNAVAILABLE",
  });
});
it("RECORDED may contain a newer authorized snapshot and never claims current membership", async () => {
  const result = recorded(submit, "PENDING_REVIEW");
  result.snapshot = snapshot();
  result.snapshot.claimantAccountId = scope.actorAccountId;
  result.snapshot.provisionalGrant.claimantAccountId = scope.actorAccountId;
  expect(await fixture(result).adapter.execute(scope, submit)).toEqual(result);
  result.snapshot.tripId = id(99);
  expect(await fixture(result).adapter.execute(scope, submit)).toEqual({
    status: "UNAVAILABLE",
  });
});
it.each(["person", "operation", "proposer", "consent"])(
  "binds a correction snapshot to its exact %s",
  async (field) => {
    const command = resolve("CHOOSE_ANOTHER");
    const result = recorded(command, "AWAITING_CONSENT");
    result.snapshot = snapshot();
    expect((await fixture(result).adapter.execute(scope, command)).status).toBe(
      "RECORDED",
    );
    if (field === "person") result.snapshot.proposal.personId = id(99);
    if (field === "operation") result.snapshot.proposalOperationId = id(99);
    if (field === "proposer") result.snapshot.proposedByAccountId = id(99);
    if (field === "consent")
      result.snapshot.consent = {
        state: "RECORDED",
        proposalDigest: digest,
        operationId: id(99),
      };
    expect(await fixture(result).adapter.execute(scope, command)).toEqual({
      status: "UNAVAILABLE",
    });
  },
);
it("binds changed-identity consent to the exact proposal and original consent operation", async () => {
  const result = recorded(consent);
  result.snapshot = snapshot();
  result.snapshot.revision = 3;
  result.snapshot.state = "LINKED";
  result.snapshot.claimantAccountId = scope.actorAccountId;
  result.snapshot.provisionalGrant = null;
  result.snapshot.proposal.personId = personId;
  result.snapshot.consent = { state: "RECORDED", proposalDigest: digest, operationId };
  expect((await fixture(result).adapter.execute(scope, consent)).status).toBe("RECORDED");
  result.snapshot.consent.operationId = id(99);
  expect(await fixture(result).adapter.execute(scope, consent)).toEqual({
    status: "UNAVAILABLE",
  });
});
it.each([3, 4])(
  "refuses another claimant's consent snapshot at revision %i",
  async (revision) => {
    const result = recorded(consent);
    result.snapshot = snapshot();
    result.snapshot.revision = revision;
    result.snapshot.state = "LINKED";
    result.snapshot.provisionalGrant = null;
    result.snapshot.proposal.personId = personId;
    result.snapshot.consent = { state: "RECORDED", proposalDigest: digest, operationId };
    expect(result.snapshot.claimantAccountId).not.toBe(scope.actorAccountId);
    expect(await fixture(result).adapter.execute(scope, consent)).toEqual({
      status: "UNAVAILABLE",
    });
  },
);
it.each(["requestId", "tripId", "claimantAccountId"])(
  "refuses foreign provisional grant %s",
  (field) => {
    const s = snapshot();
    s.provisionalGrant[field] = id(99);
    expect(claimRequestSnapshotSchema.safeParse(s).success).toBe(false);
  },
);
it("refuses stale consent or a terminal request retaining an ACTIVE provisional grant", () => {
  const s = snapshot();
  s.consent.proposalDigest = "b".repeat(64);
  expect(claimRequestSnapshotSchema.safeParse(s).success).toBe(false);
  const rejected = snapshot();
  rejected.state = "REJECTED";
  expect(claimRequestSnapshotSchema.safeParse(rejected).success).toBe(false);
});
it("scope-checks preview and keeps missing authority/storage failure distinct from absence", async () => {
  const f = fixture({ status: "DENIED" });
  await expect(f.adapter.read(scope, requestId)).resolves.toBeNull();
  f.port.readRequest.mockRejectedValueOnce(Error("PRIVATE_STORAGE_DIAGNOSTIC"));
  await expect(f.adapter.read(scope, requestId)).rejects.toMatchObject({
    message: "CLAIM_RESOLUTION_UNAVAILABLE",
    status: 503,
  });
  f.port.previewPendingClaim.mockResolvedValueOnce({
    requestId,
    inviteId,
    requestedPersonId: personId,
    tripId: scope.tripId,
    claimantAccountId: id(99),
    proposedAccess: "READ",
    previewDigest: digest,
    expiresAt: "2026-11-16T00:00:00Z",
  } as never);
  await expect(
    f.adapter.preview(scope, { requestId, inviteId, requestedPersonId: personId }),
  ).rejects.toMatchObject({ status: 503 });
});
it("UNKNOWN/absence recovery calls only the original receipt port, never submission", async () => {
  const original = { operationId, requestId, intentDigest: digest };
  const f = fixture({ status: "ABSENT_UNCONFIRMED" });
  expect(await f.adapter.recover(scope, original)).toEqual({
    status: "ABSENT_UNCONFIRMED",
  });
  expect(f.port.recoverOperation).toHaveBeenCalledExactlyOnceWith(scope, original);
  expect(f.port.submitPendingClaim).not.toHaveBeenCalled();
  expect(f.port.resolveClaimRequest).not.toHaveBeenCalled();
  expect(f.port.consentToResolution).not.toHaveBeenCalled();
});
it("returns only a matching historical recovery receipt and refuses v1-shaped fake absence", async () => {
  const receipt = recorded(resolve()).receipt;
  const original = { operationId, requestId, intentDigest: receipt.intentDigest };
  expect(
    await fixture({ status: "FOUND", receipt }).adapter.recover(scope, original),
  ).toEqual({ status: "FOUND", receipt });
  expect(
    await fixture({
      status: "FOUND",
      receipt: { ...receipt, actorAccountId: id(99) },
    }).adapter.recover(scope, original),
  ).toEqual({ status: "UNAVAILABLE" });
  expect(
    await fixture({
      status: "FOUND",
      receipt: { receiptVersion: 1, outcome: "ISSUED" },
    }).adapter.recover(scope, original),
  ).toEqual({ status: "UNAVAILABLE" });
});
it("binds the completed Person child receipt to the entire consented create intent", async () => {
  const command: any = resolve("CREATE_NEW");
  const result = recorded(consent);
  result.snapshot = snapshot();
  result.snapshot.revision = 3;
  result.snapshot.state = "LINKED";
  result.snapshot.claimantAccountId = scope.actorAccountId;
  result.snapshot.provisionalGrant = null;
  result.snapshot.proposal = { kind: "NEW_PERSON", create: command.decision.create };
  result.snapshot.consent = { state: "RECORDED", proposalDigest: digest, operationId };
  result.receipt.effects.linkedPersonId = command.decision.create.personId;
  result.receipt.effects.personCreateReceipt = {
    receiptVersion: 1,
    actorAccountId: scope.actorAccountId,
    request: command.decision.create,
    person: {
      personId: command.decision.create.personId,
      tripId: scope.tripId,
      displayName: command.decision.create.displayName,
      status: "unlinked",
      userId: null,
      participationActive: true,
      participationRevision: 0,
    },
    acceptedAt: "2026-11-15T02:00:00Z",
  };
  expect((await fixture(result).adapter.execute(scope, consent)).status).toBe("RECORDED");
  result.receipt.effects.personCreateReceipt.request = {
    ...command.decision.create,
    tripCreateOperationId: id(99),
  };
  expect(await fixture(result).adapter.execute(scope, consent)).toEqual({
    status: "UNAVAILABLE",
  });
});
it("canonical intent digest ignores input property ordering but binds CAS/action/preview", () => {
  expect(
    claimResolutionIntentDigest(
      scope,
      Object.fromEntries(Object.entries(submit).reverse()),
    ),
  ).toBe(claimResolutionIntentDigest(scope, submit));
  expect(
    claimResolutionIntentDigest(scope, {
      ...submit,
      expectedPreviewDigest: "b".repeat(64),
    }),
  ).not.toBe(claimResolutionIntentDigest(scope, submit));
  expect(claimResolutionIntentDigest(scope, resolve("REJECT"))).not.toBe(
    claimResolutionIntentDigest(scope, resolve()),
  );
  expect(claimResolutionIntentDigest({ ...scope, tripId: id(99) }, submit)).not.toBe(
    claimResolutionIntentDigest(scope, submit),
  );
  expect(
    claimResolutionIntentDigest({ ...scope, actorAccountId: id(99) }, submit),
  ).not.toBe(claimResolutionIntentDigest(scope, submit));
});

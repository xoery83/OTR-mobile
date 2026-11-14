import expenseFixture from "./fixtures/expense-canonical.json";
import { ledgerExpenseSchema } from "../src/data/api/ledgerReadContracts";
import { ledgerCapabilitySchema } from "../src/data/api/ledgerReadContracts";
import { serializeParticipationVector } from "../src/domain/trip/participationSnapshot";
import { sha } from "./mutation";
import { expect, it, vi } from "vitest";
import {
  createDomainAdapters,
  prepareMetadata,
  prepareTraveler,
  prepareExpense,
  type DomainBackend,
  type DomainContext,
  type DomainBinding,
} from "./domainAdapter";
import { tripMetadataV2Boundary } from "../backend/src/tripMetadataV2";
import { TripMetadataError } from "../backend/src/tripMetadata";
import { tripPersonCloudCreateBoundary } from "../backend/src/tripPersonCloudCreateHttp";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  trip = id(2);
const metadata = {
  formatVersion: 3,
  operationId: id(3),
  tripId: trip,
  expectedMetadataRevision: 4,
  before: {
    name: "Nelson QA",
    destination: null,
    destinations: [],
    startDate: null,
    endDate: null,
  },
  after: {
    name: "Nelson updated",
    destination: null,
    destinations: [],
    startDate: "2026-12-10",
    endDate: "2026-12-13",
  },
};
const traveler = {
  version: 1,
  operationId: id(4),
  tripId: trip,
  personId: id(5),
  tripCreateOperationId: id(6),
  dataOwnership: "CLOUD_SHARED_AUTHORED",
  displayName: "新旅客 QA",
};
const context = (backend: DomainBackend): DomainContext => ({
  accountId: actor,
  clientId: "synthetic-client",
  resource: "https://synthetic.invalid/mcp",
  expiresAt: Date.now() + 60000,
  backend,
  enabled: ["METADATA", "METADATA_READ", "TRAVELER", "EXPENSE", "EXPENSE_READ"],
  confirm: async () => true,
});

it.each(["METADATA", "TRAVELER"] as const)(
  "binds existing %s HTTP/receipt contracts and recovers same-ID response loss",
  async (kind) => {
    let saved: unknown = null,
      posts = 0,
      lose = true;
    const prepared =
      kind === "METADATA" ? prepareMetadata(metadata) : prepareTraveler(traveler);
    const backend: DomainBackend = async (q) => {
      if (q.method === "POST") posts++;
      const request = new Request("http://synthetic" + q.path, {
        method: q.method,
        headers: q.headers,
        ...(q.body ? { body: JSON.stringify(q.body) } : {}),
      });
      const response =
        kind === "METADATA"
          ? await tripMetadataV2Boundary(request, actor, {
              update: async (bodyActor, input) => {
                expect(bodyActor).toBe(actor);
                return (saved = {
                  ...input,
                  actorAccountId: actor,
                  resultMetadataRevision: 5,
                });
              },
              receipt: async () => saved as never,
              snapshot: async () =>
                ({
                  formatVersion: 3,
                  actorAccountId: actor,
                  tripId: trip,
                  metadataRevision: 4,
                  metadata: metadata.before,
                }) as never,
            })
          : await tripPersonCloudCreateBoundary(request, actor, async () => true, {
              create: async (bodyActor, input) => {
                expect(bodyActor).toBe(actor);
                return (saved = {
                  receiptVersion: 1 as const,
                  actorAccountId: actor,
                  request: input,
                  person: {
                    personId: input.personId,
                    tripId: trip,
                    displayName: input.displayName,
                    status: "unlinked" as const,
                    userId: null,
                    participationActive: true as const,
                    participationRevision: 0 as const,
                  },
                  acceptedAt: "2026-11-01T00:00:00Z",
                });
              },
              receipt: async () => saved as never,
            });
      if (q.method === "POST" && lose) {
        lose = false;
        throw Error("SIMULATED_RESPONSE_LOSS_AFTER_COMMIT");
      }
      return response;
    };
    const tools = createDomainAdapters(context(backend));
    const p = await tools.execute(prepared, "PREVIEW");
    expect((await tools.execute(prepared, "APPLY", p.preview_digest)).outcome).toBe(
      "UNKNOWN",
    );
    expect(await tools.execute(prepared, "APPLY", p.preview_digest)).toMatchObject({
      outcome: "APPLIED",
      command_id: prepared.commandId,
    });
    const status =
      kind === "METADATA"
        ? await tools.get_metadata_operation({
            trip_id: trip,
            operation_id: prepared.commandId,
          })
        : await tools.get_traveler_operation({
            trip_id: trip,
            operation_id: prepared.commandId,
          });
    expect(status).toMatchObject({ outcome: "APPLIED", command_id: prepared.commandId });
    expect(posts).toBe(1);
  },
);
it("default closed, exact confirmation, scope, expired authority and forged paths cannot dispatch", async () => {
  const backend = vi.fn(async () => Response.json({}));
  const prepared = prepareMetadata(metadata);
  const closed = createDomainAdapters({ ...context(backend), enabled: [] });
  expect((await closed.execute(prepared, "APPLY", "x")).outcome).toBe("BLOCKED");
  const noConfirm = createDomainAdapters({ ...context(backend), confirm: undefined });
  const p = await noConfirm.execute(prepared, "PREVIEW");
  expect((await noConfirm.execute(prepared, "APPLY", p.preview_digest)).outcome).toBe(
    "NEEDS_CONFIRMATION",
  );
  expect(
    (
      await createDomainAdapters({ ...context(backend), expiresAt: 0 }).execute(
        prepared,
        "PREVIEW",
      )
    ).outcome,
  ).toBe("BLOCKED");
  await expect(
    noConfirm.execute({ ...prepared, path: "/forged" }, "PREVIEW"),
  ).rejects.toThrow("PREPARED_REQUEST_MISMATCH");
  expect(backend).not.toHaveBeenCalled();
});
it("metadata CAS conflicts and mismatched receipts are not reported as saved", async () => {
  const prepared = prepareMetadata(metadata);
  const backend: DomainBackend = async (q) =>
    tripMetadataV2Boundary(
      new Request("http://synthetic" + q.path, {
        method: q.method,
        headers: q.headers,
        ...(q.body ? { body: JSON.stringify(q.body) } : {}),
      }),
      actor,
      {
        update: async () => {
          throw new TripMetadataError(409, "TRIP_METADATA_CONFLICT");
        },
        receipt: async () => null,
        snapshot: async () => {
          throw Error("unused");
        },
      },
    );
  const tools = createDomainAdapters(context(backend)),
    p = await tools.execute(prepared, "PREVIEW");
  expect((await tools.execute(prepared, "APPLY", p.preview_digest)).outcome).toBe(
    "CONFLICT",
  );
  const wrong = createDomainAdapters(
    context(async () =>
      Response.json({ ...metadata, actorAccountId: id(99), resultMetadataRevision: 5 }),
    ),
  );
  const result = await wrong.execute(
    prepared,
    "APPLY",
    (await wrong.execute(prepared, "PREVIEW")).preview_digest,
  );
  expect(result.outcome).toBe("UNKNOWN");
  expect(JSON.stringify(result)).not.toContain("Nelson updated");
});
const expense = ledgerExpenseSchema.parse(expenseFixture);
function expenseRequest(type: "CREATE" | "UPDATE") {
  return {
    trip_id: trip,
    ...(type === "UPDATE" ? { expense_id: expense.id } : {}),
    command: {
      auditReason: null,
      envelope: {
        commandId: id(21),
        idempotencyKey: id(22),
        intentVersion: 2,
        intentSequence: 1,
        predecessorOperationId: null,
        observedServerRevision: type === "CREATE" ? 0 : 1,
        observedBase: type === "CREATE" ? null : expense,
        causalBaseReceipt: null,
        boundExecutionRevision: type === "CREATE" ? 0 : 1,
        patchOrIntent:
          type === "CREATE"
            ? {
                type,
                expense: {
                  title: expense.title,
                  description: null,
                  category: "stay",
                  occurredAt: expense.occurredAt,
                  payerMemberId: id(5),
                  original: expense.original,
                  businessStatus: "DRAFT",
                  participants: expense.participants,
                  splits: expense.splits,
                  valuation: null,
                },
              }
            : { type, patch: { descriptive: { title: "Updated QA stay" } } },
      },
    },
  };
}
it.each(["CREATE", "UPDATE"] as const)(
  "reuses typed Expense %s, validates receipt binding and never retries without owning lookup",
  async (type) => {
    const q = expenseRequest(type),
      prepared = prepareExpense(q);
    let attempted = false,
      saved: unknown = null;
    const backend = vi.fn(async (request: Parameters<DomainBackend>[0]) => {
      expect(request.method).toBe(type === "CREATE" ? "POST" : "PUT");
      expect(request.headers?.["Idempotency-Key"]).toBe(id(22));
      const revision = type === "CREATE" ? 1 : 2;
      saved = {
        receipt: {
          operationId: id(23),
          commandId: id(21),
          idempotencyKey: id(22),
          expenseId: expense.id,
          commandType: type,
          intentSequence: 1,
          disposition: "APPLIED",
          canonicalRevision: revision,
        },
        entity: {
          ...expense,
          revision,
          ...(type === "UPDATE" ? { title: "Updated QA stay" } : {}),
        },
        serverId: expense.id,
        revision,
        updatedAt: expense.updatedAt,
        idempotentReplay: false,
      };
      throw Error("COMMITTED_RESPONSE_LOST");
    });
    let originalBinding: DomainBinding | undefined;
    const tools = createDomainAdapters({
      ...context(backend),
      expenseRecovery: async (binding) => {
        originalBinding ??= structuredClone(binding);
        return saved
          ? { state: "RECEIPT", binding: originalBinding, response: saved }
          : !attempted
            ? ((attempted = true),
              { state: "FIRST_SEND_RESERVED", binding: originalBinding })
            : { state: "UNKNOWN" };
      },
    });
    const p = await tools.execute(prepared, "PREVIEW");
    expect((await tools.execute(prepared, "APPLY", p.preview_digest)).outcome).toBe(
      "UNKNOWN",
    );
    expect(await tools.execute(prepared, "APPLY", p.preview_digest)).toMatchObject({
      outcome: "APPLIED",
      operation_id: id(23),
      target_id: expense.id,
    });
    expect(backend).toHaveBeenCalledTimes(1);
    const changed = expenseRequest(type);
    if (changed.command.envelope.patchOrIntent.type === "CREATE")
      changed.command.envelope.patchOrIntent.expense.title = "Different intent same ID";
    else if (changed.command.envelope.patchOrIntent.type === "UPDATE")
      changed.command.envelope.patchOrIntent.patch.descriptive.title =
        "Different intent same ID";
    const altered = prepareExpense(changed);
    const alteredPreview = await tools.execute(altered, "PREVIEW");
    expect(
      await tools.execute(altered, "APPLY", alteredPreview.preview_digest),
    ).toMatchObject({
      outcome: "UNKNOWN",
      error_code: "QUERY_ORIGINAL_COMMAND_RECEIPT_UNVERIFIED_OR_UNAVAILABLE",
    });
    const foreignRecovery = createDomainAdapters({
      ...context(backend),
      accountId: id(99),
      expenseRecovery: async (binding) => {
        expect(Object.isFrozen(binding)).toBe(true);
        return { state: "RECEIPT", binding: originalBinding!, response: saved };
      },
    });
    expect(
      await foreignRecovery.execute(
        prepared,
        "APPLY",
        (await foreignRecovery.execute(prepared, "PREVIEW")).preview_digest,
      ),
    ).toMatchObject({ outcome: "UNKNOWN" });
    expect(backend).toHaveBeenCalledTimes(1);
    const unavailable = createDomainAdapters(context(backend));
    expect(
      await unavailable.execute(
        prepared,
        "APPLY",
        (await unavailable.execute(prepared, "PREVIEW")).preview_digest,
      ),
    ).toMatchObject({ error_code: "EXPENSE_OPERATION_LOOKUP_NOT_CONNECTED" });
  },
);
it("Expense reader preserves original money, binds Trip and rejects foreign pages", async () => {
  const tools = createDomainAdapters(
    context(async () => Response.json({ expenses: [expense], nextCursor: null })),
  );
  expect((await tools.list_expenses({ trip_id: trip })).expenses[0].original).toEqual(
    expense.original,
  );
  await expect(tools.list_expenses({ trip_id: id(99) })).rejects.toThrow(
    "READ_SCOPE_OR_CURSOR_MISMATCH",
  );
});
it("reuses the lawful Bootstrap roster, verifies completeness and exposes no finance/private Profile data", async () => {
  const capabilities = ledgerCapabilitySchema.parse({
    canRead: true,
    canCreateExpense: false,
    canEditOwnExpense: false,
    canCorrectAnyExpense: false,
    canSuggestCorrection: false,
    canResolveOwnExpenseConflict: false,
  });
  const members = [
    {
      id: id(5),
      displayName: "Lin Chen",
      role: "member",
      status: "unlinked",
      capabilities,
      updatedAt: "2026-11-01T00:00:00Z",
      isParticipating: true,
      participationRevision: 0,
    },
  ];
  const wire = {
    journey: { id: trip },
    members,
    participationSnapshot: {
      contractVersion: 1,
      complete: true,
      personCount: 1,
      fingerprintVersion: 1,
      fingerprint: sha(serializeParticipationVector(members)),
      observedAt: "2026-11-01T00:00:00.000000Z",
    },
    expenses: [{ privateFinancialMarker: "NEVER_EXPOSE_TO_PEOPLE_TOOL" }],
    globalAKA: ["PRIVATE_PROFILE_NOT_VISIBLE"],
  };
  const tools = createDomainAdapters({
    ...context(async (q) => {
      expect(q.headers).toEqual({ "X-Review-Protocol": "2" });
      return Response.json(wire);
    }),
    enabled: ["PEOPLE_READ"],
  });
  const roster = await tools.list_trip_people({ trip_id: trip });
  expect(roster).toMatchObject({
    revision: null,
    name_scope: "TRIP_DISPLAY_NAMES_ONLY",
    people: [
      {
        person_id: id(5),
        display_name: "Lin Chen",
        confirmed_visible_aka: [],
        participation_active: true,
      },
    ],
  });
  expect(JSON.stringify(roster)).not.toContain("NEVER_EXPOSE");
  expect(JSON.stringify(roster)).not.toContain("PRIVATE_PROFILE");
  await expect(tools.list_trip_people({ trip_id: id(99) })).rejects.toThrow(
    "ROSTER_SCOPE_OR_COMPLETENESS_MISMATCH",
  );
  const tampered = createDomainAdapters({
    ...context(async () =>
      Response.json({ ...wire, members: [{ ...members[0], participationRevision: 9 }] }),
    ),
    enabled: ["PEOPLE_READ"],
  });
  await expect(tampered.list_trip_people({ trip_id: trip })).rejects.toThrow(
    "ROSTER_FINGERPRINT_MISMATCH",
  );
});

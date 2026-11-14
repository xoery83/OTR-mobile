import { z } from "zod";
import type { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import {
  createDomainAdapters,
  prepareMetadata,
  prepareTraveler,
  prepareExpenseCreate,
  prepareExpenseUpdate,
  expenseCreateInput,
  expenseUpdateInput,
  metadataReadInput,
  expenseListInput,
  travelerStatusInput,
  type DomainBackend,
  type DomainPermission,
  type ExpenseRecovery,
  type DomainBinding,
} from "./domainAdapter";
import {
  structuredTripMetadataUpdateSchema,
  structuredTripMetadataSnapshotSchema,
  structuredTripMetadataSchema,
} from "../src/domain/trip/tripStructuredDestinationContract";
import { localTripDestinationInputSchema } from "../src/domain/trip/localTripDestination";
import {
  tripMetadataV2UpdateSchema,
  tripMetadataV2SnapshotSchema,
  tripMetadataRevisionedUpdateSchema,
} from "../src/domain/trip/tripMetadataV2Contract";
import { personCloudCreateSchema } from "../src/domain/trip/tripPersonCloudCreate";
import { ledgerExpenseListResponseSchema } from "../src/data/api/ledgerReadContracts";
import type { ConfirmChanges } from "./mutation";
import { rosterContract } from "./peopleExpenseAdapter";

export type TaskDomainBinding = {
  backend: DomainBackend;
  enabled: readonly DomainPermission[];
  // Signed OTR business permissions, never the OAuth provider request scopes.
  requiredScopes: Partial<Record<DomainPermission, readonly string[]>>;
  expenseRecovery?: (
    binding: DomainBinding,
    signal: AbortSignal,
  ) => Promise<ExpenseRecovery>;
};
export type DomainIdentity = {
  accountId: string;
  clientId: string;
  resource: string;
  scopes: readonly string[];
  expiresAt: number;
};
export type BindTaskDomains = (
  identity: DomainIdentity,
  signal: AbortSignal,
) => Promise<TaskDomainBinding | null>;
const action = {
  mode: z.enum(["PREVIEW", "APPLY"]).default("PREVIEW"),
  preview_digest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
};
// Discovery cannot serialize Zod transforms. Owning parsers still normalize/validate every actual request/result.
const metadataWire = structuredTripMetadataSchema.safeExtend({
  destinations: z.array(localTripDestinationInputSchema).max(20),
});
const metadataUpdateWire = z.union([
  structuredTripMetadataUpdateSchema.safeExtend({
    before: metadataWire,
    after: metadataWire,
  }),
  tripMetadataV2UpdateSchema,
]);
const metadataSnapshotWire = z.union([
  structuredTripMetadataSnapshotSchema.safeExtend({ metadata: metadataWire }),
  tripMetadataV2SnapshotSchema,
]);
const resultSchema = z.object({
  version: z.string(),
  domain: z.enum(["METADATA", "TRAVELER", "EXPENSE"]),
  trip_id: z.uuid(),
  command_id: z.string(),
  preview_digest: z.string(),
  operation_id: z.string().nullable(),
  current_revision: z.number().int().nonnegative().nullable(),
  target_id: z.string().optional(),
  participation_revision: z.number().int().nonnegative().optional(),
  request: z.unknown().optional(),
  disposition: z.string().optional(),
  outcome: z.enum([
    "PREVIEW",
    "APPLIED",
    "NO_CHANGE",
    "CONFLICT",
    "UNKNOWN",
    "REJECTED",
    "NEEDS_CONFIRMATION",
    "BLOCKED",
  ]),
  error_code: z.string().optional(),
});
const statusSchema = z.object({
  domain: z.enum(["METADATA", "TRAVELER"]),
  command_id: z.string(),
  operation_id: z.string().optional(),
  target_id: z.string().optional(),
  outcome: z.enum(["APPLIED", "UNKNOWN"]),
  current_revision: z.number().int().nonnegative().nullable(),
  participation_revision: z.number().int().nonnegative().optional(),
  error_code: z.string().optional(),
});

// No default domain grants/scopes. The owning host must bind consent + actor-scoped ports explicitly.
export async function registerTaskDomainTools(
  server: McpServer,
  identity: DomainIdentity,
  bind: BindTaskDomains,
  signal: AbortSignal,
  providerPolicy: { read: readonly string[]; write?: readonly string[] },
  confirm?: ConfirmChanges,
  expiredChallenge?: (readOnly: boolean) => CallToolResult,
): Promise<{
  names: string[];
  readExpenses?: ReturnType<typeof createDomainAdapters>["list_expenses"];
  readRoster?: ReturnType<typeof createDomainAdapters>["list_trip_people"];
}> {
  identity = Object.freeze({ ...identity, scopes: Object.freeze([...identity.scopes]) });
  if (!identity.clientId || identity.expiresAt <= Date.now() || signal.aborted)
    return { names: [] as string[] };
  const binding = await bind(identity, signal);
  if (!binding || identity.expiresAt <= Date.now() || signal.aborted)
    return { names: [] as string[] };
  const enabled = binding.enabled.filter((kind) => {
    const required = binding.requiredScopes[kind];
    return (
      (!["METADATA", "TRAVELER", "EXPENSE"].includes(kind) || !!providerPolicy.write) &&
      (kind !== "EXPENSE" || !!binding.expenseRecovery) &&
      required?.length &&
      required.every((scope) => identity.scopes.includes(scope))
    );
  });
  const tools = createDomainAdapters({
    ...identity,
    enabled,
    backend: binding.backend,
    expenseRecovery: binding.expenseRecovery,
    confirm,
    signal,
  });
  const authFailure = (readOnly: boolean) =>
    expiredChallenge?.(readOnly) ?? {
      isError: true,
      content: [{ type: "text" as const, text: "AUTH_REQUIRED" }],
    };
  function recovery(name: string, args: unknown) {
    try {
      let prepared;
      if (name === "update_trip") {
        const q = z
          .strictObject({ ...action, request: tripMetadataRevisionedUpdateSchema })
          .parse(args);
        if (q.mode !== "APPLY") return null;
        prepared = prepareMetadata(q.request);
      } else if (name === "create_trip_traveler") {
        const q = z
          .strictObject({ ...action, request: personCloudCreateSchema })
          .parse(args);
        if (q.mode !== "APPLY") return null;
        prepared = prepareTraveler(q.request);
      } else if (name === "create_expense") {
        const q = expenseCreateInput.extend(action).parse(args);
        if (q.mode !== "APPLY") return null;
        const { mode: _mode, preview_digest: _digest, ...request } = q;
        prepared = prepareExpenseCreate(request);
      } else if (name === "update_expense") {
        const q = expenseUpdateInput.extend(action).parse(args);
        if (q.mode !== "APPLY") return null;
        const { mode: _mode, preview_digest: _digest, ...request } = q;
        prepared = prepareExpenseUpdate(request);
      } else return null;
      return {
        version: "otr.mcp.domain/1",
        domain: prepared.kind,
        trip_id: prepared.tripId,
        command_id: prepared.commandId,
        operation_id: prepared.kind === "EXPENSE" ? null : prepared.commandId,
        current_revision: null,
        preview_digest: tools.binding(prepared).digest,
        outcome: "UNKNOWN",
        error_code: "AUTH_REQUIRED_QUERY_ORIGINAL_COMMAND",
      };
    } catch {
      return null;
    }
  }
  const registered: string[] = [];
  const definitions = [
    [
      "list_trip_people",
      "PEOPLE_READ",
      z.strictObject({ trip_id: z.uuid() }),
      rosterContract,
      true,
      "Read authorized Trip display names/stable Person IDs and participation through the existing verified Bootstrap roster. No private document names, nickname/AKA or Account linking authority. View fingerprint is not a permission grant.",
      tools.list_trip_people,
    ],
    [
      "get_trip_metadata_operation",
      enabled.includes("METADATA_READ") ? "METADATA_READ" : "METADATA",
      metadataReadInput,
      statusSchema,
      true,
      "Read the original Trip metadata operation receipt before recovery. UNKNOWN/not-visible is not proof of no commit.",
      tools.get_metadata_operation,
    ],
    [
      "get_traveler_operation",
      "TRAVELER",
      travelerStatusInput,
      statusSchema,
      true,
      "Read the original Add Traveler receipt using the same Trip/operation ID. Does not create a Person or grant an Account connection.",
      tools.get_traveler_operation,
    ],
    [
      "get_trip_metadata",
      "METADATA_READ",
      metadataReadInput,
      metadataSnapshotWire,
      true,
      "Read formal Trip metadata revision/destinations with an authorized operation binding; no guessed revision.",
      tools.get_trip_metadata,
    ],
    [
      "list_expenses",
      "EXPENSE_READ",
      expenseListInput,
      ledgerExpenseListResponseSchema,
      true,
      "Read authorized existing Expenses and original currency before proposing costs; follow every cursor.",
      tools.list_expenses,
    ],
    [
      "update_trip",
      "METADATA",
      z.strictObject({ ...action, request: metadataUpdateWire }),
      resultSchema,
      false,
      "Preview/update Trip name, dates and destinations using formal before/after and expected metadata revision. Exact trusted confirmation required.",
      async (raw: unknown) => {
        const q = z
          .strictObject({ ...action, request: tripMetadataRevisionedUpdateSchema })
          .parse(raw);
        return tools.execute(prepareMetadata(q.request), q.mode, q.preview_digest);
      },
    ],
    [
      "create_trip_traveler",
      "TRAVELER",
      z.strictObject({ ...action, request: personCloudCreateSchema }),
      resultSchema,
      false,
      "Preview/add one confirmed new unlinked traveler using existing Trip creation authority. Never connects an Account, sends Invite or writes AKA.",
      async (raw: unknown) => {
        const q = z
          .strictObject({ ...action, request: personCloudCreateSchema })
          .parse(raw);
        return tools.execute(prepareTraveler(q.request), q.mode, q.preview_digest);
      },
    ],
    [
      "create_expense",
      "EXPENSE",
      expenseCreateInput.extend(action),
      resultSchema,
      false,
      "Preview/create one Expense from confirmed original money, payer and exact split. OTR constructs its Ledger envelope. Owning operation recovery required; no Item link or payment inferred.",
      async (raw: unknown) => {
        const q = expenseCreateInput.extend(action).parse(raw);
        const { mode, preview_digest, ...request } = q;
        return tools.execute(prepareExpenseCreate(request), mode, preview_digest);
      },
    ],
    [
      "update_expense",
      "EXPENSE",
      expenseUpdateInput.extend(action),
      resultSchema,
      false,
      "Preview/edit changed Expense field groups using the unchanged authorized base_expense. Preserve unrelated fields; no silent rebase, settlement or payment inference.",
      async (raw: unknown) => {
        const q = expenseUpdateInput.extend(action).parse(raw);
        const { mode, preview_digest, ...request } = q;
        return tools.execute(prepareExpenseUpdate(request), mode, preview_digest);
      },
    ],
  ] as const;
  for (const [
    name,
    permission,
    inputSchema,
    outputSchema,
    readOnlyHint,
    description,
    run,
  ] of definitions) {
    if (!enabled.includes(permission as DomainPermission)) continue;
    registered.push(name);
    server.registerTool(
      name,
      {
        inputSchema,
        outputSchema,
        description,
        _meta: {
          securitySchemes: [
            {
              type: "oauth2",
              scopes: readOnlyHint ? providerPolicy.read : providerPolicy.write,
            },
          ],
        },
        annotations: {
          readOnlyHint,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: unknown): Promise<CallToolResult> => {
        if (identity.expiresAt <= Date.now() || signal.aborted)
          return authFailure(readOnlyHint);
        try {
          const result = await run(args);
          if (identity.expiresAt <= Date.now() || signal.aborted) {
            const original = recovery(name, args);
            return original
              ? {
                  ...authFailure(readOnlyHint),
                  content: [{ type: "text", text: JSON.stringify(original) }],
                  structuredContent: original,
                }
              : authFailure(readOnlyHint);
          }
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch {
          if (identity.expiresAt <= Date.now() || signal.aborted) {
            const original = recovery(name, args);
            return original
              ? {
                  ...authFailure(readOnlyHint),
                  content: [{ type: "text", text: JSON.stringify(original) }],
                  structuredContent: original,
                }
              : authFailure(readOnlyHint);
          }
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "DOMAIN_OPERATION_UNAVAILABLE_QUERY_ORIGINAL_COMMAND",
              },
            ],
          };
        }
      },
    );
  }
  return {
    names: registered,
    ...(enabled.includes("EXPENSE_READ") ? { readExpenses: tools.list_expenses } : {}),
    ...(enabled.includes("PEOPLE_READ") ? { readRoster: tools.list_trip_people } : {}),
  };
}

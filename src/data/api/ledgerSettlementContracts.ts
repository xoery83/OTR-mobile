import { z } from "zod";

import { isIso4217Money } from "@/domain/ledger/currency";

const uuid = z.uuid();
const money = z
  .object({
    minor: z.number().int(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    scale: z.number().int().min(0).max(4),
  })
  .refine((value) => isIso4217Money(value.currency, value.scale));
const member = z.object({
  memberId: uuid,
  displayNameSnapshot: z.string().min(1).max(200),
});
const balance = z.object({
  memberId: uuid,
  currency: z.string().regex(/^[A-Z]{3}$/),
  scale: z.number().int().min(0).max(4),
  displayNameSnapshot: z.string().min(1).max(200),
  paidMinor: z.number().int().nonnegative(),
  owedMinor: z.number().int().nonnegative(),
  transferredMinor: z.literal(0),
  netMinor: z.number().int(),
});
const transfer = z.object({
  fromMemberId: uuid,
  toMemberId: uuid,
  amount: money,
});
const input = z.object({
  expenseId: uuid,
  expenseRevision: z.number().int().positive(),
  payer: member,
  original: money,
  settlement: money,
  valuation: z.object({
    id: uuid,
    policy: z.enum([
      "REFERENCE_RATE",
      "ACTUAL_PAYER_COST",
      "MANUAL_AGREED",
      "SAME_CURRENCY",
      "LEGACY_IMPORTED",
    ]),
    rateSnapshotId: uuid.nullable(),
    paymentRecordId: uuid.nullable(),
    decimalRate: z.string().nullable(),
    roundingMode: z.literal("HALF_UP"),
  }),
  splits: z.array(
    z.object({
      member,
      originalMinor: z.number().int().nonnegative(),
      settlementMinor: z.number().int().nonnegative(),
      roundingAdjustmentMinor: z.number().int().min(-1).max(1),
    }),
  ),
});

export const settlementPreviewRequestSchema = z.object({
  throughTimestamp: z.iso.datetime({ offset: true }),
});

export const settlementFinalizeRequestSchema = settlementPreviewRequestSchema.extend({
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

export const settlementPreviewSchema = z.object({
  state: z.enum(["PREVIEW_BLOCKED", "PREVIEW_READY"]),
  journeyId: uuid,
  throughTimestamp: z.string(),
  settlementCurrency: z.string().regex(/^[A-Z]{3}$/),
  settlementScale: z.number().int().min(0).max(4),
  settingsRevision: z.number().int().positive(),
  algorithmVersion: z.literal("ledger-settlement-greedy-v1"),
  members: z.array(member),
  inputs: z.array(input),
  blockers: z.array(
    z.object({
      expenseId: uuid,
      reason: z.enum(["OPEN_CONFLICT", "RATE_REQUIRED"]),
    }),
  ),
  exclusions: z.array(
    z.object({ expenseId: uuid, reason: z.enum(["DELETED", "DRAFT"]) }),
  ),
  balances: z.array(balance),
  transfers: z.array(transfer),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

export const finalizedSettlementSchema = z.object({
  id: uuid,
  journeyId: uuid,
  status: z.literal("FINALIZED"),
  throughTimestamp: z.string(),
  settlementCurrency: z.string().regex(/^[A-Z]{3}$/),
  settlementScale: z.number().int().min(0).max(4),
  settingsRevision: z.number().int().positive(),
  algorithmVersion: z.literal("ledger-settlement-greedy-v1"),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  revision: z.number().int().positive(),
  finalizedBy: uuid,
  finalizedAt: z.string(),
  inputs: z.array(input),
  balances: z.array(balance),
  transfers: z.array(
    z.object({
      id: uuid,
      fromMemberId: uuid,
      toMemberId: uuid,
      amount: money,
      status: z.literal("OPEN"),
      revision: z.number().int().positive(),
    }),
  ),
  auditEvents: z.array(
    z.object({
      id: uuid,
      eventType: z.literal("FINALIZED"),
      actorUserId: uuid,
      actorMemberId: uuid,
      reason: z.string().nullable(),
      revision: z.number().int().positive(),
      createdAt: z.string(),
    }),
  ),
});

export const settlementFinalizeResponseSchema = z.object({
  entity: finalizedSettlementSchema,
  idempotentReplay: z.boolean(),
});

export type SettlementPreviewResponse = z.infer<typeof settlementPreviewSchema>;
export type FinalizedSettlementDto = z.infer<typeof finalizedSettlementSchema>;
export type SettlementFinalizeResponse = z.infer<typeof settlementFinalizeResponseSchema>;

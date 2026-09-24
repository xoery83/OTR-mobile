import { z } from "zod";

const positiveDecimal = z.string().regex(/^(?=.*[1-9])\d+(?:\.\d+)?$/);
const currency = z.string().regex(/^[A-Z]{3}$/);

export const ledgerFxReferenceSnapshotSchema = z
  .object({
    referenceDate: z.iso.date(),
    rates: z.record(currency, positiveDecimal),
    observedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .refine((snapshot) => /^1(?:\.0+)?$/.test(snapshot.rates.EUR ?? ""), {
    message: "The EUR anchor rate must equal one.",
  });

export const ledgerFxReferenceSnapshotBundleSchema = z
  .object({
    provider: z.literal("ECB"),
    policyVersion: z.literal("ECB_LOCAL_SNAPSHOT_V1"),
    baseCurrency: z.literal("EUR"),
    snapshots: z.array(ledgerFxReferenceSnapshotSchema).min(1).max(32),
    sourceReference: z.url(),
    providerReference: z.url(),
  })
  .superRefine((bundle, context) => {
    const dates = bundle.snapshots.map((snapshot) => snapshot.referenceDate);
    if (new Set(dates).size !== dates.length)
      context.addIssue({ code: "custom", message: "Snapshot dates must be unique." });
    if (dates.some((date, index) => index > 0 && date >= dates[index - 1]))
      context.addIssue({
        code: "custom",
        message: "Snapshots must be ordered newest first.",
      });
  });

export type LedgerFxReferenceSnapshot = z.infer<typeof ledgerFxReferenceSnapshotSchema>;
export type LedgerFxReferenceSnapshotBundle = z.infer<
  typeof ledgerFxReferenceSnapshotBundleSchema
>;

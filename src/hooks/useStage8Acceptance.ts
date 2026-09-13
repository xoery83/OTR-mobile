import { useEffect, useState } from "react";

import { signInToSupabaseDev } from "@/data/auth/devSupabaseAuth";
import { openDatabase } from "@/data/db/database";
import { enforceReceiptCacheLimit } from "@/data/operations/ledgerMaintenance";
import { getDefaultLedgerReviewRepository } from "@/data/repositories/defaultLedgerReviewRepository";
import { createLedgerReviewTransport } from "@/data/sync/ledgerReviewTransport";

export type Stage8Check = { name: string; ok: boolean; detail: string };

export function useStage8Acceptance(
  identity: "organizer" | "creator",
  maintenance = false,
) {
  const [checks, setChecks] = useState<Stage8Check[]>([]);

  useEffect(() => {
    let cancelled = false;
    const record = (name: string, ok: boolean, detail: string) => {
      if (!cancelled) setChecks((items) => [...items, { name, ok, detail }]);
      if (!ok) throw new Error(`${name}: ${detail}`);
    };
    void Promise.resolve()
      .then(async () => {
        const email =
          (identity === "creator"
            ? process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_EMAIL
            : process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_EMAIL) ?? "";
        const password =
          (identity === "creator"
            ? process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_PASSWORD
            : process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_PASSWORD) ?? "";
        const journeyId = process.env.EXPO_PUBLIC_OTR_DEV_TRIP_ID ?? "";
        if (!email || !password || !journeyId)
          throw new Error("Missing Dev acceptance config.");
        await signInToSupabaseDev(email, password);
        record("authenticated identity", true, identity);

        const response = await createLedgerReviewTransport().refresh(journeyId);
        const repository = await getDefaultLedgerReviewRepository();
        await repository.apply(response.findings, response.actions);
        const local = await repository.list(journeyId);
        record(
          "Review findings converged",
          local.length === response.findings.length,
          `${local.length}`,
        );
        record(
          "actor audit converged",
          response.actions.length > 0,
          `${response.actions.length}`,
        );
        record(
          "advisory-only findings",
          response.findings.every((finding) => finding.layer === "HEURISTIC"),
          `${response.findings.length} heuristic`,
        );
        if (maintenance) {
          const database = await openDatabase();
          const before = await database.getFirstAsync<{
            bytes: number;
            protected: number;
          }>(
            `SELECT COALESCE(SUM(CASE WHEN local_uri IS NOT NULL THEN size_bytes ELSE 0 END), 0) bytes,
              SUM(CASE WHEN local_uri IS NOT NULL AND upload_status <> 'UPLOADED' THEN 1 ELSE 0 END) protected
             FROM ledger_receipt_assets`,
          );
          const result = await enforceReceiptCacheLimit(
            database,
            Math.max(0, Number(before?.bytes ?? 0) - 1),
          );
          const after = await database.getFirstAsync<{ protected: number }>(
            `SELECT SUM(CASE WHEN local_uri IS NOT NULL AND upload_status <> 'UPLOADED' THEN 1 ELSE 0 END) protected
             FROM ledger_receipt_assets`,
          );
          record(
            "authenticated receipt recovery gate enforced",
            Number(before?.bytes ?? 0) === 0 ||
              result.evictedCount + result.recoveryUnavailableCount > 0,
            `${result.evictedCount} evicted · ${result.recoveryUnavailableCount} preserved`,
          );
          record(
            "non-reconstructible receipt originals preserved",
            Number(after?.protected ?? 0) === Number(before?.protected ?? 0),
            `${Number(after?.protected ?? 0)} protected`,
          );
        }
      })
      .catch((error) => {
        if (!cancelled)
          setChecks((items) => [
            ...items,
            {
              name: "Stage 8 acceptance stopped",
              ok: false,
              detail: error instanceof Error ? error.message : "unknown failure",
            },
          ]);
      });
    return () => {
      cancelled = true;
    };
  }, [identity, maintenance]);

  return checks;
}

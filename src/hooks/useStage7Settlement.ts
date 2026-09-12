import { useEffect, useState } from "react";

import type {
  FinalizedSettlementDto,
  SettlementPreviewResponse,
} from "@/data/api/ledgerSettlementContracts";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import { refreshJourneyLedger } from "@/data/sync/ledgerReportingCoordinator";
import { runLedgerSettlementPaymentSync } from "@/data/sync/ledgerSettlementPaymentCoordinator";
import type { RepaymentProposition } from "@/domain/ledger/paymentLifecycle";
import {
  finalizeSettlement,
  previewSettlement,
} from "@/data/sync/ledgerSettlementCoordinator";

export type Stage7Preview = SettlementPreviewResponse;
export type Stage7Finalized = FinalizedSettlementDto;

export function useStage7Settlement(journeyId?: string) {
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const activeJourneyId = journeyId ?? selectedJourneyId ?? undefined;
  const [preview, setPreview] = useState<Stage7Preview | null>(null);
  const [finalized, setFinalized] = useState<Stage7Finalized | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actorMemberId, setActorMemberId] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);

  useEffect(() => {
    if (journeyId) return;
    let active = true;
    void getDefaultLedgerReportingRepository()
      .then((repository) => repository.getSelectedJourneyId())
      .then((id) => {
        if (active) setSelectedJourneyId(id);
      });
    return () => {
      active = false;
    };
  }, [journeyId]);

  useEffect(() => {
    let active = true;
    const load = () =>
      activeJourneyId
        ? getDefaultLedgerSettlementRepository().then((repository) =>
            repository.listFinalized(activeJourneyId),
          )
        : Promise.resolve([]);
    void load()
      .then((rows) => {
        if (active) {
          setPreview(null);
          setMessage(null);
          setFinalized(rows[0] ?? null);
        }
        if (activeJourneyId)
          void getDefaultLedgerSettlementRepository()
            .then(async (repository) => ({
              memberId: await repository.getActorMemberId(activeJourneyId),
              isOrganizer: await repository.isOrganizer(activeJourneyId),
            }))
            .then((actor) => {
              if (active) {
                setActorMemberId(actor.memberId);
                setIsOrganizer(actor.isOrganizer);
              }
            });
        if (activeJourneyId)
          return refreshJourneyLedger(activeJourneyId)
            .then(load)
            .then((refreshed) => {
              if (active) setFinalized(refreshed[0] ?? null);
            });
      })
      .catch(() => {
        if (active) setMessage("Offline · showing cached Settlement data");
      });
    return () => {
      active = false;
    };
  }, [activeJourneyId]);

  return {
    busy,
    actorMemberId,
    isOrganizer,
    finalized,
    message,
    preview,
    journeyId: activeJourneyId,
    async prepare() {
      if (!activeJourneyId) return;
      setBusy(true);
      setMessage(null);
      try {
        setPreview(await previewSettlement(activeJourneyId, new Date().toISOString()));
      } catch (error) {
        setPreview(null);
        setMessage(error instanceof Error ? error.message : "Settlement preview failed.");
      } finally {
        setBusy(false);
      }
    },
    async finalize(ready: Stage7Preview) {
      setBusy(true);
      setMessage(null);
      try {
        const response = await finalizeSettlement(
          ready.journeyId,
          ready.throughTimestamp,
          ready.inputDigest,
        );
        setFinalized(response.entity);
        setPreview(null);
        setMessage("Settlement finalized from canonical server state.");
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Settlement finalization failed.",
        );
      } finally {
        setBusy(false);
      }
    },
    async recordPayment(
      transferId: string,
      proposition: RepaymentProposition & {
        paidAt: string;
        evidenceAssetId: string | null;
        notes: string | null;
        reason?: string | null;
      },
    ) {
      setBusy(true);
      try {
        const repository = await getDefaultLedgerSettlementRepository();
        await repository.recordPayment(transferId, proposition);
        setFinalized((await repository.listFinalized(activeJourneyId!))[0] ?? null);
        await runLedgerSettlementPaymentSync();
        setFinalized((await repository.listFinalized(activeJourneyId!))[0] ?? null);
        setMessage("Paid saved. Debt changes only after Received confirmation.");
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Payment could not be saved.",
        );
      } finally {
        setBusy(false);
      }
    },
    async actOnPayment(
      paymentId: string,
      action: "confirm" | "reject" | "dispute",
      reason: string | null,
      authority?: "PAYER" | "RECIPIENT" | "ORGANIZER_OVERRIDE",
    ) {
      setBusy(true);
      try {
        const repository = await getDefaultLedgerSettlementRepository();
        await repository.queuePaymentAction(paymentId, action, reason, authority);
        await runLedgerSettlementPaymentSync();
        setFinalized((await repository.listFinalized(activeJourneyId!))[0] ?? null);
        setMessage(
          action === "confirm"
            ? "Received confirmation saved."
            : `${action === "reject" ? "Rejection" : "Dispute"} saved.`,
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Payment action failed.");
      } finally {
        setBusy(false);
      }
    },
    async correctPayment(
      paymentId: string,
      proposition: RepaymentProposition & {
        paidAt: string;
        evidenceAssetId: string | null;
        notes: string | null;
      },
      reason: string,
    ) {
      setBusy(true);
      try {
        const repository = await getDefaultLedgerSettlementRepository();
        await repository.correctPayment(paymentId, proposition, reason);
        setFinalized((await repository.listFinalized(activeJourneyId!))[0] ?? null);
        await runLedgerSettlementPaymentSync();
        setFinalized((await repository.listFinalized(activeJourneyId!))[0] ?? null);
        setMessage("Organizer correction saved as a new Payment fact.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Correction failed.");
      } finally {
        setBusy(false);
      }
    },
  };
}

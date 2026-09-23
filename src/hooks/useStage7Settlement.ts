import { useCallback, useEffect, useRef, useState } from "react";
import { useNetworkState } from "expo-network";

import type {
  FinalizedSettlementDto,
  SettlementAdjustmentPreviewResponse,
  SettlementPreviewResponse,
} from "@/data/api/ledgerSettlementContracts";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import { refreshJourneyLedger } from "@/data/sync/ledgerReportingCoordinator";
import { runLedgerSettlementPaymentSync } from "@/data/sync/ledgerSettlementPaymentCoordinator";
import {
  generateCurrentSettlementExport,
  listSettlementExports,
  shareSettlementExport,
} from "@/data/sync/ledgerExportCoordinator";
import type {
  SettlementExportFormat,
  SettlementExportManifest,
} from "@/data/repositories/ledgerExportRepository";
import type { SettlementExportPrivacy } from "@/domain/ledger/settlementExport";
import type { RepaymentProposition } from "@/domain/ledger/paymentLifecycle";
import {
  finalizeSettlement,
  preflightSettlementFx,
  previewSettlementAdjustment,
  previewSettlement,
  queueSettlementAdjustment,
} from "@/data/sync/ledgerSettlementCoordinator";
import { loadEstimatedSettlement } from "@/features/ledger/loadEstimatedSettlement";
import { unpublishedEstimateMessage } from "@/features/ledger/estimatedSettlement";
import { settlementCacheMessage } from "@/features/ledger/settlementSections";

type DisplayPreview = Awaited<ReturnType<typeof loadEstimatedSettlement>>;

export type Stage7Preview = SettlementPreviewResponse;
export type Stage7Finalized = FinalizedSettlementDto;

export function useStage7Settlement(journeyId?: string) {
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const activeJourneyId = journeyId ?? selectedJourneyId ?? undefined;
  const activeJourneyRef = useRef(activeJourneyId);
  const [loadedJourneyId, setLoadedJourneyId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [preview, setPreview] = useState<Stage7Preview | null>(null);
  const [displayPreview, setDisplayPreview] = useState<DisplayPreview | null>(null);
  const [unavailableExpenseIds, setUnavailableExpenseIds] = useState<Set<string>>(
    new Set(),
  );
  const [pendingPublicationExpenseIds, setPendingPublicationExpenseIds] = useState<
    Set<string>
  >(new Set());
  const [hasPendingFinancialOperations, setHasPendingFinancialOperations] =
    useState(false);
  const [finalized, setFinalized] = useState<Stage7Finalized | null>(null);
  const [lineage, setLineage] = useState<Stage7Finalized[]>([]);
  const [adjustmentPreview, setAdjustmentPreview] =
    useState<SettlementAdjustmentPreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actorMemberId, setActorMemberId] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [exports, setExports] = useState<
    (SettlementExportManifest & { isCurrent: boolean })[]
  >([]);
  const applyFinalizedRows = useCallback(
    (rows: Stage7Finalized[], forJourney = activeJourneyId) => {
      if (forJourney !== activeJourneyRef.current) return;
      const root = rows.find((row) => row.kind !== "ADJUSTMENT") ?? rows[0] ?? null;
      setFinalized(root);
      setLineage(
        root
          ? rows
              .filter((row) => row.id === root.id || row.rootSettlementId === root.id)
              .sort(
                (left, right) =>
                  (left.lineageSequence ?? 0) - (right.lineageSequence ?? 0),
              )
          : [],
      );
    },
    [activeJourneyId],
  );

  useEffect(() => {
    activeJourneyRef.current = activeJourneyId;
  }, [activeJourneyId]);

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
    void Promise.resolve().then(async () => {
      if (!active) return;
      setUpdating(Boolean(activeJourneyId));
      setMessage(null);
      if (!activeJourneyId) {
        setLoadedJourneyId(null);
        setUpdating(false);
        return;
      }
      const load = async () => {
        const repository = await getDefaultLedgerSettlementRepository();
        const [rows, items, memberId, organizer, pendingFinancialOperations] =
          await Promise.all([
            repository.listFinalized(activeJourneyId),
            listSettlementExports(activeJourneyId),
            repository.getActorMemberId(activeJourneyId),
            repository.isOrganizer(activeJourneyId),
            repository.hasPendingFinancialOperations(activeJourneyId),
          ]);
        return { rows, items, memberId, organizer, pendingFinancialOperations };
      };
      try {
        const cached = await load();
        if (!active) return;
        setPreview(null);
        setDisplayPreview(null);
        setUnavailableExpenseIds(new Set());
        setPendingPublicationExpenseIds(new Set());
        setAdjustmentPreview(null);
        applyFinalizedRows(cached.rows);
        setExports(cached.items);
        setActorMemberId(cached.memberId);
        setIsOrganizer(cached.organizer);
        setHasPendingFinancialOperations(cached.pendingFinancialOperations);
        setLoadedJourneyId(activeJourneyId);
        try {
          const display = await loadEstimatedSettlement(activeJourneyId);
          if (active) setDisplayPreview(display);
        } catch {
          // A newly opened Journey may not exist locally until bootstrap completes below.
        }
        if (cached.organizer) {
          const rates = await preflightSettlementFx(activeJourneyId, true);
          if (active) {
            setUnavailableExpenseIds(rates.unavailable);
            setPendingPublicationExpenseIds(rates.pendingPublication);
          }
        }
        await refreshJourneyLedger(activeJourneyId);
        const refreshed = await load();
        if (!active) return;
        applyFinalizedRows(refreshed.rows);
        setExports(refreshed.items);
        setActorMemberId(refreshed.memberId);
        setIsOrganizer(refreshed.organizer);
        setHasPendingFinancialOperations(refreshed.pendingFinancialOperations);
        setDisplayPreview(await loadEstimatedSettlement(activeJourneyId));
        if (refreshed.organizer) {
          try {
            const current = await previewSettlement(
              activeJourneyId,
              new Date().toISOString(),
            );
            if (active) setPreview(current);
            const root =
              refreshed.rows.find((row) => row.kind !== "ADJUSTMENT") ??
              refreshed.rows[0];
            if (root) {
              const adjustment = await previewSettlementAdjustment(
                activeJourneyId,
                root.id,
              );
              if (active) setAdjustmentPreview(adjustment);
            }
          } catch {
            // Local informational preview remains available offline or before queue drain.
          }
        }
      } catch {
        if (active) setMessage(settlementCacheMessage(online, "data"));
      } finally {
        if (active) setUpdating(false);
      }
    });
    return () => {
      active = false;
    };
  }, [activeJourneyId, applyFinalizedRows, online]);

  const matchesActiveJourney = loadedJourneyId === activeJourneyId;

  return {
    busy,
    updating,
    actorMemberId: matchesActiveJourney ? actorMemberId : null,
    isOrganizer: matchesActiveJourney && isOrganizer,
    exports: matchesActiveJourney ? exports : [],
    finalized: matchesActiveJourney ? finalized : null,
    lineage: matchesActiveJourney ? lineage : [],
    adjustmentPreview: matchesActiveJourney ? adjustmentPreview : null,
    message,
    preview: matchesActiveJourney ? preview : null,
    displayPreview: matchesActiveJourney ? displayPreview : null,
    unavailableExpenseIds: matchesActiveJourney ? unavailableExpenseIds : new Set(),
    pendingPublicationExpenseIds: matchesActiveJourney
      ? pendingPublicationExpenseIds
      : new Set<string>(),
    hasPendingFinancialOperations: matchesActiveJourney && hasPendingFinancialOperations,
    journeyId: activeJourneyId,
    async generateExport(
      format: SettlementExportFormat,
      privacyMode: SettlementExportPrivacy,
    ) {
      if (!activeJourneyId) return;
      const operationJourneyId = activeJourneyId;
      setBusy(true);
      setMessage(null);
      try {
        await generateCurrentSettlementExport(activeJourneyId, format, privacyMode);
        const repository = await getDefaultLedgerSettlementRepository();
        applyFinalizedRows(
          await repository.listFinalized(operationJourneyId),
          operationJourneyId,
        );
        const items = await listSettlementExports(operationJourneyId);
        if (operationJourneyId === activeJourneyRef.current) {
          setExports(items);
          setMessage(`${format} saved for offline use.`);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Export failed.");
      } finally {
        setBusy(false);
      }
    },
    async shareExport(manifest: SettlementExportManifest) {
      try {
        await shareSettlementExport(manifest);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Share failed.");
      }
    },
    async prepare() {
      if (!activeJourneyId) return;
      const operationJourneyId = activeJourneyId;
      setBusy(true);
      setMessage(null);
      try {
        if (isOrganizer) {
          const rates = await preflightSettlementFx(operationJourneyId, true);
          if (operationJourneyId === activeJourneyRef.current) {
            setUnavailableExpenseIds(rates.unavailable);
            setPendingPublicationExpenseIds(rates.pendingPublication);
          }
        }
        await refreshJourneyLedger(operationJourneyId);
        setDisplayPreview(await loadEstimatedSettlement(operationJourneyId));
        const next = await previewSettlement(
          operationJourneyId,
          new Date().toISOString(),
        );
        if (operationJourneyId === activeJourneyRef.current) setPreview(next);
      } catch (error) {
        setPreview(null);
        setMessage(error instanceof Error ? error.message : "Settlement preview failed.");
      } finally {
        setBusy(false);
      }
    },
    async finalize(ready: Stage7Preview) {
      const operationJourneyId = ready.journeyId;
      setBusy(true);
      setMessage(null);
      try {
        const rates = await preflightSettlementFx(operationJourneyId, true);
        if (operationJourneyId === activeJourneyRef.current) {
          setUnavailableExpenseIds(rates.unavailable);
          setPendingPublicationExpenseIds(rates.pendingPublication);
        }
        await refreshJourneyLedger(operationJourneyId);
        const current = await previewSettlement(
          operationJourneyId,
          new Date().toISOString(),
        );
        if (
          current.state !== "PREVIEW_READY" ||
          current.settingsRevision !== ready.settingsRevision ||
          JSON.stringify(current.inputs) !== JSON.stringify(ready.inputs)
        ) {
          if (operationJourneyId === activeJourneyRef.current) {
            setPreview(current);
            const display = await loadEstimatedSettlement(operationJourneyId);
            setDisplayPreview(display);
            setMessage(
              unpublishedEstimateMessage(
                rates.pendingPublication,
                display.estimatedServerIds,
              ) ??
                "Settlement values changed. Review the latest preview before finalizing.",
            );
          }
          return;
        }
        const response = await finalizeSettlement(
          current.journeyId,
          current.throughTimestamp,
          current.inputDigest,
        );
        if (operationJourneyId === activeJourneyRef.current) {
          setFinalized(response.entity);
          setLineage([response.entity]);
          setPreview(null);
          setDisplayPreview(null);
          setMessage("Final settlement saved from the latest group record.");
        }
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Settlement finalization failed.",
        );
      } finally {
        setBusy(false);
      }
    },
    async prepareAdjustment() {
      if (!activeJourneyId || !finalized) return;
      const operationJourneyId = activeJourneyId;
      setBusy(true);
      setMessage(null);
      try {
        const next = await previewSettlementAdjustment(operationJourneyId, finalized.id);
        if (operationJourneyId === activeJourneyRef.current) setAdjustmentPreview(next);
      } catch (error) {
        setAdjustmentPreview(null);
        setMessage(error instanceof Error ? error.message : "Adjustment preview failed.");
      } finally {
        setBusy(false);
      }
    },
    async finalizeAdjustment(ready: SettlementAdjustmentPreviewResponse, reason: string) {
      if (!activeJourneyId || !finalized) return false;
      const operationJourneyId = activeJourneyId;
      setBusy(true);
      setMessage(null);
      try {
        await queueSettlementAdjustment(
          operationJourneyId,
          finalized.id,
          ready.expectedHeadId,
          ready.inputDigest,
          reason,
          ready.zeroTransfer,
        );
        await runLedgerSettlementPaymentSync();
        await refreshJourneyLedger(operationJourneyId);
        const rows = await (
          await getDefaultLedgerSettlementRepository()
        ).listFinalized(operationJourneyId);
        applyFinalizedRows(rows, operationJourneyId);
        if (operationJourneyId === activeJourneyRef.current) {
          setAdjustmentPreview(null);
          setMessage("Settlement update saved; offline work will sync later.");
        }
        return true;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Adjustment failed.");
        return false;
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
      const operationJourneyId = activeJourneyId;
      if (!operationJourneyId) return;
      setBusy(true);
      try {
        const repository = await getDefaultLedgerSettlementRepository();
        await repository.recordPayment(transferId, proposition);
        applyFinalizedRows(
          await repository.listFinalized(operationJourneyId),
          operationJourneyId,
        );
        await runLedgerSettlementPaymentSync();
        applyFinalizedRows(
          await repository.listFinalized(operationJourneyId),
          operationJourneyId,
        );
        if (operationJourneyId === activeJourneyRef.current)
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
      const operationJourneyId = activeJourneyId;
      if (!operationJourneyId) return;
      setBusy(true);
      try {
        const repository = await getDefaultLedgerSettlementRepository();
        await repository.queuePaymentAction(paymentId, action, reason, authority);
        await runLedgerSettlementPaymentSync();
        applyFinalizedRows(
          await repository.listFinalized(operationJourneyId),
          operationJourneyId,
        );
        if (operationJourneyId === activeJourneyRef.current)
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
      const operationJourneyId = activeJourneyId;
      if (!operationJourneyId) return;
      setBusy(true);
      try {
        const repository = await getDefaultLedgerSettlementRepository();
        await repository.correctPayment(paymentId, proposition, reason);
        applyFinalizedRows(
          await repository.listFinalized(operationJourneyId),
          operationJourneyId,
        );
        await runLedgerSettlementPaymentSync();
        applyFinalizedRows(
          await repository.listFinalized(operationJourneyId),
          operationJourneyId,
        );
        if (operationJourneyId === activeJourneyRef.current)
          setMessage("Organizer correction saved as a new payment record.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Correction failed.");
      } finally {
        setBusy(false);
      }
    },
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useNetworkState } from "expo-network";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { recoverMissingSettlementEconomicDates } from "@/data/health/defaultDataHealthCoordinator";

import type {
  FinalizedSettlementDto,
  SettlementAdjustmentPreviewResponse,
  SettlementPreviewResponse,
} from "@/data/api/ledgerSettlementContracts";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import {
  refreshJourneyLedger,
  revalidateJourneyLedger,
} from "@/data/sync/ledgerReportingCoordinator";
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
import { createLatestRequest } from "@/features/ledger/latestRequest";
import { settlementCacheMessage } from "@/features/ledger/settlementSections";
import {
  adjustmentMatchesCurrentProjection,
  currentSettlementSummaryProjection,
  markSettlementConfirmedHead,
  readSavedSettlementProjection,
  readSharedSettlementProjection,
  rememberSettlementProjection,
  savedSettlementSummaryProjection,
  settlementProjectionAfterConfirmation,
  shouldPublishSavedSettlementProjection,
  type SettlementSummaryProjection,
} from "@/features/ledger/settlementSummaryProjection";

type DisplayPreview = Awaited<ReturnType<typeof loadEstimatedSettlement>>;

export type Stage7Preview = SettlementPreviewResponse;
export type Stage7Finalized = FinalizedSettlementDto;

async function verifyCurrentSettlementSource(journeyId: string, preview: Stage7Preview) {
  let local = await loadEstimatedSettlement(journeyId, preview.sourceAsOf);
  if (local.canonicalSourceFingerprint !== preview.sourceFingerprint) {
    await revalidateJourneyLedger(journeyId);
    local = await loadEstimatedSettlement(journeyId, preview.sourceAsOf);
  }
  if (local.canonicalSourceFingerprint !== preview.sourceFingerprint)
    throw new Error(
      "Saved Ledger data does not yet match the current Settlement source.",
    );
  return local;
}

export function useStage7Settlement(journeyId?: string, reviewMode = false) {
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const activeJourneyId = journeyId ?? selectedJourneyId ?? undefined;
  const [accountGeneration] = useState(getAccountGeneration);
  const incoming = journeyId ? readSharedSettlementProjection(journeyId) : null;
  const savedIncoming =
    !reviewMode && journeyId ? readSavedSettlementProjection(journeyId) : null;
  const activeJourneyRef = useRef(activeJourneyId);
  const [projectionRequest] = useState(createLatestRequest);
  const [loadedJourneyId, setLoadedJourneyId] = useState<string | null>(
    incoming?.journeyId ?? null,
  );
  const loadedJourneyRef = useRef(incoming?.journeyId ?? null);
  const [reloadToken, setReloadToken] = useState(0);
  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);
  const [confirmationVerified, setConfirmationVerified] = useState(false);
  const [updating, setUpdating] = useState(Boolean(journeyId));
  const [preview, setPreview] = useState<Stage7Preview | null>(
    reviewMode ? (incoming?.preview ?? null) : null,
  );
  const [summaryProjection, setSummaryProjection] =
    useState<SettlementSummaryProjection | null>(
      reviewMode ? (incoming?.projection ?? null) : savedIncoming,
    );
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
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [actorMemberId, setActorMemberId] = useState<string | null>(
    reviewMode ? (incoming?.actorMemberId ?? null) : null,
  );
  const [isOrganizer, setIsOrganizer] = useState(
    reviewMode && (incoming?.isOrganizer ?? false),
  );
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
      setConfirmationVerified(false);
      setMessage(null);
      if (!activeJourneyId) {
        setLoadedJourneyId(null);
        setUpdating(false);
        return;
      }
      const projectionGeneration = projectionRequest.begin();
      const load = async () => {
        const repository = await getDefaultLedgerSettlementRepository();
        const [rows, items, memberId, organizer, pendingFinancialOperations] =
          await Promise.all([
            repository.listFinalized(activeJourneyId),
            reviewMode ? Promise.resolve([]) : listSettlementExports(activeJourneyId),
            repository.getActorMemberId(activeJourneyId),
            repository.isOrganizer(activeJourneyId),
            repository.hasPendingFinancialOperations(activeJourneyId),
          ]);
        return { rows, items, memberId, organizer, pendingFinancialOperations };
      };
      try {
        const cached = await load();
        if (!active || accountGeneration !== getAccountGeneration()) return;
        if (loadedJourneyRef.current !== activeJourneyId) {
          setPreview(null);
          setSummaryProjection(null);
          setDisplayPreview(null);
        }
        setUnavailableExpenseIds(new Set());
        setPendingPublicationExpenseIds(new Set());
        setAdjustmentPreview(null);
        applyFinalizedRows(cached.rows);
        setExports(cached.items);
        setActorMemberId(cached.memberId);
        setIsOrganizer(cached.organizer);
        setHasPendingFinancialOperations(cached.pendingFinancialOperations);
        setLoadedJourneyId(activeJourneyId);
        loadedJourneyRef.current = activeJourneyId;
        const root =
          cached.rows.find((row) => row.kind !== "ADJUSTMENT") ?? cached.rows[0];
        const confirmed =
          cached.rows.find((row) => row.rootSettlementId === root?.id) ?? root;
        try {
          const display = await loadEstimatedSettlement(activeJourneyId);
          if (
            active &&
            accountGeneration === getAccountGeneration() &&
            projectionRequest.isCurrent(projectionGeneration)
          ) {
            setDisplayPreview(display);
            const saved = cached.memberId
              ? savedSettlementSummaryProjection(
                  display,
                  confirmed ?? null,
                  cached.memberId,
                  cached.pendingFinancialOperations,
                )
              : null;
            const previous = readSharedSettlementProjection(activeJourneyId)?.projection;
            if (
              shouldPublishSavedSettlementProjection(
                previous,
                saved,
                display.canonicalSourceFingerprint,
              )
            ) {
              if (saved && cached.memberId)
                rememberSettlementProjection(
                  activeJourneyId,
                  cached.memberId,
                  cached.organizer,
                  saved,
                  null,
                );
              setSummaryProjection(saved);
            }
          }
        } catch {
          // A newly opened Journey may not exist locally until bootstrap completes below.
        }
        if (cached.organizer) {
          await recoverMissingSettlementEconomicDates(activeJourneyId).catch(
            () => undefined,
          );
          const rates = await preflightSettlementFx(activeJourneyId, true);
          if (active && accountGeneration === getAccountGeneration()) {
            setUnavailableExpenseIds(rates.unavailable);
            setPendingPublicationExpenseIds(rates.pendingPublication);
          }
        }
        await refreshJourneyLedger(activeJourneyId);
        const refreshed = await load();
        if (!active || accountGeneration !== getAccountGeneration()) return;
        applyFinalizedRows(refreshed.rows);
        setExports(refreshed.items);
        setActorMemberId(refreshed.memberId);
        setIsOrganizer(refreshed.organizer);
        setHasPendingFinancialOperations(refreshed.pendingFinancialOperations);
        const refreshedDisplay = await loadEstimatedSettlement(activeJourneyId);
        setDisplayPreview(refreshedDisplay);
        const refreshedRoot =
          refreshed.rows.find((row) => row.kind !== "ADJUSTMENT") ??
          refreshed.rows[0] ??
          null;
        const refreshedConfirmed =
          refreshed.rows.find((row) => row.rootSettlementId === refreshedRoot?.id) ??
          refreshedRoot;
        if (
          accountGeneration === getAccountGeneration() &&
          projectionRequest.isCurrent(projectionGeneration)
        ) {
          const saved = refreshed.memberId
            ? savedSettlementSummaryProjection(
                refreshedDisplay,
                refreshedConfirmed,
                refreshed.memberId,
                refreshed.pendingFinancialOperations,
              )
            : null;
          const previous = readSharedSettlementProjection(activeJourneyId)?.projection;
          if (
            shouldPublishSavedSettlementProjection(
              previous,
              saved,
              refreshedDisplay.canonicalSourceFingerprint,
            )
          ) {
            if (saved && refreshed.memberId)
              rememberSettlementProjection(
                activeJourneyId,
                refreshed.memberId,
                refreshed.organizer,
                saved,
                null,
              );
            setSummaryProjection(saved);
          }
        }
        try {
          const current = await previewSettlement(
            activeJourneyId,
            new Date().toISOString(),
          );
          const localSource = await verifyCurrentSettlementSource(
            activeJourneyId,
            current,
          );
          if (
            active &&
            accountGeneration === getAccountGeneration() &&
            projectionRequest.isCurrent(projectionGeneration)
          ) {
            setDisplayPreview(localSource);
            setPreview(current);
            const next = refreshed.memberId
              ? currentSettlementSummaryProjection(current, refreshed.memberId)
              : null;
            if (next && refreshed.memberId) {
              const previous = readSharedSettlementProjection(activeJourneyId);
              rememberSettlementProjection(
                activeJourneyId,
                refreshed.memberId,
                refreshed.organizer,
                next,
                current,
              );
              setSummaryProjection((existing) =>
                existing?.projectionId === next.projectionId &&
                existing.confirmedSettlement?.id === next.confirmedSettlement?.id &&
                existing.freshness === next.freshness
                  ? existing
                  : next,
              );
              if (
                reviewMode &&
                previous &&
                (previous.projection.projectionId !== next.projectionId ||
                  previous.projection.confirmedSettlement?.id !==
                    next.confirmedSettlement?.id)
              )
                setMessage("Settlement updated with the latest changes.");
            }
          }
          if (refreshed.organizer && refreshedRoot) {
            const adjustment = await previewSettlementAdjustment(
              activeJourneyId,
              refreshedRoot.id,
              current.sourceAsOf,
            );
            if (
              active &&
              accountGeneration === getAccountGeneration() &&
              projectionRequest.isCurrent(projectionGeneration)
            ) {
              if (adjustmentMatchesCurrentProjection(current, adjustment)) {
                setAdjustmentPreview(adjustment);
                setConfirmationVerified(true);
              } else {
                setAdjustmentPreview(null);
                setMessage(
                  "Settlement changed while you were reviewing it. Please review the latest changes.",
                );
              }
            }
          }
        } catch {
          // Coherent saved projection remains available offline or before queue drain.
          if (active && reviewMode && accountGeneration === getAccountGeneration())
            setMessage(
              "Fresh confirmation is temporarily unavailable. Saved changes remain visible.",
            );
        }
      } catch {
        if (active && accountGeneration === getAccountGeneration())
          setMessage(settlementCacheMessage(online, "data"));
      } finally {
        if (active) setUpdating(false);
      }
    });
    return () => {
      active = false;
      projectionRequest.cancel();
    };
  }, [
    activeJourneyId,
    accountGeneration,
    applyFinalizedRows,
    online,
    projectionRequest,
    reloadToken,
    reviewMode,
  ]);

  const matchesActiveJourney =
    loadedJourneyId === activeJourneyId && accountGeneration === getAccountGeneration();

  return {
    busy,
    updating,
    confirmationVerified: matchesActiveJourney && confirmationVerified,
    refresh,
    actorMemberId: matchesActiveJourney ? actorMemberId : null,
    isOrganizer: matchesActiveJourney && isOrganizer,
    exports: matchesActiveJourney ? exports : [],
    finalized: matchesActiveJourney ? finalized : null,
    lineage: matchesActiveJourney ? lineage : [],
    adjustmentPreview: matchesActiveJourney ? adjustmentPreview : null,
    message,
    confirmationError,
    preview: matchesActiveJourney ? preview : null,
    summaryProjection:
      matchesActiveJourney && activeJourneyId
        ? settlementProjectionAfterConfirmation(activeJourneyId, summaryProjection)
        : null,
    displayPreview: matchesActiveJourney ? displayPreview : null,
    unavailableExpenseIds: matchesActiveJourney
      ? unavailableExpenseIds
      : new Set<string>(),
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
      const projectionGeneration = projectionRequest.begin();
      setBusy(true);
      setMessage(null);
      try {
        if (isOrganizer) {
          await recoverMissingSettlementEconomicDates(operationJourneyId).catch(
            () => undefined,
          );
          const rates = await preflightSettlementFx(operationJourneyId, true);
          if (operationJourneyId === activeJourneyRef.current) {
            setUnavailableExpenseIds(rates.unavailable);
            setPendingPublicationExpenseIds(rates.pendingPublication);
          }
        }
        await refreshJourneyLedger(operationJourneyId);
        const display = await loadEstimatedSettlement(operationJourneyId);
        setDisplayPreview(display);
        const next = await previewSettlement(
          operationJourneyId,
          new Date().toISOString(),
        );
        const currentDisplay = await verifyCurrentSettlementSource(
          operationJourneyId,
          next,
        );
        if (
          operationJourneyId === activeJourneyRef.current &&
          projectionRequest.isCurrent(projectionGeneration)
        ) {
          setPreview(next);
          setDisplayPreview(currentDisplay);
          if (actorMemberId)
            setSummaryProjection(currentSettlementSummaryProjection(next, actorMemberId));
        }
      } catch (error) {
        setPreview(null);
        setMessage(error instanceof Error ? error.message : "Settlement preview failed.");
      } finally {
        setBusy(false);
      }
    },
    async finalize(ready: Stage7Preview) {
      const operationJourneyId = ready.journeyId;
      const projectionGeneration = projectionRequest.begin();
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
        const currentDisplay = await verifyCurrentSettlementSource(
          operationJourneyId,
          current,
        );
        if (
          current.state !== "PREVIEW_READY" ||
          current.settingsRevision !== ready.settingsRevision ||
          JSON.stringify(current.inputs) !== JSON.stringify(ready.inputs)
        ) {
          if (
            operationJourneyId === activeJourneyRef.current &&
            projectionRequest.isCurrent(projectionGeneration)
          ) {
            setPreview(current);
            setDisplayPreview(currentDisplay);
            if (actorMemberId)
              setSummaryProjection(
                currentSettlementSummaryProjection(current, actorMemberId),
              );
            setMessage(
              unpublishedEstimateMessage(
                rates.pendingPublication,
                currentDisplay.estimatedServerIds,
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
        if (
          operationJourneyId === activeJourneyRef.current &&
          projectionRequest.isCurrent(projectionGeneration)
        ) {
          setFinalized(response.entity);
          setLineage([response.entity]);
          setPreview(null);
          setDisplayPreview(null);
          setSummaryProjection(null);
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
        const next = await previewSettlementAdjustment(
          operationJourneyId,
          finalized.id,
          preview?.sourceAsOf,
        );
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
      setConfirmationError(null);
      try {
        const current = await previewSettlement(
          operationJourneyId,
          ready.throughTimestamp,
        );
        await verifyCurrentSettlementSource(operationJourneyId, current);
        const latest = await previewSettlementAdjustment(
          operationJourneyId,
          finalized.id,
          ready.throughTimestamp,
        );
        if (
          !summaryProjection ||
          current.sourceFingerprint !== summaryProjection.sourceFingerprint ||
          latest.state !== "PREVIEW_READY" ||
          latest.throughTimestamp !== ready.throughTimestamp ||
          latest.expectedHeadId !== ready.expectedHeadId ||
          latest.inputDigest !== ready.inputDigest ||
          !adjustmentMatchesCurrentProjection(current, latest)
        ) {
          setConfirmationVerified(false);
          const error =
            "Settlement changed while you were reviewing it. Please review the latest changes.";
          setMessage(error);
          setConfirmationError(error);
          setReloadToken((value) => value + 1);
          return false;
        }
        await queueSettlementAdjustment(
          operationJourneyId,
          finalized.id,
          latest.expectedHeadId,
          latest.inputDigest,
          latest.throughTimestamp,
          reason,
          latest.zeroTransfer,
        );
        await runLedgerSettlementPaymentSync("AUTHENTICATED_ONLINE", operationJourneyId);
        const repository = await getDefaultLedgerSettlementRepository();
        const rows = await repository.listFinalized(operationJourneyId);
        applyFinalizedRows(rows, operationJourneyId);
        const knownIds = new Set([finalized.id, ...lineage.map((row) => row.id)]);
        const confirmed = rows.find(
          (row) => !knownIds.has(row.id) && row.rootSettlementId === finalized.id,
        );
        if (!confirmed) {
          setConfirmationVerified(false);
          const error = (await repository.hasPendingFinancialOperations(
            operationJourneyId,
          ))
            ? "Settlement update is saved and waiting to sync. Confirmation is unavailable until it completes."
            : "Settlement changed while you were reviewing it. Please review the latest changes.";
          setMessage(error);
          setConfirmationError(error);
          setReloadToken((value) => value + 1);
          return false;
        }
        markSettlementConfirmedHead(operationJourneyId, confirmed.id);
        if (operationJourneyId === activeJourneyRef.current) {
          setAdjustmentPreview(null);
          setMessage("Settlement update confirmed.");
        }
        return true;
      } catch (error) {
        setConfirmationVerified(false);
        const safeMessage = error instanceof Error ? error.message : "Adjustment failed.";
        setMessage(safeMessage);
        setConfirmationError(safeMessage);
        setReloadToken((value) => value + 1);
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

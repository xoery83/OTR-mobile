import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useNetworkState } from "expo-network";

import type { FinalizedSettlementDto } from "@/data/api/ledgerSettlementContracts";
import type { LedgerFxReferenceSnapshotBundle } from "@/data/api/ledgerFxContracts";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerFxSnapshotRepository } from "@/data/repositories/defaultLedgerFxSnapshotRepository";
import { getDefaultLedgerPersonalPaymentRepository } from "@/data/repositories/defaultLedgerPersonalPaymentRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerReviewRepository } from "@/data/repositories/defaultLedgerReviewRepository";
import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import { refreshLedgerFxSnapshotCache } from "@/data/sync/ledgerFxSnapshotCoordinator";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  buildEstimatedSettlementCategories,
  buildFinalizedSettlementCategories,
  buildSettlementCategories,
  settlementCacheMessage,
} from "@/features/ledger/settlementSections";

export function useSettlementSections(
  journeyId: string | undefined,
  actorMemberId: string | null,
  isOrganizer: boolean,
  finalized: FinalizedSettlementDto | null,
  estimated: {
    inputs: Parameters<typeof buildEstimatedSettlementCategories>[0];
    members: { id: string; label: string }[];
  } | null,
  ledgerChangeSeq?: number,
) {
  const accountGeneration = getAccountGeneration();
  const currentJourney = useRef(journeyId);
  useEffect(() => {
    currentJourney.current = journeyId;
  }, [journeyId]);
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const [members, setMembers] = useState<{ id: string; label: string }[]>([]);
  const [expenses, setExpenses] = useState<LedgerExpense[]>([]);
  const [payments, setPayments] = useState<LocalPersonalPayment[]>([]);
  const [fxSnapshots, setFxSnapshots] = useState<LedgerFxReferenceSnapshotBundle | null>(
    null,
  );
  const [reviewCount, setReviewCount] = useState(0);
  const [spendingMemberId, setSpendingMemberId] = useState<string | null>(null);
  const [sharesMemberId, setSharesMemberId] = useState<string | null>(null);
  const spendingMemberRef = useRef<string | null>(null);
  const sharesMemberRef = useRef<string | null>(null);
  const [spendingRows, setSpendingRows] = useState<LedgerReportListItem[]>([]);
  const [shareRows, setShareRows] = useState<LedgerReportListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const updatePayments = useCallback(
    (next: LocalPersonalPayment[]) => {
      if (
        accountGeneration === getAccountGeneration() &&
        currentJourney.current === journeyId
      )
        setPayments(next);
    },
    [accountGeneration, journeyId],
  );

  const loadBase = useCallback(async () => {
    if (!journeyId) return;
    setLoading(true);
    try {
      const [
        reporting,
        expenseRepository,
        paymentRepository,
        reviewRepository,
        fxRepository,
      ] = await Promise.all([
        getDefaultLedgerReportingRepository(),
        getDefaultLedgerExpenseRepository(),
        getDefaultLedgerPersonalPaymentRepository(),
        getDefaultLedgerReviewRepository(),
        getDefaultLedgerFxSnapshotRepository(),
      ]);
      const [options, nextExpenses, nextPayments, counts, snapshots] = await Promise.all([
        reporting.listFilterOptions(journeyId),
        expenseRepository.listExpensesForJourney(journeyId, Boolean(finalized)),
        paymentRepository.listForJourney(journeyId),
        reviewRepository.counts(journeyId),
        fxRepository.list().catch(() => null),
      ]);
      if (
        accountGeneration !== getAccountGeneration() ||
        currentJourney.current !== journeyId
      )
        return;
      setMembers(options.members);
      setExpenses(nextExpenses);
      setPayments(nextPayments);
      setFxSnapshots(snapshots);
      setReviewCount(counts.pending);
      const spendingId = options.members.some(
        (member) => member.id === spendingMemberRef.current,
      )
        ? spendingMemberRef.current
        : actorMemberId;
      const sharesId = options.members.some(
        (member) => member.id === sharesMemberRef.current,
      )
        ? sharesMemberRef.current
        : actorMemberId;
      spendingMemberRef.current = spendingId;
      sharesMemberRef.current = sharesId;
      setSpendingMemberId(spendingId);
      setSharesMemberId(sharesId);
      if (!finalized && !estimated && (spendingId || sharesId)) {
        const loadRows = async (kind: "SPENDING" | "SHARES", memberId: string) => {
          const query = {
            journeyId,
            memberId,
            scope: kind === "SPENDING" ? ("GROUP" as const) : ("MINE" as const),
            authoritativeOnly: true,
            ...(kind === "SPENDING" ? { payerMemberId: memberId } : {}),
          };
          return reporting.listExpenses(query, await reporting.countExpenses(query));
        };
        const [nextSpending, nextShares] = await Promise.all([
          spendingId ? loadRows("SPENDING", spendingId) : Promise.resolve([]),
          sharesId ? loadRows("SHARES", sharesId) : Promise.resolve([]),
        ]);
        if (
          accountGeneration !== getAccountGeneration() ||
          currentJourney.current !== journeyId
        )
          return;
        setSpendingRows(nextSpending);
        setShareRows(nextShares);
      }
      setMessage(null);
      if (online)
        void refreshLedgerFxSnapshotCache()
          .then((snapshots) => {
            if (
              accountGeneration === getAccountGeneration() &&
              currentJourney.current === journeyId
            )
              setFxSnapshots(snapshots);
          })
          .catch(() => undefined);
    } catch {
      if (
        accountGeneration === getAccountGeneration() &&
        currentJourney.current === journeyId
      )
        setMessage(settlementCacheMessage(online, "details"));
    } finally {
      if (
        accountGeneration === getAccountGeneration() &&
        currentJourney.current === journeyId
      )
        setLoading(false);
    }
  }, [accountGeneration, actorMemberId, estimated, finalized, journeyId, online]);

  const loadMember = useCallback(
    async (kind: "SPENDING" | "SHARES", memberId: string | null) => {
      if (!journeyId || !memberId || finalized || estimated) return;
      try {
        const reporting = await getDefaultLedgerReportingRepository();
        const query = {
          journeyId,
          memberId,
          scope: kind === "SPENDING" ? ("GROUP" as const) : ("MINE" as const),
          authoritativeOnly: true,
          ...(kind === "SPENDING" ? { payerMemberId: memberId } : {}),
        };
        const rows = await reporting.listExpenses(
          query,
          await reporting.countExpenses(query),
        );
        if (
          accountGeneration !== getAccountGeneration() ||
          currentJourney.current !== journeyId
        )
          return;
        if (kind === "SPENDING") setSpendingRows(rows);
        else setShareRows(rows);
      } catch {
        if (
          accountGeneration === getAccountGeneration() &&
          currentJourney.current === journeyId
        )
          setMessage("Saved Settlement details remain available.");
      }
    },
    [accountGeneration, estimated, finalized, journeyId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadBase();
    }, [loadBase]),
  );
  useEffect(() => {
    if (ledgerChangeSeq === undefined || !journeyId) return;
    let current = true;
    void getDefaultLedgerPersonalPaymentRepository()
      .then((repository) => repository.listForJourney(journeyId))
      .then((next) => {
        if (
          current &&
          accountGeneration === getAccountGeneration() &&
          currentJourney.current === journeyId
        )
          setPayments(next);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [accountGeneration, journeyId, ledgerChangeSeq]);
  const selectSpendingMember = (memberId: string) => {
    spendingMemberRef.current = memberId;
    setSpendingMemberId(memberId);
    void loadMember("SPENDING", memberId);
  };
  const selectSharesMember = (memberId: string) => {
    sharesMemberRef.current = memberId;
    setSharesMemberId(memberId);
    void loadMember("SHARES", memberId);
  };

  const effectiveSpendingMemberId = spendingMemberId ?? actorMemberId;
  const effectiveSharesMemberId = sharesMemberId ?? actorMemberId;

  return {
    members,
    expenses,
    payments,
    fxSnapshots,
    updatePayments,
    reviewCount,
    loading,
    message,
    spendingMemberId: effectiveSpendingMemberId,
    sharesMemberId: effectiveSharesMemberId,
    spendingCategories: finalized
      ? buildFinalizedSettlementCategories(
          finalized.inputs,
          expenses,
          effectiveSpendingMemberId,
          "SPENDING",
        )
      : estimated
        ? buildEstimatedSettlementCategories(
            estimated.inputs,
            estimated.members,
            effectiveSpendingMemberId,
            "SPENDING",
          )
        : buildSettlementCategories(spendingRows, expenses, effectiveSpendingMemberId),
    shareCategories: finalized
      ? buildFinalizedSettlementCategories(
          finalized.inputs,
          expenses,
          effectiveSharesMemberId,
          "SHARES",
        )
      : estimated
        ? buildEstimatedSettlementCategories(
            estimated.inputs,
            estimated.members,
            effectiveSharesMemberId,
            "SHARES",
          )
        : buildSettlementCategories(shareRows, expenses, effectiveSharesMemberId),
    setSpendingMemberId: isOrganizer ? selectSpendingMember : () => undefined,
    setSharesMemberId: isOrganizer ? selectSharesMember : () => undefined,
  };
}

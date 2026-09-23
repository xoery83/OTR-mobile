import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useNetworkState } from "expo-network";

import type { FinalizedSettlementDto } from "@/data/api/ledgerSettlementContracts";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerPersonalPaymentRepository } from "@/data/repositories/defaultLedgerPersonalPaymentRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerReviewRepository } from "@/data/repositories/defaultLedgerReviewRepository";
import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import {
  buildFinalizedSettlementCategories,
  buildSettlementCategories,
  settlementCacheMessage,
} from "@/features/ledger/settlementSections";

export function useSettlementSections(
  journeyId: string | undefined,
  actorMemberId: string | null,
  isOrganizer: boolean,
  finalized: FinalizedSettlementDto | null,
) {
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const [members, setMembers] = useState<{ id: string; label: string }[]>([]);
  const [expenses, setExpenses] = useState<LedgerExpense[]>([]);
  const [payments, setPayments] = useState<LocalPersonalPayment[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [spendingMemberId, setSpendingMemberId] = useState<string | null>(null);
  const [sharesMemberId, setSharesMemberId] = useState<string | null>(null);
  const spendingMemberRef = useRef<string | null>(null);
  const sharesMemberRef = useRef<string | null>(null);
  const [spendingRows, setSpendingRows] = useState<LedgerReportListItem[]>([]);
  const [shareRows, setShareRows] = useState<LedgerReportListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadBase = useCallback(async () => {
    if (!journeyId) return;
    setLoading(true);
    try {
      const [reporting, expenseRepository, paymentRepository, reviewRepository] =
        await Promise.all([
          getDefaultLedgerReportingRepository(),
          getDefaultLedgerExpenseRepository(),
          getDefaultLedgerPersonalPaymentRepository(),
          getDefaultLedgerReviewRepository(),
        ]);
      const [options, nextExpenses, nextPayments, counts] = await Promise.all([
        finalized
          ? Promise.resolve({
              members: finalized.balances.map((balance) => ({
                id: balance.memberId,
                label: balance.displayNameSnapshot,
              })),
            })
          : reporting.listFilterOptions(journeyId),
        expenseRepository.listExpensesForJourney(journeyId, Boolean(finalized)),
        paymentRepository.listForJourney(journeyId),
        reviewRepository.counts(journeyId),
      ]);
      setMembers(options.members);
      setExpenses(nextExpenses);
      setPayments(nextPayments);
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
      if (!finalized && (spendingId || sharesId)) {
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
        setSpendingRows(nextSpending);
        setShareRows(nextShares);
      }
      setMessage(null);
    } catch {
      setMessage(settlementCacheMessage(online, "details"));
    } finally {
      setLoading(false);
    }
  }, [actorMemberId, finalized, journeyId, online]);

  const loadMember = useCallback(
    async (kind: "SPENDING" | "SHARES", memberId: string | null) => {
      if (!journeyId || !memberId || finalized) return;
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
        if (kind === "SPENDING") setSpendingRows(rows);
        else setShareRows(rows);
      } catch {
        setMessage("Saved Settlement details remain available.");
      }
    },
    [finalized, journeyId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadBase();
    }, [loadBase]),
  );
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
    payments,
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
      : buildSettlementCategories(spendingRows, expenses, effectiveSpendingMemberId),
    shareCategories: finalized
      ? buildFinalizedSettlementCategories(
          finalized.inputs,
          expenses,
          effectiveSharesMemberId,
          "SHARES",
        )
      : buildSettlementCategories(shareRows, expenses, effectiveSharesMemberId),
    setSpendingMemberId: isOrganizer ? selectSpendingMember : () => undefined,
    setSharesMemberId: isOrganizer ? selectSharesMember : () => undefined,
  };
}

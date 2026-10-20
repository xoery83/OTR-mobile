import type { SettlementStatement } from "./settlementStatement";

export type SettlementExportPrivacy = "MEMBER" | "DE_IDENTIFIED";

export type SettlementExportRow = {
  recordType: string;
  lineageSequence: number | null;
  entityId: string;
  parentId: string;
  memberId: string;
  memberName: string;
  counterpartyId: string;
  counterpartyName: string;
  field: string;
  valueMinor: number | null;
  currency: string;
  scale: number | null;
  text: string;
  timestamp: string;
};

export type SettlementExportDocument = {
  privacy: SettlementExportPrivacy;
  rows: SettlementExportRow[];
};

export function buildSettlementExportDocument(
  statement: SettlementStatement,
  privacy: SettlementExportPrivacy,
): SettlementExportDocument {
  const ids = createIdentityPresenter(statement, privacy);
  const rows: SettlementExportRow[] = [];
  const add = (
    row: Partial<SettlementExportRow> & Pick<SettlementExportRow, "recordType">,
  ) =>
    rows.push({
      lineageSequence: null,
      entityId: "",
      parentId: "",
      memberId: "",
      memberName: "",
      counterpartyId: "",
      counterpartyName: "",
      field: "",
      valueMinor: null,
      currency: "",
      scale: null,
      text: "",
      timestamp: "",
      ...row,
    });

  for (const [field, text] of [
    ["schema_version", String(statement.schemaVersion)],
    ["journey_id", ids.entity("journey", statement.journeyId)],
    ["root_settlement_id", ids.entity("settlement", statement.rootSettlementId)],
    ["head_settlement_id", ids.entity("settlement", statement.headSettlementId)],
    ["through_timestamp", statement.throughTimestamp],
    ["settlement_currency", statement.settlementCurrency],
    ["algorithm_version", statement.algorithmVersion],
    ["eligibility_version", statement.eligibilityVersion],
    ["adjustment_state", statement.adjustmentState ?? "UNKNOWN"],
    ["fully_settled", String(statement.fullySettled)],
  ] as const) {
    add({ recordType: "metadata", field, text });
  }

  for (const balance of statement.outstandingBalances) {
    addMoney(
      "outstanding_balance",
      balance.memberId,
      balance.displayNameSnapshot,
      balance.amount,
    );
  }

  for (const settlement of statement.lineage) {
    const settlementId = ids.entity("settlement", settlement.id);
    add({
      recordType: "lineage",
      lineageSequence: settlement.sequence,
      entityId: settlementId,
      parentId: settlement.parentAdjustmentId
        ? ids.entity("settlement", settlement.parentAdjustmentId)
        : "",
      field: settlement.kind,
      text:
        privacy === "DE_IDENTIFIED" && settlement.adjustmentReason
          ? "[redacted]"
          : (settlement.adjustmentReason ?? ""),
      timestamp: settlement.finalizedAt,
    });
    add({
      recordType: "digest",
      lineageSequence: settlement.sequence,
      entityId: settlementId,
      field: "input_digest",
      text: settlement.inputDigest,
    });

    for (const balance of settlement.balances) {
      for (const [field, value] of [
        ["paid", balance.paidMinor],
        ["owed", balance.owedMinor],
        ["net", balance.netMinor],
      ] as const) {
        addMoney(
          "member_balance",
          balance.memberId,
          balance.displayNameSnapshot,
          {
            minor: value,
            currency: balance.currency,
            scale: balance.scale,
          },
          settlement.sequence,
          settlementId,
          field,
        );
      }
    }
    for (const delta of settlement.adjustmentDeltas) {
      addMoney(
        "adjustment_delta",
        delta.memberId,
        delta.displayNameSnapshot,
        {
          minor: delta.deltaMinor,
          currency: delta.currency,
          scale: delta.scale,
        },
        settlement.sequence,
        settlementId,
      );
    }

    for (const input of settlement.inputs) {
      const expenseId = ids.entity("expense", input.expenseId);
      addMoney(
        "expense_original",
        input.payer.memberId,
        input.payer.displayNameSnapshot,
        input.original,
        settlement.sequence,
        expenseId,
        "revision",
        String(input.expenseRevision),
      );
      addMoney(
        "expense_settlement",
        input.payer.memberId,
        input.payer.displayNameSnapshot,
        input.settlement,
        settlement.sequence,
        expenseId,
      );
      add({
        recordType: "expense_valuation",
        lineageSequence: settlement.sequence,
        entityId: ids.entity("valuation", input.valuation.id),
        parentId: expenseId,
        field: input.valuation.policy,
        text: input.valuation.decimalRate ?? input.valuation.roundingMode,
      });
      for (const [field, evidenceId] of [
        ["rate_snapshot", input.valuation.rateSnapshotId],
        ["payment_record", input.valuation.paymentRecordId],
      ] as const) {
        if (evidenceId)
          add({
            recordType: "expense_valuation_evidence",
            lineageSequence: settlement.sequence,
            entityId: ids.entity(field, evidenceId),
            parentId: expenseId,
            field,
          });
      }
      for (const split of input.splits) {
        addMoney(
          "expense_split",
          split.member.memberId,
          split.member.displayNameSnapshot,
          {
            minor: split.originalMinor,
            currency: input.original.currency,
            scale: input.original.scale,
          },
          settlement.sequence,
          expenseId,
          "original_share",
        );
        addMoney(
          "expense_split",
          split.member.memberId,
          split.member.displayNameSnapshot,
          {
            minor: split.settlementMinor,
            currency: input.settlement.currency,
            scale: input.settlement.scale,
          },
          settlement.sequence,
          expenseId,
          "settlement_share",
          String(split.roundingAdjustmentMinor),
        );
      }
    }

    for (const transfer of settlement.transfers) {
      const transferId = ids.entity("transfer", transfer.id);
      for (const [field, money] of [
        ["obligation", transfer.amount],
        ["confirmed", transfer.confirmedDischarge],
        ["awaiting", transfer.awaitingAmount],
        ["remaining", transfer.confirmedRemaining],
        ["available_to_report", transfer.availableToReport],
      ] as const) {
        add({
          recordType: "transfer",
          lineageSequence: settlement.sequence,
          entityId: transferId,
          memberId: ids.memberId(transfer.fromMemberId),
          memberName: ids.memberName(transfer.fromMemberId),
          counterpartyId: ids.memberId(transfer.toMemberId),
          counterpartyName: ids.memberName(transfer.toMemberId),
          field,
          valueMinor: money.minor,
          currency: money.currency,
          scale: money.scale,
          text: transfer.status,
        });
      }
      for (const payment of transfer.payments) {
        const paymentId = ids.entity("payment", payment.id);
        addMoney(
          "payment",
          payment.reportedByMemberId,
          ids.originalName(payment.reportedByMemberId),
          payment.payment,
          settlement.sequence,
          paymentId,
          payment.status,
          payment.paidAt,
          transferId,
        );
        add({
          recordType: "payment_metadata",
          lineageSequence: settlement.sequence,
          entityId: paymentId,
          parentId: transferId,
          memberId: ids.memberId(payment.reportedByMemberId),
          memberName: ids.memberName(payment.reportedByMemberId),
          field: payment.reportingAuthority,
          text:
            privacy === "DE_IDENTIFIED" && payment.reportingReason
              ? "[redacted]"
              : [
                  payment.reportingReason,
                  payment.supersedesPaymentId
                    ? `supersedes ${ids.entity("payment", payment.supersedesPaymentId)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
          timestamp: payment.paidAt,
        });
        addMoney(
          "payment_discharge_assertion",
          payment.reportedByMemberId,
          ids.originalName(payment.reportedByMemberId),
          payment.assertedDischarge,
          settlement.sequence,
          paymentId,
        );
        if (payment.repaymentValuation) {
          add({
            recordType: "repayment_valuation",
            lineageSequence: settlement.sequence,
            entityId: ids.entity("valuation", payment.repaymentValuation.id),
            parentId: paymentId,
            field: payment.repaymentValuation.source,
            text:
              privacy === "DE_IDENTIFIED"
                ? payment.repaymentValuation.decimalRate
                : [
                    payment.repaymentValuation.decimalRate,
                    payment.repaymentValuation.sourceLabel,
                    payment.repaymentValuation.reason,
                  ]
                    .filter(Boolean)
                    .join(" · "),
            timestamp: payment.repaymentValuation.effectiveAt,
          });
        }
        if (payment.feeTreatment) {
          addMoney(
            "payment_fee",
            payment.reportedByMemberId,
            ids.originalName(payment.reportedByMemberId),
            payment.feeTreatment.fee,
            settlement.sequence,
            paymentId,
            payment.feeTreatment.borneBy,
          );
        }
        if (payment.discharge) {
          addMoney(
            "discharge",
            payment.discharge.confirmedByMemberId,
            ids.originalName(payment.discharge.confirmedByMemberId),
            payment.discharge.amount,
            settlement.sequence,
            ids.entity("discharge", payment.discharge.id),
            payment.discharge.confirmationAuthority,
            payment.discharge.confirmedAt,
            paymentId,
          );
          if (payment.discharge.reason) {
            add({
              recordType: "discharge_reason",
              lineageSequence: settlement.sequence,
              entityId: ids.entity("discharge", payment.discharge.id),
              parentId: paymentId,
              text: privacy === "DE_IDENTIFIED" ? "[redacted]" : payment.discharge.reason,
            });
          }
        }
      }
    }

    for (const event of settlement.auditEvents) {
      add({
        recordType: "audit",
        lineageSequence: settlement.sequence,
        entityId: ids.entity("audit", event.id),
        parentId: settlementId,
        memberId: ids.memberId(event.actorMemberId),
        memberName: ids.memberName(event.actorMemberId),
        field: [event.eventType, event.authority].filter(Boolean).join(" · "),
        text:
          privacy === "DE_IDENTIFIED" && event.reason
            ? "[redacted]"
            : (event.reason ?? ""),
        timestamp: event.createdAt,
      });
    }
  }

  return { privacy, rows };

  function addMoney(
    recordType: string,
    memberId: string,
    memberName: string,
    money: { minor: number; currency: string; scale: number },
    lineageSequence: number | null = null,
    entityId = "",
    field = "",
    text = "",
    parentId = "",
  ) {
    add({
      recordType,
      lineageSequence,
      entityId,
      parentId,
      memberId: ids.memberId(memberId),
      memberName: ids.memberName(memberId, memberName),
      field,
      valueMinor: money.minor,
      currency: money.currency,
      scale: money.scale,
      text,
    });
  }
}

export function settlementExportCsv(document: SettlementExportDocument) {
  const columns = [
    "record_type",
    "lineage_sequence",
    "entity_id",
    "parent_id",
    "member_id",
    "member_name",
    "counterparty_id",
    "counterparty_name",
    "field",
    "value_minor",
    "currency",
    "scale",
    "text",
    "timestamp",
  ];
  const lines = document.rows.map((row) =>
    [
      row.recordType,
      row.lineageSequence,
      row.entityId,
      row.parentId,
      row.memberId,
      row.memberName,
      row.counterpartyId,
      row.counterpartyName,
      row.field,
      rawNumber(row.valueMinor),
      row.currency,
      rawNumber(row.scale),
      row.text,
      row.timestamp,
    ]
      .map((value, index) => csvCell(value, index === 9 || index === 11))
      .join(","),
  );
  return `\uFEFF${columns.join(",")}\r\n${lines.join("\r\n")}\r\n`;
}

export function settlementExportHtml(document: SettlementExportDocument) {
  const rows = document.rows
    .map(
      (row) =>
        `<tr><td>${html(row.recordType)}</td><td>${html(row.lineageSequence ?? "")}</td><td>${html(row.entityId)}</td><td>${html(row.memberName)}</td><td>${html(row.counterpartyName)}</td><td>${html(row.field)}</td><td class="number">${html(row.valueMinor ?? "")}</td><td>${html(row.currency)}</td><td>${html(row.text)}</td><td>${html(row.timestamp)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:28pt}body{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#0f172a;font-size:9pt}h1{font-size:18pt}p{color:#475569}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border-bottom:1px solid #cbd5e1;padding:4pt;overflow-wrap:anywhere;text-align:left;vertical-align:top}.number{text-align:right}th{background:#f1f5f9}tr{break-inside:avoid}</style></head><body><h1>OTR Settlement Statement</h1><p>${html(document.privacy === "DE_IDENTIFIED" ? "De-identified" : "Member")} · schema ${html(document.rows.find((row) => row.field === "schema_version")?.text ?? "")}</p><table><thead><tr><th>Type</th><th>Seq</th><th>ID</th><th>Member</th><th>Counterparty</th><th>Field</th><th>Minor</th><th>Currency</th><th>Text</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function createIdentityPresenter(
  statement: SettlementStatement,
  privacy: SettlementExportPrivacy,
) {
  const memberNames = new Map<string, string>();
  for (const settlement of statement.lineage) {
    for (const balance of settlement.balances)
      memberNames.set(balance.memberId, balance.displayNameSnapshot);
    for (const input of settlement.inputs) {
      memberNames.set(input.payer.memberId, input.payer.displayNameSnapshot);
      for (const split of input.splits)
        memberNames.set(split.member.memberId, split.member.displayNameSnapshot);
    }
    for (const delta of settlement.adjustmentDeltas)
      memberNames.set(delta.memberId, delta.displayNameSnapshot);
    for (const transfer of settlement.transfers) {
      for (const memberId of [transfer.fromMemberId, transfer.toMemberId])
        if (!memberNames.has(memberId)) memberNames.set(memberId, "Traveller");
      for (const payment of transfer.payments) {
        if (!memberNames.has(payment.reportedByMemberId))
          memberNames.set(payment.reportedByMemberId, "Traveller");
        if (payment.discharge && !memberNames.has(payment.discharge.confirmedByMemberId))
          memberNames.set(payment.discharge.confirmedByMemberId, "Traveller");
      }
    }
    for (const event of settlement.auditEvents)
      if (!memberNames.has(event.actorMemberId))
        memberNames.set(event.actorMemberId, "Traveller");
  }
  for (const balance of statement.outstandingBalances)
    memberNames.set(balance.memberId, balance.displayNameSnapshot);
  const members = new Map(
    [...memberNames.keys()].sort().map((id, index) => [id, `Member ${letters(index)}`]),
  );
  const aliases = new Map<string, string>();
  return {
    originalName(id: string) {
      return memberNames.get(id) ?? "Traveller";
    },
    memberId(id: string) {
      return privacy === "MEMBER"
        ? id
        : (members.get(id)?.toLowerCase().replace(" ", "-") ?? "member-unknown");
    },
    memberName(id: string, fallback?: string) {
      return privacy === "MEMBER"
        ? (memberNames.get(id) ?? fallback ?? "Traveller")
        : (members.get(id) ?? "Member Unknown");
    },
    entity(type: string, id: string) {
      if (privacy === "MEMBER") return id;
      const key = `${type}:${id}`;
      if (!aliases.has(key)) aliases.set(key, `${type}-${aliases.size + 1}`);
      return aliases.get(key)!;
    },
  };
}

function letters(index: number) {
  let value = index + 1;
  let result = "";
  while (value) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function rawNumber(value: number | null) {
  return value === null ? "" : String(value);
}

function csvCell(value: string | number | null, numeric = false) {
  let text = value === null ? "" : String(value);
  if (!numeric && /^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function html(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

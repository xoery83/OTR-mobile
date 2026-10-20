import { currencyScale } from "@/domain/ledger/currency";
import type {
  CurrencyCandidate,
  Evidence,
  NumericCandidate,
  ReceiptDocumentB1,
  ReceiptLine,
} from "./receiptParserB1";

export type AmountReason =
  | "EXPLICIT_GRAND_TOTAL"
  | "EXPLICIT_TOTAL"
  | "AMOUNT_DUE"
  | "AMOUNT_PAID"
  | "PAYMENT_MATCH"
  | "GENERIC_AMOUNT"
  | "SAME_LINE_VALUE"
  | "ADJACENT_LINE_VALUE"
  | "RIGHT_ALIGNED_VALUE"
  | "DUPLICATE_FINAL_AMOUNT"
  | "SUBTOTAL_PENALTY"
  | "TAX_PENALTY"
  | "CHANGE_PENALTY"
  | "TENDERED_PENALTY"
  | "DISCOUNT_PENALTY"
  | "LOYALTY_PENALTY"
  | "UNIT_PRICE_PENALTY"
  | "QUANTITY_PENALTY"
  | "TIP_LINE_PENALTY"
  | "SURCHARGE_LINE_PENALTY"
  | "WEAK_UNLABELED_AMOUNT"
  | "EXPLICIT_CURRENCY"
  | "JOURNEY_CURRENCY_HINT"
  | "HIGH_OCR_CONFIDENCE"
  | "LOW_OCR_CONFIDENCE";

export type AmountCandidateB2 = {
  decimal: string;
  currency: string | null;
  minorUnits: number | null;
  currencyCandidateIds: string[];
  numericCandidateIds: string[];
  score: number; // fixed semantic ranking points, never probability or B1 extraction score
  reasons: AmountReason[];
  evidence: Evidence[];
  ambiguousCurrency: boolean;
  ambiguousSeparator: boolean;
};

export type ReceiptAmountsB2 = {
  parserVersion: "receipt-b2";
  amountCandidates: AmountCandidateB2[];
  status: "clear" | "ambiguous" | "none";
  warnings: (
    | "NO_RELIABLE_TOTAL"
    | "CONFLICTING_TOTALS"
    | "AMBIGUOUS_AMOUNT_SEPARATOR"
    | "AMBIGUOUS_CURRENCY_SYMBOL"
  )[];
};

type Label = { start: number; end: number; reason: AmountReason; points: number };
const rules: { pattern: RegExp; reason: AmountReason; points: number }[] = [
  { pattern: /\bGRAND\s+TOTAL\b/gi, reason: "EXPLICIT_GRAND_TOTAL", points: 65 },
  { pattern: /\b(?:AMOUNT|TOTAL|BALANCE)\s+DUE\b/gi, reason: "AMOUNT_DUE", points: 65 },
  { pattern: /\bAMOUNT\s+PAID\b|\bPAID\s+AMOUNT\b/gi, reason: "AMOUNT_PAID", points: 60 },
  {
    pattern:
      /(?:总计|總計|合计|合計|应付|應付|实付|實付|お支払(?:金額)?|お会計|ご請求額|支払額)/g,
    reason: "EXPLICIT_TOTAL",
    points: 60,
  },
  { pattern: /\bTOTAL\b/gi, reason: "EXPLICIT_TOTAL", points: 60 },
  {
    pattern: /\b(?:PAID|PAYMENT|EFTPOS|CARD\s+(?:PAYMENT|PAID))\b|(?:支付|付款)/gi,
    reason: "PAYMENT_MATCH",
    points: 40,
  },
  { pattern: /\bAMOUNT\b/gi, reason: "GENERIC_AMOUNT", points: 25 },
  {
    pattern: /\bSUB\s*TOTAL\b|(?:小计|小計|小計額|小计额|小計金額)/gi,
    reason: "SUBTOTAL_PENALTY",
    points: -70,
  },
  {
    pattern: /\b(?:TAX|GST|VAT)\b|(?:消费税|消費税|税额|稅額|税|稅)/gi,
    reason: "TAX_PENALTY",
    points: -70,
  },
  {
    pattern: /\bCHANGE\b|(?:找零|找錢|找钱|お釣り|釣銭)/gi,
    reason: "CHANGE_PENALTY",
    points: -70,
  },
  {
    pattern:
      /\b(?:CASH(?:\s+(?:TENDERED|RECEIVED))?|TENDER(?:ED)?)\b|(?:現金預り|お預り|收取現金|收取现金)/gi,
    reason: "TENDERED_PENALTY",
    points: -70,
  },
  {
    pattern: /\b(?:DISCOUNT|SAVINGS?)\b|(?:折扣|优惠|優惠|値引き|割引)/gi,
    reason: "DISCOUNT_PENALTY",
    points: -70,
  },
  { pattern: /\bLOYALTY\b/gi, reason: "LOYALTY_PENALTY", points: -70 },
  { pattern: /\bUNIT\s+PRICE\b/gi, reason: "UNIT_PRICE_PENALTY", points: -70 },
  { pattern: /\b(?:QTY|QUANTITY)\b/gi, reason: "QUANTITY_PENALTY", points: -70 },
  { pattern: /\bTIP\b/gi, reason: "TIP_LINE_PENALTY", points: -70 },
  { pattern: /\bSURCHARGE\b/gi, reason: "SURCHARGE_LINE_PENALTY", points: -70 },
];
const positive = (reason: AmountReason) =>
  [
    "EXPLICIT_GRAND_TOTAL",
    "EXPLICIT_TOTAL",
    "AMOUNT_DUE",
    "AMOUNT_PAID",
    "PAYMENT_MATCH",
  ].includes(reason);

function labels(text: string): Label[] {
  const all = rules.flatMap(({ pattern, reason, points }) =>
    [...text.matchAll(pattern)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      reason,
      points,
    })),
  );
  // A longer label owns overlapping words: SUBTOTAL cannot become TOTAL.
  return all.filter(
    (item) =>
      !all.some(
        (other) =>
          other !== item &&
          other.start <= item.start &&
          other.end >= item.end &&
          other.end - other.start > item.end - item.start,
      ),
  );
}

function numericPosition(line: ReceiptLine, numeric: NumericCandidate) {
  const span = numeric.evidence[0];
  let cursor = 0;
  for (const fragment of line.fragments) {
    const start = line.text.indexOf(fragment.text.trim(), cursor);
    if (start < 0) continue;
    if (fragment.id === span.observationId) return start + span.start;
    cursor = start + fragment.text.trim().length;
  }
  return line.text.indexOf(numeric.raw);
}

function nearestLabel(line: ReceiptLine, numeric: NumericCandidate): Label | null {
  const position = numericPosition(line, numeric);
  if (position < 0) return null;
  const matches = labels(line.text);
  matches.sort((a, b) => {
    const distance = (label: Label) =>
      Math.max(0, label.start - position - numeric.raw.length, position - label.end);
    return distance(a) - distance(b) || a.start - b.start;
  });
  const nearest = matches[0];
  if (!nearest) return null;
  const between =
    nearest.end <= position
      ? line.text.slice(nearest.end, position)
      : line.text.slice(position + numeric.raw.length, nearest.start);
  // A label cannot claim a value across another number or a long unrelated span.
  return between.length <= 16 && !/\d/.test(between) ? nearest : null;
}

function labelEvidence(line: ReceiptLine, label: Label): Evidence[] {
  const references: Evidence[] = [];
  let cursor = 0;
  for (const fragment of line.fragments) {
    const start = line.text.indexOf(fragment.text.trim(), cursor);
    if (start < 0) continue;
    const end = start + fragment.text.trim().length;
    if (start < label.end && end > label.start)
      references.push({
        observationId: fragment.id,
        lineId: line.id,
        start: Math.max(0, label.start - start),
        end: Math.min(fragment.text.length, label.end - start),
      });
    cursor = end;
  }
  return references;
}

export function receiptMinorUnits(
  decimal: string,
  currency: string | null,
): number | null {
  if (!currency) return null;
  const scale = currencyScale(currency);
  if (scale === null) return null;
  const [whole, fraction = ""] = decimal.split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) return null;
  if (fraction.slice(scale).replace(/0/g, "")) return null;
  const units =
    BigInt(whole) * 10n ** BigInt(scale) +
    BigInt(fraction.slice(0, scale).padEnd(scale, "0") || "0");
  return units > 0n && units <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(units) : null;
}

function canonical(decimal: string) {
  const [whole, fraction] = decimal.split(".");
  return fraction ? `${whole}.${fraction.replace(/0+$/, "")}`.replace(/\.$/, "") : whole;
}

function currencyFor(
  numeric: NumericCandidate,
  currencies: CurrencyCandidate[],
): {
  code: string | null;
  ids: string[];
  ambiguous: boolean;
  explicit: boolean;
  hint: boolean;
} {
  const linked = currencies.filter((item) =>
    numeric.currencyCandidateIds.includes(item.id),
  );
  const explicit = linked.filter((item) => item.code);
  const codes = [...new Set(explicit.map((item) => item.code!))];
  const bare = linked.some((item) => item.strength === "ambiguous-symbol");
  const hint = currencies.find((item) => item.source === "context");
  if (codes.length > 1)
    return {
      code: null,
      ids: linked.map((item) => item.id),
      ambiguous: true,
      explicit: true,
      hint: false,
    };
  if (codes.length === 1)
    return {
      code: codes[0],
      ids: linked.map((item) => item.id),
      ambiguous: false,
      explicit: true,
      hint: false,
    };
  if (
    bare &&
    hint?.code &&
    (linked.every((item) => item.raw !== "¥") ||
      linked.some((item) => item.possibleCodes.includes(hint.code!)))
  )
    return {
      code: hint.code,
      ids: [...linked.map((item) => item.id), hint.id],
      ambiguous: false,
      explicit: false,
      hint: true,
    };
  return {
    code: null,
    ids: linked.map((item) => item.id),
    ambiguous: bare,
    explicit: false,
    hint: false,
  };
}

export function rankReceiptAmountsB2(input: ReceiptDocumentB1): ReceiptAmountsB2 {
  const occurrences: AmountCandidateB2[] = [];
  for (const numeric of input.numericCandidates) {
    const lineIndex = input.lines.findIndex(
      (line) => line.id === numeric.evidence[0]?.lineId,
    );
    const line = input.lines[lineIndex];
    if (!line) continue;
    const documentLines = input.lines.filter(
      (item) => item.documentId === line.documentId,
    );
    const documentLineIndex = documentLines.findIndex((item) => item.id === line.id);
    const documentNumericCount = input.numericCandidates.filter((item) =>
      documentLines.some((entry) => entry.id === item.evidence[0]?.lineId),
    ).length;
    const currency = currencyFor(numeric, input.currencyCandidates);
    const units = receiptMinorUnits(numeric.decimal, currency.code);
    if (currency.code && units === null) continue;
    if (canonical(numeric.decimal) === "0") continue;
    let label = nearestLabel(line, numeric);
    let adjacent = false;
    const sameLineCount = input.numericCandidates.filter(
      (item) => item.evidence[0]?.lineId === line.id && item.tokenId !== numeric.tokenId,
    ).length;
    if (
      !label &&
      sameLineCount === 0 &&
      lineIndex > 0 &&
      input.lines[lineIndex - 1].documentId === line.documentId
    ) {
      const previous = input.lines[lineIndex - 1];
      const gap =
        line.boundingBox.y - previous.boundingBox.y - previous.boundingBox.height;
      const previousHasAmount = input.numericCandidates.some(
        (item) => item.evidence[0]?.lineId === previous.id,
      );
      if (
        !previousHasAmount &&
        gap >= -0.005 &&
        gap <= Math.max(line.boundingBox.height, previous.boundingBox.height) * 1.5
      ) {
        const previousLabels = labels(previous.text);
        if (previousLabels.length === 1) {
          label = previousLabels[0];
          adjacent = true;
        }
      }
    }
    const reasons: AmountReason[] = [];
    let score = 0;
    if (label) {
      reasons.push(label.reason, adjacent ? "ADJACENT_LINE_VALUE" : "SAME_LINE_VALUE");
      score += label.points + (adjacent ? 8 : 15);
      if (!adjacent && line.fragments.length > 1) {
        const fragment = line.fragments.find(
          (item) => item.id === numeric.evidence[0].observationId,
        );
        if (
          fragment &&
          fragment.boundingBox.x > line.boundingBox.x + line.boundingBox.width * 0.5
        ) {
          reasons.push("RIGHT_ALIGNED_VALUE");
          score += 10;
        }
      }
    } else {
      reasons.push("WEAK_UNLABELED_AMOUNT");
      score += numeric.reasons.includes("NUMERIC_FORMAT_STRONG") ? 15 : 5;
      if (documentLineIndex >= documentLines.length * 0.55) score += 10;
      if (documentNumericCount === 1) score += 10;
    }
    if (currency.explicit) {
      reasons.push("EXPLICIT_CURRENCY");
      score += 10;
    }
    if (currency.hint) {
      reasons.push("JOURNEY_CURRENCY_HINT");
      score += 5;
    }
    if (numeric.ocrConfidence >= 0.8) {
      reasons.push("HIGH_OCR_CONFIDENCE");
      score += 5;
    }
    if (numeric.ocrConfidence < 0.5) {
      reasons.push("LOW_OCR_CONFIDENCE");
      score -= 10;
    }
    occurrences.push({
      decimal: numeric.decimal,
      currency: currency.code,
      minorUnits: units,
      currencyCandidateIds: currency.ids,
      numericCandidateIds: [numeric.id],
      score: Math.max(0, Math.min(100, score)),
      reasons,
      evidence: [
        ...numeric.evidence,
        ...(label
          ? labelEvidence(adjacent ? input.lines[lineIndex - 1] : line, label)
          : []),
      ],
      ambiguousCurrency: currency.ambiguous,
      ambiguousSeparator: input.numericCandidates.some(
        (item) => item.tokenId === numeric.tokenId && item.decimal !== numeric.decimal,
      ),
    });
  }
  const groups = new Map<string, AmountCandidateB2>();
  for (const item of occurrences) {
    const key = `${item.currency ?? "?"}:${canonical(item.decimal)}`;
    const previous = groups.get(key);
    if (!previous) {
      groups.set(key, item);
      continue;
    }
    const best = item.score > previous.score ? item : previous;
    const other = best === item ? previous : item;
    const bestDocumentId = input.lines.find(
      (line) => line.id === best.evidence[0]?.lineId,
    )?.documentId;
    const otherDocumentId = input.lines.find(
      (line) => line.id === other.evidence[0]?.lineId,
    )?.documentId;
    const reinforced =
      !best.reasons.includes("DUPLICATE_FINAL_AMOUNT") &&
      best.numericCandidateIds[0] !== other.numericCandidateIds[0] &&
      bestDocumentId === otherDocumentId &&
      best.reasons.some(positive) &&
      other.reasons.some(positive);
    groups.set(key, {
      ...best,
      score: Math.min(100, best.score + (reinforced ? 10 : 0)),
      numericCandidateIds: [
        ...new Set([...best.numericCandidateIds, ...other.numericCandidateIds]),
      ],
      currencyCandidateIds: [
        ...new Set([...best.currencyCandidateIds, ...other.currencyCandidateIds]),
      ],
      evidence: [
        ...best.evidence,
        ...other.evidence.filter(
          (entry) =>
            !best.evidence.some(
              (prior) =>
                prior.observationId === entry.observationId &&
                prior.start === entry.start &&
                prior.end === entry.end,
            ),
        ),
      ],
      reasons: [
        ...new Set([
          ...best.reasons,
          ...other.reasons,
          ...(reinforced ? ["DUPLICATE_FINAL_AMOUNT" as const] : []),
        ]),
      ],
      ambiguousCurrency: best.ambiguousCurrency || other.ambiguousCurrency,
      ambiguousSeparator: best.ambiguousSeparator || other.ambiguousSeparator,
    });
  }
  const amountCandidates = [...groups.values()].sort(
    (a, b) =>
      b.score - a.score ||
      a.evidence[0].lineId.localeCompare(b.evidence[0].lineId, undefined, {
        numeric: true,
      }) ||
      a.decimal.localeCompare(b.decimal) ||
      (a.currency ?? "").localeCompare(b.currency ?? ""),
  );
  const top = amountCandidates[0];
  const second = amountCandidates[1];
  const highConflict = Boolean(
    top &&
    second &&
    top.score >= 60 &&
    second.score >= 40 &&
    (top.decimal !== second.decimal || top.currency !== second.currency) &&
    top.reasons.some(positive) &&
    second.reasons.some(positive),
  );
  const separatorConflict = Boolean(
    top?.ambiguousSeparator &&
    input.numericCandidates.some(
      (item) =>
        item.tokenId ===
          top.numericCandidateIds
            .map(
              (id) =>
                input.numericCandidates.find((candidate) => candidate.id === id)?.tokenId,
            )
            .find(Boolean) &&
        canonical(item.decimal) !== canonical(top.decimal) &&
        occurrences.some((candidate) => candidate.numericCandidateIds.includes(item.id)),
    ),
  );
  const unresolved = Boolean(
    top &&
    (top.ambiguousCurrency ||
      separatorConflict ||
      (second &&
        top.score - second.score < 15 &&
        (top.decimal !== second.decimal || top.currency !== second.currency))),
  );
  const credible = Boolean(
    top &&
    top.score >= 60 &&
    top.reasons.some((reason) =>
      [
        "EXPLICIT_GRAND_TOTAL",
        "EXPLICIT_TOTAL",
        "AMOUNT_DUE",
        "AMOUNT_PAID",
        "DUPLICATE_FINAL_AMOUNT",
      ].includes(reason),
    ),
  );
  const status = !top
    ? "none"
    : credible && !highConflict && !unresolved
      ? "clear"
      : "ambiguous";
  const warnings: ReceiptAmountsB2["warnings"] = [];
  if (!credible) warnings.push("NO_RELIABLE_TOTAL");
  if (highConflict) warnings.push("CONFLICTING_TOTALS");
  if (separatorConflict) warnings.push("AMBIGUOUS_AMOUNT_SEPARATOR");
  if (top?.ambiguousCurrency) warnings.push("AMBIGUOUS_CURRENCY_SYMBOL");
  return { parserVersion: "receipt-b2", amountCandidates, status, warnings };
}

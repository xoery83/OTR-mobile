import type { Evidence, ReceiptDocumentB1, ReceiptLine } from "./receiptParserB1";

export type ReceiptParseContextB3 = {
  journeyStartDate?: string;
  journeyEndDate?: string;
  draftDate?: string;
  referenceDate?: string; // explicit clock input; never read ambient time
  locale?: string;
};
export type DateReasonB3 =
  | "VALID_CALENDAR_DATE"
  | "EXPLICIT_TRANSACTION_DATE"
  | "EXPLICIT_DATE_LABEL"
  | "UPPER_RECEIPT"
  | "SINGLE_DATE_TOKEN"
  | "HIGH_OCR_CONFIDENCE"
  | "JOURNEY_RANGE_HINT"
  | "OUTSIDE_JOURNEY_RANGE"
  | "EXPENSE_DATE_HINT"
  | "LOCALE_ORDER_HINT"
  | "AMBIGUOUS_NUMERIC_DATE"
  | "EXPIRY_DATE_PENALTY"
  | "PROMOTION_DATE_PENALTY"
  | "PRINT_DATE_PENALTY"
  | "STATEMENT_PERIOD_PENALTY"
  | "CHECKIN_CHECKOUT_PENALTY"
  | "DOB_PENALTY";
export type MerchantReasonB3 =
  | "TOP_OF_RECEIPT"
  | "PROMINENT_HEADER"
  | "HIGH_OCR_CONFIDENCE"
  | "BUSINESS_NAME_SHAPE"
  | "BEFORE_METADATA"
  | "REPEATED_NAME"
  | "GENERIC_RECEIPT_HEADER_PENALTY"
  | "ADDRESS_PENALTY"
  | "CONTACT_PENALTY"
  | "TAX_ID_PENALTY"
  | "TRANSACTION_ID_PENALTY"
  | "PAYMENT_TEXT_PENALTY"
  | "DATE_OR_AMOUNT_PENALTY"
  | "NON_MERCHANT_TEXT_PENALTY";
export type DateCandidateB3 = {
  date: string;
  format: "iso" | "numeric" | "textual" | "cjk";
  score: number; // deterministic ranking points, not probability
  reasons: DateReasonB3[];
  evidence: Evidence[];
  ambiguousOrder: boolean;
};
export type MerchantCandidateB3 = {
  name: string;
  score: number; // deterministic ranking points, not probability
  reasons: MerchantReasonB3[];
  evidence: Evidence[];
};
export type ReceiptDateMerchantB3 = {
  parserVersion: "receipt-b3";
  dateCandidates: DateCandidateB3[];
  merchantCandidates: MerchantCandidateB3[];
  merchantExclusions: { reasons: MerchantReasonB3[]; evidence: Evidence[] }[];
  dateStatus: "clear" | "ambiguous" | "none";
  merchantStatus: "clear" | "ambiguous" | "none";
  warnings: (
    | "NO_RELIABLE_DATE"
    | "AMBIGUOUS_DATE_ORDER"
    | "MULTIPLE_DATES"
    | "CONFLICTING_TRANSACTION_DATES"
    | "NO_RELIABLE_MERCHANT"
    | "MULTIPLE_MERCHANTS"
  )[];
};

type Match = {
  start: number;
  end: number;
  parts: [number, number, number];
  format: DateCandidateB3["format"];
  order?: "dmy" | "mdy" | "ymd";
  ambiguous?: boolean;
};
const monthNames: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  aou: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const monthPattern =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Ao[uû](?:t)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const patterns = [
  { regex: /(?<!\d)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)/g, format: "iso" as const },
  {
    regex: /(?<!\d)(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?(?!\d)/g,
    format: "cjk" as const,
  },
  {
    regex: /(?<!\d)(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})(?!\d)/g,
    format: "numeric" as const,
  },
  {
    regex: new RegExp(
      `(?<!\\p{L})(\\d{1,2})\\s+(${monthPattern})\\s*,?\\s*(\\d{4})(?!\\d)`,
      "giu",
    ),
    format: "textual" as const,
  },
  {
    regex: new RegExp(
      `(?<!\\p{L})(${monthPattern})\\s+(\\d{1,2}),?\\s*(\\d{4})(?!\\d)`,
      "giu",
    ),
    format: "textual" as const,
  },
];
const positiveDate =
  /\b(?:TRANSACTION|PURCHASE|SALE|PAYMENT|RECEIPT)\s+DATE\b|\bPAYMENT\b|(?:交易日期|消费日期|消費日期|付款日期|取引日|購入日|お買上日|お買い上げ日)/i;
const genericDate = /\bDATE\b|(?:日期|日付)/i;
const expiryDate =
  /\b(?:EXPIRY|EXPIRES?|EXPIRATION|VALID\s+UNTIL|CARD\s+EXP)\b|(?:有効期限|有效期|有效期限|到期日)/i;
const promotionDate = /\b(?:PROMO(?:TION)?|COUPON|OFFER)\b|(?:优惠券|優惠券|クーポン)/i;
const printedDate = /\b(?:PRINTED|GENERATED|ISSUED\s+AT)\b|(?:印刷日|打印日期)/i;
const statementDate =
  /\b(?:STATEMENT\s+PERIOD|BILLING\s+PERIOD)\b|(?:账单周期|賬單週期)/i;
const hotelDate =
  /\b(?:CHECK\s*IN|CHECK\s*OUT|ARRIVAL|DEPARTURE)\b|(?:入住|退房|チェックイン|チェックアウト)/i;
const dobDate = /\b(?:DOB|DATE\s+OF\s+BIRTH|BIRTHDAY)\b|(?:出生日期|生年月日)/i;

function iso(year: number, month: number, day: number) {
  if (year < 1900 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31)
    return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function yearFromTwoDigits(two: number, context: ReceiptParseContextB3) {
  const anchor = context.referenceDate;
  if (
    !anchor ||
    !/^\d{4}-\d{2}-\d{2}$/.test(anchor) ||
    !iso(+anchor.slice(0, 4), +anchor.slice(5, 7), +anchor.slice(8))
  )
    return null;
  const reference = +anchor.slice(0, 4);
  const candidates = [1900 + two, 2000 + two];
  const close = candidates.filter((year) => Math.abs(year - reference) <= 20);
  return close.length === 1 ? close[0] : null;
}

function evidenceFor(line: ReceiptLine, start: number, end: number): Evidence[] {
  const evidence: Evidence[] = [];
  let cursor = 0;
  for (const fragment of line.fragments) {
    const raw = fragment.text.trim();
    const position = line.text.indexOf(raw, cursor);
    if (position < 0) continue;
    const finish = position + raw.length;
    if (position < end && finish > start) {
      const leading = fragment.text.length - fragment.text.trimStart().length;
      evidence.push({
        observationId: fragment.id,
        lineId: line.id,
        start: leading + Math.max(0, start - position),
        end: leading + Math.min(raw.length, end - position),
      });
    }
    cursor = finish;
  }
  return evidence;
}

function extractDates(line: ReceiptLine, context: ReceiptParseContextB3): Match[] {
  const text = line.text;
  const matches: Match[] = [];
  for (const { regex, format } of patterns) {
    for (const match of text.matchAll(regex)) {
      const start = match.index;
      const end = start + match[0].length;
      if (matches.some((prior) => start < prior.end && end > prior.start)) continue;
      if (format === "iso" || format === "cjk") {
        matches.push({
          start,
          end,
          parts: [+match[1], +match[2], +match[3]],
          format,
          order: "ymd",
        });
      } else if (format === "textual") {
        const monthFirst = /^[A-Za-z]/.test(match[1]);
        const month =
          monthNames[
            (monthFirst ? match[1] : match[2])
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .slice(0, 3)
              .toLowerCase()
          ];
        matches.push({
          start,
          end,
          parts: [+match[3], month, +(monthFirst ? match[2] : match[1])],
          format,
        });
      } else {
        const first = +match[1],
          second = +match[2];
        const year =
          match[3].length === 2 ? yearFromTwoDigits(+match[3], context) : +match[3];
        if (year === null) continue;
        const dmy = iso(year, second, first);
        const mdy = iso(year, first, second);
        if (dmy)
          matches.push({
            start,
            end,
            parts: [year, second, first],
            format,
            order: "dmy",
            ambiguous: Boolean(mdy && mdy !== dmy),
          });
        if (mdy && mdy !== dmy)
          matches.push({
            start,
            end,
            parts: [year, first, second],
            format,
            order: "mdy",
            ambiguous: Boolean(dmy),
          });
      }
    }
  }
  return matches.filter((match) => iso(...match.parts) !== null);
}

const dateRules: { pattern: RegExp; reason: DateReasonB3; points: number }[] = [
  { pattern: expiryDate, reason: "EXPIRY_DATE_PENALTY", points: -80 },
  { pattern: promotionDate, reason: "PROMOTION_DATE_PENALTY", points: -70 },
  { pattern: dobDate, reason: "DOB_PENALTY", points: -80 },
  { pattern: statementDate, reason: "STATEMENT_PERIOD_PENALTY", points: -70 },
  { pattern: hotelDate, reason: "CHECKIN_CHECKOUT_PENALTY", points: -35 },
  { pattern: printedDate, reason: "PRINT_DATE_PENALTY", points: -35 },
  { pattern: positiveDate, reason: "EXPLICIT_TRANSACTION_DATE", points: 45 },
  { pattern: genericDate, reason: "EXPLICIT_DATE_LABEL", points: 25 },
];

function dateLabel(line: ReceiptLine, match: Match, previous?: ReceiptLine) {
  const matches = (source: ReceiptLine) => {
    const found = dateRules.flatMap(({ pattern, reason, points }) =>
      [...source.text.matchAll(new RegExp(pattern.source, "gi"))].map((item) => ({
        start: item.index,
        end: item.index + item[0].length,
        reason,
        points,
      })),
    );
    return found.filter(
      (item) =>
        item.reason !== "EXPLICIT_DATE_LABEL" ||
        !found.some(
          (other) =>
            other.reason !== "EXPLICIT_DATE_LABEL" &&
            other.start <= item.start &&
            item.start - other.end <= 10,
        ),
    );
  };
  let source = line;
  let labels = matches(line);
  if (!labels.length && previous && !/\d/.test(previous.text)) {
    const gap = line.boundingBox.y - previous.boundingBox.y - previous.boundingBox.height;
    if (
      gap >= -0.005 &&
      gap <= Math.max(line.boundingBox.height, previous.boundingBox.height) * 1.5
    ) {
      source = previous;
      labels = matches(previous);
    }
  }
  labels.sort((a, b) => {
    const distance = (label: (typeof labels)[number]) =>
      Math.max(0, label.start - match.end, match.start - label.end);
    return distance(a) - distance(b) || a.start - b.start;
  });
  const label = labels[0];
  return label
    ? {
        reason: label.reason,
        points: label.points,
        evidence: evidenceFor(source, label.start, label.end),
      }
    : null;
}

function dateCandidates(
  input: ReceiptDocumentB1,
  context: ReceiptParseContextB3,
): DateCandidateB3[] {
  const lineMatches = input.lines.map((line) => extractDates(line, context));
  const tokenCounts = new Map<string | undefined, Set<string>>();
  lineMatches.forEach((matches, index) => {
    const documentId = input.lines[index].documentId;
    const tokens = tokenCounts.get(documentId) ?? new Set<string>();
    matches.forEach((match) => tokens.add(`${index}:${match.start}:${match.end}`));
    tokenCounts.set(documentId, tokens);
  });
  const candidates: DateCandidateB3[] = [];
  for (const [index, line] of input.lines.entries()) {
    const prior = input.lines[index - 1];
    const previous = prior?.documentId === line.documentId ? prior : undefined;
    for (const match of lineMatches[index]) {
      const date = iso(...match.parts)!;
      const reasons: DateReasonB3[] = ["VALID_CALENDAR_DATE"];
      let score = 40;
      const label = dateLabel(line, match, previous);
      if (label) {
        reasons.push(label.reason);
        score += label.points;
      }
      if (line.boundingBox.y < 0.35) {
        reasons.push("UPPER_RECEIPT");
        score += 5;
      }
      if (tokenCounts.get(line.documentId)?.size === 1) {
        reasons.push("SINGLE_DATE_TOKEN");
        score += 10;
      }
      if (line.fragments.some((fragment) => fragment.confidence >= 0.8)) {
        reasons.push("HIGH_OCR_CONFIDENCE");
        score += 5;
      }
      if (
        context.journeyStartDate &&
        context.journeyEndDate &&
        iso(
          +context.journeyStartDate.slice(0, 4),
          +context.journeyStartDate.slice(5, 7),
          +context.journeyStartDate.slice(8),
        ) === context.journeyStartDate &&
        iso(
          +context.journeyEndDate.slice(0, 4),
          +context.journeyEndDate.slice(5, 7),
          +context.journeyEndDate.slice(8),
        ) === context.journeyEndDate
      ) {
        if (date >= context.journeyStartDate && date <= context.journeyEndDate) {
          reasons.push("JOURNEY_RANGE_HINT");
          score += 10;
        } else {
          reasons.push("OUTSIDE_JOURNEY_RANGE");
          score -= 10;
        }
      }
      if (context.draftDate === date) {
        reasons.push("EXPENSE_DATE_HINT");
        score += 10;
      }
      if (match.ambiguous) {
        reasons.push("AMBIGUOUS_NUMERIC_DATE");
        if (
          (context.locale?.toLowerCase().startsWith("en-us") && match.order === "mdy") ||
          (context.locale &&
            !context.locale.toLowerCase().startsWith("en-us") &&
            match.order === "dmy")
        ) {
          reasons.push("LOCALE_ORDER_HINT");
          score += 5;
        }
      }
      candidates.push({
        date,
        format: match.format,
        score: Math.max(0, Math.min(100, score)),
        reasons,
        evidence: [
          ...evidenceFor(line, match.start, match.end),
          ...(label?.evidence ?? []),
        ],
        ambiguousOrder: Boolean(match.ambiguous),
      });
    }
  }
  const byDate = new Map<string, DateCandidateB3>();
  for (const candidate of candidates) {
    const prior = byDate.get(candidate.date);
    if (!prior) {
      byDate.set(candidate.date, candidate);
      continue;
    }
    const best = candidate.score > prior.score ? candidate : prior;
    const other = best === candidate ? prior : candidate;
    const bestLine = best.evidence[0]?.lineId;
    const otherLine = other.evidence[0]?.lineId;
    const bestDocument = bestLine?.includes(":") ? bestLine.split(":")[0] : undefined;
    const otherDocument = otherLine?.includes(":") ? otherLine.split(":")[0] : undefined;
    byDate.set(candidate.date, {
      ...best,
      evidence:
        bestDocument !== otherDocument
          ? [
              ...best.evidence,
              ...other.evidence.filter(
                (item) =>
                  !best.evidence.some(
                    (entry) =>
                      entry.observationId === item.observationId &&
                      entry.start === item.start &&
                      entry.end === item.end,
                  ),
              ),
            ]
          : best.evidence,
    });
  }
  return [...byDate.values()].sort(
    (a, b) => b.score - a.score || a.date.localeCompare(b.date),
  );
}

const genericHeader =
  /^(?:RECEIPT|TAX\s+INVOICE|INVOICE|SALE|THANK\s+YOU|CUSTOMER\s+COPY|MERCHANT\s+COPY|EFTPOS|TRANSACTION\s+APPROVED|收据|收據|发票|發票|谢谢|謝謝|領収書|レシート|ありがとうございます|お買上票)$/i;
const address =
  /\b(?:STREET|ST|ROAD|RD|AVENUE|AVE|LANE|LN|DRIVE|DR|PO\s*BOX|POSTCODE|ZIP|CITY|SUBURB)\b|^\d{1,5}\s+\p{L}|(?:路|街|号|號|丁目|番地|郵便番号)/iu;
const contact =
  /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:PHONE|PH|TEL|FAX|MOBILE)\b|\+?\d[\d\s-]{7,}\d)/i;
const taxId = /\b(?:GST|VAT|ABN|NZBN|TAX\s*ID|REG(?:ISTRATION)?\s*NO)\b/i;
const transactionId =
  /\b(?:RECEIPT\s*(?:NO|#)|ORDER\s*(?:NO|#)|TRANSACTION\s*(?:NO|ID|#)|TERMINAL|STORE\s*(?:ID|NO)|REF(?:ERENCE)?\s*(?:NO|#))\b/i;
const payment =
  /\b(?:CARD|CASH|EFTPOS|PAYMENT|PAID|TOTAL|SUBTOTAL|CHANGE|BALANCE\s+DUE|APPROVED)\b|(?:合计|合計|总计|總計|小计|小計|お支払|お会計)/i;
const money = /(?:[$€£¥]\s*\d|\d[.,]\d{2}\b|\b(?:NZD|USD|AUD|EUR|CNY|JPY)\s*\d)/i;
const nonMerchantText =
  /^(?:THANK\s+YOU\b|WELCOME\b|SCAN\b|PHOTO\b|PHOTOS\b|EDIT\b|CROP\b|SHARE\b|CANCEL\b|DONE\b|BACK\b|NEXT\b|ITEM\b|PRODUCT\b)/i;

function merchantCandidates(
  input: ReceiptDocumentB1,
  context: ReceiptParseContextB3,
): {
  ranked: MerchantCandidateB3[];
  exclusions: ReceiptDateMerchantB3["merchantExclusions"];
} {
  const medianHeights = new Map<string | undefined, number>();
  for (const line of input.lines) {
    if (medianHeights.has(line.documentId)) continue;
    const heights = input.lines
      .filter((item) => item.documentId === line.documentId)
      .map((item) => item.boundingBox.height)
      .sort((a, b) => a - b);
    medianHeights.set(
      line.documentId,
      heights[Math.floor((heights.length - 1) / 2)] ?? 0.025,
    );
  }
  const metadataIndexes = new Map<string | undefined, number>();
  input.lines.forEach((line, index) => {
    if (
      !metadataIndexes.has(line.documentId) &&
      (address.test(line.text) ||
        contact.test(line.text) ||
        taxId.test(line.text) ||
        transactionId.test(line.text))
    )
      metadataIndexes.set(line.documentId, index);
  });
  const candidates: MerchantCandidateB3[] = [];
  const exclusions: ReceiptDateMerchantB3["merchantExclusions"] = [];
  for (const [index, line] of input.lines.entries()) {
    const name = line.text.trim().replace(/\s+/g, " ");
    if (
      line.boundingBox.y > 0.55 ||
      name.length < 2 ||
      name.length > 60 ||
      !/[\p{L}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name)
    )
      continue;
    const reasons: MerchantReasonB3[] = [];
    if (genericHeader.test(name)) reasons.push("GENERIC_RECEIPT_HEADER_PENALTY");
    if (address.test(name)) reasons.push("ADDRESS_PENALTY");
    const hasTaxId = taxId.test(name);
    if (contact.test(name) && !hasTaxId) reasons.push("CONTACT_PENALTY");
    if (hasTaxId) reasons.push("TAX_ID_PENALTY");
    if (transactionId.test(name)) reasons.push("TRANSACTION_ID_PENALTY");
    if (payment.test(name)) reasons.push("PAYMENT_TEXT_PENALTY");
    if (nonMerchantText.test(name)) reasons.push("NON_MERCHANT_TEXT_PENALTY");
    if (
      money.test(name) ||
      extractDates(line, context).length ||
      /^\s*\d{1,2}:\d{2}/.test(name)
    )
      reasons.push("DATE_OR_AMOUNT_PENALTY");
    if (reasons.length) {
      exclusions.push({
        reasons,
        evidence: line.fragments.map((fragment) => ({
          observationId: fragment.id,
          lineId: line.id,
          start: 0,
          end: fragment.text.length,
        })),
      });
      continue;
    }
    let score = 25;
    reasons.push("BUSINESS_NAME_SHAPE");
    if (line.boundingBox.y < 0.25) {
      score += 25;
      reasons.push("TOP_OF_RECEIPT");
    } else if (line.boundingBox.y < 0.4) {
      score += 10;
      reasons.push("TOP_OF_RECEIPT");
    }
    if (line.boundingBox.height >= (medianHeights.get(line.documentId) ?? 0.025) * 1.3) {
      score += 15;
      reasons.push("PROMINENT_HEADER");
    }
    if (line.fragments.some((fragment) => fragment.confidence >= 0.8)) {
      score += 5;
      reasons.push("HIGH_OCR_CONFIDENCE");
    }
    const metadataIndex = metadataIndexes.get(line.documentId);
    if (metadataIndex === undefined || index < metadataIndex) {
      score += 10;
      reasons.push("BEFORE_METADATA");
    }
    candidates.push({
      name,
      score: Math.min(100, score),
      reasons,
      evidence: line.fragments.map((fragment) => ({
        observationId: fragment.id,
        lineId: line.id,
        start: 0,
        end: fragment.text.length,
      })),
    });
  }
  const byName = new Map<string, MerchantCandidateB3>();
  for (const candidate of candidates) {
    const key = candidate.name.toLocaleLowerCase();
    const prior = byName.get(key);
    if (!prior) byName.set(key, candidate);
    else {
      const priorDocumentId = input.lines.find(
        (line) => line.id === prior.evidence[0]?.lineId,
      )?.documentId;
      const candidateDocumentId = input.lines.find(
        (line) => line.id === candidate.evidence[0]?.lineId,
      )?.documentId;
      const reinforced =
        priorDocumentId === candidateDocumentId &&
        !prior.reasons.includes("REPEATED_NAME");
      byName.set(key, {
        ...prior,
        score: Math.min(
          100,
          Math.max(prior.score, candidate.score) + (reinforced ? 10 : 0),
        ),
        reasons: [
          ...new Set([
            ...prior.reasons,
            ...candidate.reasons,
            ...(reinforced ? ["REPEATED_NAME" as const] : []),
          ]),
        ],
        evidence: [...prior.evidence, ...candidate.evidence],
      });
    }
  }
  const ranked = [...byName.values()].sort(
    (a, b) =>
      b.score - a.score ||
      a.evidence[0].lineId.localeCompare(b.evidence[0].lineId, undefined, {
        numeric: true,
      }) ||
      a.name.localeCompare(b.name),
  );
  return { ranked, exclusions };
}

export function parseReceiptDateMerchantB3(
  input: ReceiptDocumentB1,
  context: ReceiptParseContextB3 = {},
): ReceiptDateMerchantB3 {
  const dates = dateCandidates(input, context);
  const { ranked: merchants, exclusions } = merchantCandidates(input, context);
  const explicitDates = dates.filter((item) =>
    item.reasons.includes("EXPLICIT_TRANSACTION_DATE"),
  );
  const conflictingTransactionDates =
    new Set(
      explicitDates.map(
        (item) => `${item.evidence[0]?.observationId}:${item.evidence[0]?.start}`,
      ),
    ).size > 1;
  const dateStatus = !dates.length
    ? "none"
    : dates[0].score >= 60 &&
        !conflictingTransactionDates &&
        (!dates[1] || dates[0].score - dates[1].score >= 15)
      ? "clear"
      : "ambiguous";
  const merchantStatus = !merchants.length
    ? "none"
    : merchants[0].score >= 60 &&
        (!merchants[1] || merchants[0].score - merchants[1].score >= 15)
      ? "clear"
      : "ambiguous";
  const warnings: ReceiptDateMerchantB3["warnings"] = [];
  if (dateStatus !== "clear") warnings.push("NO_RELIABLE_DATE");
  if (dates.some((candidate) => candidate.ambiguousOrder))
    warnings.push("AMBIGUOUS_DATE_ORDER");
  if (dates.length > 1) warnings.push("MULTIPLE_DATES");
  if (conflictingTransactionDates) warnings.push("CONFLICTING_TRANSACTION_DATES");
  if (merchantStatus !== "clear") warnings.push("NO_RELIABLE_MERCHANT");
  if (merchants.length > 1) warnings.push("MULTIPLE_MERCHANTS");
  return {
    parserVersion: "receipt-b3",
    dateCandidates: dates,
    merchantCandidates: merchants,
    merchantExclusions: exclusions,
    dateStatus,
    merchantStatus,
    warnings,
  };
}

import type { OcrDocument } from "@/native/receiptOcr";
import { currencyScale } from "@/domain/ledger/currency";

type Box = OcrDocument["observations"][number]["boundingBox"];
export type Evidence = {
  observationId: string;
  lineId: string;
  start: number;
  end: number;
};
export type ReceiptFragment = {
  id: string;
  text: string;
  confidence: number;
  boundingBox: Box;
};
export type ReceiptLine = {
  id: string;
  documentId?: string;
  text: string;
  boundingBox: Box;
  fragments: ReceiptFragment[];
};
export type NumericCandidate = {
  id: string;
  tokenId: string;
  decimal: string;
  raw: string;
  ocrConfidence: number;
  score: number; // extraction strength, never final-total likelihood
  reasons: (
    | "NUMERIC_FORMAT_STRONG"
    | "NUMERIC_FORMAT_AMBIGUOUS"
    | "NUMERIC_INTEGER"
    | "ADJACENT_CURRENCY"
    | "HIGH_OCR_CONFIDENCE"
    | "LOW_OCR_CONFIDENCE"
  )[];
  evidence: Evidence[];
  currencyCandidateIds: string[];
};
export type CurrencyCandidate = {
  id: string;
  code: string | null;
  possibleCodes: string[];
  raw: string | null;
  ocrConfidence: number | null;
  source: "receipt" | "context";
  strength: "code" | "region-symbol" | "distinct-symbol" | "ambiguous-symbol" | "hint";
  score: number; // evidence strength, never a calibrated probability
  reasons: (
    | "EXPLICIT_CURRENCY_CODE"
    | "REGION_QUALIFIED_CURRENCY_SYMBOL"
    | "DISTINCT_CURRENCY_SYMBOL"
    | "AMBIGUOUS_CURRENCY_SYMBOL"
    | "JOURNEY_CURRENCY_HINT"
    | "ADJACENT_CURRENCY"
    | "HIGH_OCR_CONFIDENCE"
    | "LOW_OCR_CONFIDENCE"
  )[];
  evidence: Evidence[];
  numericCandidateIds: string[];
};
export type ReceiptDocumentB1 = {
  parserVersion: "receipt-b1";
  lines: ReceiptLine[];
  numericCandidates: NumericCandidate[];
  currencyCandidates: CurrencyCandidate[];
  warnings: ("AMBIGUOUS_AMOUNT_SEPARATOR" | "IGNORED_OBSERVATION" | "INPUT_TRUNCATED")[];
};

type Token = { fragment: ReceiptFragment; lineId: string; start: number; end: number };
type CurrencyToken = Omit<CurrencyCandidate, "id" | "numericCandidateIds"> & {
  token?: Token;
};
const numberPattern =
  /(?:(?<![\p{L}\p{N}])|(?<=[円元]))\d+(?:[.,]\d+)*(?=$|[^\p{L}\p{N}]|[円元])/gu;
const dateTimePattern =
  /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}:\d{2}(?::\d{2})?)\b|\d{4}年\d{1,2}月\d{1,2}日?/g;
const regionSymbolPattern = /NZ\$|AU\$|A\$|US\$|CN¥|JP¥/gi;
const codePattern = /\b(?:[A-Z]{3}|RMB)\b/gi;
const symbolPattern = /[€£$¥円元]/g;

function confidencePoints(value: number) {
  return value >= 0.8 ? 5 : value < 0.5 ? -10 : 0;
}

function confidenceReasons(
  value: number,
): ("HIGH_OCR_CONFIDENCE" | "LOW_OCR_CONFIDENCE")[] {
  return value >= 0.8
    ? ["HIGH_OCR_CONFIDENCE"]
    : value < 0.5
      ? ["LOW_OCR_CONFIDENCE"]
      : [];
}

function folded(text: string) {
  return [...text]
    .map((char) => {
      const normalized = char.normalize("NFKC");
      return normalized.length === char.length ? normalized : char;
    })
    .join("");
}

function boxUnion(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  };
}

function overlap(a: Box, b: Box) {
  return Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function sameLine(a: Box, b: Box) {
  const centerGap = Math.abs(a.y + a.height / 2 - b.y - b.height / 2);
  return (
    overlap(a, b) >= Math.min(a.height, b.height) * 0.45 &&
    centerGap <= Math.max(a.height, b.height) * 0.55
  );
}

function duplicate(a: ReceiptFragment, b: ReceiptFragment) {
  const x = Math.max(
    0,
    Math.min(
      a.boundingBox.x + a.boundingBox.width,
      b.boundingBox.x + b.boundingBox.width,
    ) - Math.max(a.boundingBox.x, b.boundingBox.x),
  );
  const y = overlap(a.boundingBox, b.boundingBox);
  const smaller = Math.min(
    a.boundingBox.width * a.boundingBox.height,
    b.boundingBox.width * b.boundingBox.height,
  );
  return a.text === b.text && smaller > 0 && (x * y) / smaller > 0.8;
}

function buildLines(document: OcrDocument) {
  let ignored = false;
  const fragments: ReceiptFragment[] = [];
  // ponytail: linear dedupe/grouping scans are bounded at 512 observations; index only if measured scans need it.
  for (const [index, observation] of document.observations.slice(0, 512).entries()) {
    const box = observation?.boundingBox;
    if (
      typeof observation?.text !== "string" ||
      !observation.text.trim() ||
      observation.text.length > 2048 ||
      !Number.isFinite(observation.confidence) ||
      observation.confidence < 0 ||
      observation.confidence > 1 ||
      !box ||
      ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
      box.width <= 0 ||
      box.height <= 0 ||
      box.x < 0 ||
      box.y < 0 ||
      box.x + box.width > 1.000001 ||
      box.y + box.height > 1.000001
    ) {
      ignored = true;
      continue;
    }
    const fragment = {
      id: `o${index}`,
      text: observation.text,
      confidence: observation.confidence,
      boundingBox: box,
    };
    if (!fragments.some((prior) => duplicate(prior, fragment))) fragments.push(fragment);
  }
  fragments.sort(
    (a, b) =>
      a.boundingBox.y +
        a.boundingBox.height / 2 -
        b.boundingBox.y -
        b.boundingBox.height / 2 ||
      a.boundingBox.x - b.boundingBox.x ||
      a.id.localeCompare(b.id),
  );
  const groups: ReceiptFragment[][] = [];
  for (const fragment of fragments) {
    const group = groups.find((candidate) =>
      sameLine(boxUnion(candidate.map((item) => item.boundingBox)), fragment.boundingBox),
    );
    if (group) group.push(fragment);
    else groups.push([fragment]);
  }
  const lines = groups
    .map((group) => {
      group.sort((a, b) => a.boundingBox.x - b.boundingBox.x || a.id.localeCompare(b.id));
      const text = group.reduce((joined, item, index) => {
        const previous = group[index - 1];
        if (!previous) return item.text.trim();
        const horizontalGap =
          item.boundingBox.x - previous.boundingBox.x - previous.boundingBox.width;
        const touches =
          horizontalGap <=
          Math.min(previous.boundingBox.height, item.boundingBox.height) * 0.25;
        const cjk =
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(
            previous.text.trim(),
          ) &&
          /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
            item.text.trim(),
          );
        return joined + (touches || cjk ? "" : " ") + item.text.trim();
      }, "");
      return {
        id: "",
        text,
        boundingBox: boxUnion(group.map((item) => item.boundingBox)),
        fragments: group,
      };
    })
    .sort(
      (a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x,
    );
  lines.forEach((line, index) => {
    line.id = `l${index}`;
  });
  return { lines, ignored, truncated: document.observations.length > 512 };
}

function normalizeInteger(value: string) {
  return value.replace(/^0+(?=\d)/, "");
}

function numberVariants(
  raw: string,
): { decimal: string; reason: NumericCandidate["reasons"][number]; score: number }[] {
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma < 0 && dot < 0)
    return [{ decimal: normalizeInteger(raw), reason: "NUMERIC_INTEGER", score: 10 }];
  if (comma >= 0 && dot >= 0) {
    const position = Math.max(comma, dot);
    const decimalMark = raw[position];
    const groupMark = decimalMark === "." ? "," : ".";
    const whole = raw.slice(0, position);
    const fraction = raw.slice(position + 1);
    const groups = whole.split(groupMark);
    if (
      fraction.length < 1 ||
      fraction.length > 3 ||
      groups.length < 2 ||
      !/^\d{1,3}$/.test(groups[0]) ||
      groups.slice(1).some((part) => !/^\d{3}$/.test(part)) ||
      whole.includes(decimalMark)
    )
      return [];
    return [
      {
        decimal: `${normalizeInteger(groups.join(""))}.${fraction}`,
        reason: "NUMERIC_FORMAT_STRONG",
        score: 30,
      },
    ];
  }
  const mark = comma >= 0 ? "," : ".";
  const parts = raw.split(mark);
  if (parts.length > 2) {
    if (
      !/^\d{1,3}$/.test(parts[0]) ||
      parts.slice(1).some((part) => !/^\d{3}$/.test(part))
    )
      return [];
    return [
      {
        decimal: normalizeInteger(parts.join("")),
        reason: "NUMERIC_FORMAT_STRONG",
        score: 30,
      },
    ];
  }
  const [whole, tail] = parts;
  if (!tail || tail.length > 3) return [];
  if (tail.length === 3 && whole.length <= 3)
    return [
      {
        decimal: normalizeInteger(whole + tail),
        reason: "NUMERIC_FORMAT_AMBIGUOUS",
        score: 15,
      },
      {
        decimal: `${normalizeInteger(whole)}.${tail}`,
        reason: "NUMERIC_FORMAT_AMBIGUOUS",
        score: 15,
      },
    ];
  return [
    {
      decimal: `${normalizeInteger(whole)}.${tail}`,
      reason: "NUMERIC_FORMAT_STRONG",
      score: 30,
    },
  ];
}

function evidence(token: Token): Evidence[] {
  return [
    {
      observationId: token.fragment.id,
      lineId: token.lineId,
      start: token.start,
      end: token.end,
    },
  ];
}

function tokenX(token: Token) {
  const length = Math.max(1, token.fragment.text.length);
  const box = token.fragment.boundingBox;
  return [
    box.x + (box.width * token.start) / length,
    box.x + (box.width * token.end) / length,
  ] as const;
}

function gap(a: Token, b: Token) {
  if (a.fragment.id === b.fragment.id)
    return Math.max(0, Math.max(a.start, b.start) - Math.min(a.end, b.end));
  const [a0, a1] = tokenX(a);
  const [b0, b1] = tokenX(b);
  return Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));
}

export function parseReceiptDocumentB1(
  document: OcrDocument,
  context: { journeyCurrency?: string } = {},
): ReceiptDocumentB1 {
  const { lines, ignored, truncated } = buildLines(document);
  const warnings: ReceiptDocumentB1["warnings"] = [];
  if (ignored) warnings.push("IGNORED_OBSERVATION");
  if (truncated) warnings.push("INPUT_TRUNCATED");
  const numericCandidates: NumericCandidate[] = [];
  const numericTokens = new Map<string, Token>();
  const currencyTokens: CurrencyToken[] = [];

  for (const line of lines)
    for (const fragment of line.fragments) {
      const search = folded(fragment.text);
      const blocked = [...search.matchAll(dateTimePattern)].map((match) => [
        match.index,
        match.index + match[0].length,
      ]);
      const contactLine =
        /^\s*(?:TEL|PHONE|MOBILE|CARD(?!\s+(?:PAYMENT|PAID)\b)|REF|REFERENCE|INVOICE|電話|カード番号|订单号)(?:\s|:|：|$)/i.test(
          search,
        );
      for (const match of search.matchAll(numberPattern)) {
        const raw = match[0];
        const start = match.index;
        const end = start + raw.length;
        const digits = raw.replace(/\D/g, "");
        const before = search.slice(Math.max(0, start - 12), start);
        if (
          contactLine ||
          digits.length > 12 ||
          blocked.some(([a, b]) => start < b && end > a) ||
          search[end] === "%" ||
          /(?:QTY|QUANTITY|数量|個数|×|X)\s*$/i.test(before) ||
          /[-/]/.test(search[start - 1] ?? "") ||
          (search[start - 1] === ":" &&
            !/(?:总计|總計|合计|合計|应付|應付|实付|實付|支付|付款)\s*:\s*(?:(?:现金|現金)\s*:)?$/.test(
              before,
            )) ||
          /[-/:]/.test(search[end] ?? "")
        )
          continue;
        const variants = numberVariants(raw);
        if (!variants.length) continue;
        if (variants.length > 1 && !warnings.includes("AMBIGUOUS_AMOUNT_SEPARATOR"))
          warnings.push("AMBIGUOUS_AMOUNT_SEPARATOR");
        const tokenId = `t${numericTokens.size}`;
        const token = { fragment, lineId: line.id, start, end };
        numericTokens.set(tokenId, token);
        for (const variant of variants) {
          if (variant.decimal.replace(/\D/g, "").length > 15) continue;
          numericCandidates.push({
            id: `n${numericCandidates.length}`,
            tokenId,
            decimal: variant.decimal,
            raw: fragment.text.slice(start, end),
            ocrConfidence: fragment.confidence,
            score: Math.max(
              0,
              Math.min(100, variant.score + confidencePoints(fragment.confidence)),
            ),
            reasons: [variant.reason, ...confidenceReasons(fragment.confidence)],
            evidence: evidence(token),
            currencyCandidateIds: [],
          });
        }
      }

      const covered: [number, number][] = [];
      for (const match of search.matchAll(regionSymbolPattern)) {
        const code = (
          {
            NZ$: "NZD",
            AU$: "AUD",
            A$: "AUD",
            US$: "USD",
            "CN¥": "CNY",
            "JP¥": "JPY",
          } as Record<string, string>
        )[match[0].toUpperCase()];
        const token = {
          fragment,
          lineId: line.id,
          start: match.index,
          end: match.index + match[0].length,
        };
        covered.push([token.start, token.end]);
        currencyTokens.push({
          code,
          possibleCodes: [],
          raw: fragment.text.slice(token.start, token.end),
          ocrConfidence: fragment.confidence,
          source: "receipt",
          strength: "region-symbol",
          score: Math.max(0, 45 + confidencePoints(fragment.confidence)),
          reasons: [
            "REGION_QUALIFIED_CURRENCY_SYMBOL",
            ...confidenceReasons(fragment.confidence),
          ],
          evidence: evidence(token),
          token,
        });
      }
      for (const match of search.matchAll(codePattern)) {
        const code = match[0].toUpperCase() === "RMB" ? "CNY" : match[0].toUpperCase();
        if (currencyScale(code) === null) continue;
        const token = {
          fragment,
          lineId: line.id,
          start: match.index,
          end: match.index + match[0].length,
        };
        currencyTokens.push({
          code,
          possibleCodes: [],
          raw: fragment.text.slice(token.start, token.end),
          ocrConfidence: fragment.confidence,
          source: "receipt",
          strength: "code",
          score: Math.max(0, 70 + confidencePoints(fragment.confidence)),
          reasons: ["EXPLICIT_CURRENCY_CODE", ...confidenceReasons(fragment.confidence)],
          evidence: evidence(token),
          token,
        });
      }
      for (const match of search.matchAll(symbolPattern)) {
        if (covered.some(([a, b]) => match.index >= a && match.index < b)) continue;
        const token = {
          fragment,
          lineId: line.id,
          start: match.index,
          end: match.index + match[0].length,
        };
        const symbol = match[0];
        const code =
          ({ "€": "EUR", "£": "GBP", 円: "JPY", 元: "CNY" } as Record<string, string>)[
            symbol
          ] ?? null;
        currencyTokens.push({
          code,
          possibleCodes: symbol === "¥" ? ["JPY", "CNY"] : [],
          raw: fragment.text.slice(token.start, token.end),
          ocrConfidence: fragment.confidence,
          source: "receipt",
          strength: code ? "distinct-symbol" : "ambiguous-symbol",
          score: Math.max(0, (code ? 45 : 15) + confidencePoints(fragment.confidence)),
          reasons: [
            code ? "DISTINCT_CURRENCY_SYMBOL" : "AMBIGUOUS_CURRENCY_SYMBOL",
            ...confidenceReasons(fragment.confidence),
          ],
          evidence: evidence(token),
          token,
        });
      }
    }

  const hint = context.journeyCurrency?.toUpperCase();
  if (hint && currencyScale(hint) !== null)
    currencyTokens.push({
      code: hint,
      possibleCodes: [],
      raw: null,
      ocrConfidence: null,
      source: "context",
      strength: "hint",
      score: 10,
      reasons: ["JOURNEY_CURRENCY_HINT"],
      evidence: [],
    });
  currencyTokens.sort(
    (a, b) =>
      b.score - a.score ||
      Number(a.token?.lineId.slice(1) ?? Infinity) -
        Number(b.token?.lineId.slice(1) ?? Infinity) ||
      (a.token?.start ?? 0) - (b.token?.start ?? 0) ||
      (a.code ?? "").localeCompare(b.code ?? ""),
  );
  const currencyCandidates: CurrencyCandidate[] = currencyTokens.map(
    ({ token: _token, ...candidate }, index) => ({
      ...candidate,
      id: `c${index}`,
      numericCandidateIds: [],
    }),
  );
  for (const [index, currency] of currencyTokens.entries()) {
    if (!currency.token) continue;
    const nearby = [...numericTokens.entries()]
      .filter(([, token]) => token.lineId === currency.token!.lineId)
      .map(([tokenId, token]) => ({
        tokenId,
        distance: gap(token, currency.token!),
        sameFragment: token.fragment.id === currency.token!.fragment.id,
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearby || nearby.distance > (nearby.sameFragment ? 4 : 0.08)) continue;
    for (const numeric of numericCandidates.filter(
      (candidate) => candidate.tokenId === nearby.tokenId,
    )) {
      numeric.currencyCandidateIds.push(`c${index}`);
      numeric.reasons.push("ADJACENT_CURRENCY");
      numeric.score = Math.min(100, numeric.score + 10);
      currencyCandidates[index].numericCandidateIds.push(numeric.id);
    }
    currencyCandidates[index].reasons.push("ADJACENT_CURRENCY");
  }
  return {
    parserVersion: "receipt-b1",
    lines,
    numericCandidates,
    currencyCandidates,
    warnings,
  };
}

import { createHash } from "node:crypto";

import { allocateEqual } from "../../src/domain/ledger/allocation";
import { assertValidExpenseAggregate } from "../../src/domain/ledger/validation";
import type {
  ExpenseBusinessStatus,
  ExpenseSettlementParticipation,
  ExpenseSplitMethod,
  ValuationPolicy,
} from "../../src/domain/ledger/types";

export const UI_POLISH_FIXTURE_VERSION = "ledger-ui-polish-v1" as const;
export const UI_POLISH_TARGET_PROJECT_REF = "tuqigdxrvrerfewsxqgm" as const;
export const UI_POLISH_SOURCE_JOURNEY_ID =
  "ae2fb30d-6e31-8ff9-8b14-f8a1b275cf65" as const;
export const UI_POLISH_SOURCE_NAME = "Europe 2026 Replay" as const;
export const UI_POLISH_JOURNEY_NAME = "Europe 2026 UI Polish" as const;

type Row = Record<string, unknown>;

export type UiPolishSource = {
  journey: Row;
  settings: Row;
  members: Row[];
  expenses: Row[];
  participants: Row[];
  splits: Row[];
  rateSnapshots: Row[];
  valuations: Row[];
};

export type UiPolishDataset = ReturnType<typeof buildUiPolishDataset>;

const memberNames = [
  "Leo",
  "Alexandra Montgomery-Winterbourne",
  "林晓",
  "Élodie François-Lefèvre",
  "Jón Þór Sigurðsson",
  "欧阳思远 · Avery",
  "Guðrún María Kristjánsdóttir",
  "Charlotte de Villeneuve-Saint-Clair",
] as const;

const languages = [
  "English",
  "简体中文",
  "繁體中文",
  "Français",
  "Nordic",
  "中文 + English",
  "Latin + accents",
] as const;

const places = [
  "Reykjavík",
  "Vík",
  "Jökulsárlón",
  "Ilulissat",
  "Nuuk",
  "Tórshavn",
  "Paris",
  "Chamonix",
  "Courmayeur",
  "Lauterbrunnen",
] as const;

const merchants = [
  "Harbour Market",
  "North Wind Café",
  "Glacier Pantry",
  "Blue Door Bakery",
  "Alpine Corner",
  "Midnight Sun Shop",
  "Old Town Kitchen",
  "Trailhead Store",
] as const;

const items = [
  "breakfast",
  "trail supplies",
  "ferry snacks",
  "museum tickets",
  "group dinner",
  "airport transfer",
  "apartment groceries",
  "mountain lunch",
] as const;

const zhPlaces = ["雷克雅未克", "冰岛南岸", "伊卢利萨特", "托尔斯港", "巴黎", "霞慕尼"];
const zhItems = ["早餐", "徒步补给", "渡轮零食", "博物馆门票", "大家的晚餐", "机场接送"];
const twPlaces = ["雷克雅維克", "冰島南岸", "伊盧利薩特", "托爾斯港", "巴黎", "霞慕尼"];
const twItems = ["早餐", "健行補給", "渡輪點心", "博物館門票", "團體晚餐", "機場接送"];
const frItems = [
  "petit-déjeuner",
  "déjeuner du groupe",
  "provisions de randonnée",
  "billets du musée",
  "dîner d'anniversaire",
  "transfert à l'aéroport",
];
const nordicItems = [
  "morgunmatur",
  "göngunesti",
  "ferjusnarl",
  "safnmiðar",
  "kvöldmatur",
  "flugrúta",
];

function uuidFor(kind: string, identity: string) {
  const bytes = createHash("sha256")
    .update(`${UI_POLISH_FIXTURE_VERSION}|${kind}|${identity}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function titleLengthClass(index: number) {
  if (index < 32) return "SHORT" as const;
  if (index < 89) return "NORMAL" as const;
  if (index < 114) return "LONG" as const;
  return "EXTREME" as const;
}

function titleStem(index: number, language: (typeof languages)[number]) {
  const place = places[index % places.length];
  const merchant = merchants[(index * 3) % merchants.length];
  const item = items[(index * 5) % items.length];
  const slot = index % 6;
  switch (language) {
    case "简体中文":
      return `${zhPlaces[slot]}${zhItems[(slot + index) % zhItems.length]}`;
    case "繁體中文":
      return `${twPlaces[slot]}${twItems[(slot + index) % twItems.length]}`;
    case "Français":
      return `${frItems[(slot + index) % frItems.length]} à ${place}`;
    case "Nordic":
      return `${merchant} — ${nordicItems[(slot + index) % nordicItems.length]}`;
    case "中文 + English":
      return `${zhPlaces[slot]} ${item} / ${zhItems[(slot + 2) % zhItems.length]}`;
    case "Latin + accents":
      return `${merchant} — crème, café & ${nordicItems[slot]}`;
    default:
      return `${merchant} ${item} — ${place}`;
  }
}

const shortTitles: Record<(typeof languages)[number], string[]> = {
  English: ["Alps lunch", "Paris métro", "Ferry snacks", "Trail coffee", "Museum stop"],
  简体中文: ["南岸晚餐", "巴黎早餐", "徒步补给", "港口午餐", "冰川门票"],
  繁體中文: ["渡輪點心", "高山午餐", "巴黎地鐵", "冰島早餐", "港口咖啡"],
  Français: ["Café à Vík", "Métro Paris", "Dîner alpin", "Billets musée", "Pain à Nuuk"],
  Nordic: ["Bónus mat", "Fiskur", "Vík kaffi", "Ferjusnarl", "Fjallamatur"],
  "中文 + English": [
    "巴黎 coffee",
    "南岸 lunch",
    "港口 snacks",
    "冰川 tickets",
    "高山 dinner",
  ],
  "Latin + accents": [
    "Crème & café",
    "Déjeuner",
    "Mývatn café",
    "Marché frais",
    "Pâtisserie",
  ],
};

export function syntheticTitle(index: number) {
  const language = languages[index % languages.length];
  const lengthClass = titleLengthClass(index);
  const stem = titleStem(index, language);
  if (lengthClass === "SHORT") {
    return {
      title: shortTitles[language][Math.floor(index / languages.length)],
      language,
      lengthClass,
    };
  }
  if (lengthClass === "NORMAL")
    return {
      title: `${stem} · day ${String((index % 18) + 1).padStart(2, "0")}`,
      language,
      lengthClass,
    };
  if (lengthClass === "LONG")
    return {
      title: `${stem} — shared stop before the afternoon walk and ferry connection`,
      language,
      lengthClass,
    };
  return {
    title: `${stem} — supplies for the whole group before the long mountain transfer, late arrival, next-day hike and weather backup plan`,
    language,
    lengthClass,
  };
}

export function syntheticDescription(index: number) {
  switch (index % 10) {
    case 5:
    case 6:
      return { description: "Shared during today's travel leg.", kind: "SHORT" as const };
    case 7:
      return {
        description:
          "Group stop before check-in.\nIncludes snacks, water and breakfast supplies for tomorrow.",
        kind: "MULTI_LINE" as const,
      };
    case 8:
      return {
        description:
          "Synthetic visual-test note for a busy travel day: the group stopped after the ferry, compared the planned trail timing, bought weather-ready supplies and kept a small buffer for the late apartment arrival.",
        kind: "LONG" as const,
      };
    case 9:
      return {
        description:
          "大家一起用餐 / shared dinner after the randonnée — météo changed quickly.",
        kind: "MIXED" as const,
      };
    default:
      return { description: null, kind: "NONE" as const };
  }
}

function number(row: Row, key: string) {
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value)) throw new Error(`INVALID_INTEGER:${key}`);
  return value;
}

function text(row: Row, key: string) {
  const value = row[key];
  if (typeof value !== "string" || !value) throw new Error(`INVALID_TEXT:${key}`);
  return value;
}

function nullableText(row: Row, key: string) {
  const value = row[key];
  return value === null || value === undefined ? null : String(value);
}

function boundaryExpenses(
  members: { id: string; displayName: string }[],
  settlementCurrency: string,
  settlementScale: number,
) {
  const all = members.map((member) => member.id);
  const specs = [
    {
      title:
        "Whole-group expedition provisions before the overnight ferry, mountain transfer, unpredictable Nordic weather and next morning's early trail departure",
      description:
        "This is deliberately long, entirely synthetic fixture copy used to verify wrapped text, expansion controls and accessibility reading order. ".repeat(
          12,
        ),
      category: "groceries",
      currency: "EUR",
      scale: 2,
      originalMinor: 24_680,
      settlementMinor: 44_210,
      participantIds: [all[0]],
      participation: "INCLUDED" as const,
      status: "ACCEPTED" as const,
    },
    {
      title: "冰岛南岸暴风雨改道后全体成员晚餐、第二天高地徒步早餐和紧急保暖补给",
      description: "临时改变路线后的团队补给。\n仅用于中文长文本换行和搜索测试。",
      category: "food",
      currency: "CNY",
      scale: 2,
      originalMinor: 88_888,
      settlementMinor: 20_140,
      participantIds: all,
      participation: "EXCLUDED" as const,
      status: "ACCEPTED" as const,
    },
    {
      title:
        "Déjeuner d'étape près de l'Aiguille du Midi — spécialités savoyardes, boissons fraîches et provisions pour l'équipe",
      description:
        "Texte synthétique avec caractères accentués pour contrôler le rendu français.",
      category: "food",
      currency: "EUR",
      scale: 2,
      originalMinor: 999_999_999,
      settlementMinor: 999_999_999,
      participantIds: all.slice(0, 7),
      participation: "INCLUDED" as const,
      status: "ACCEPTED" as const,
    },
    {
      title: "Tiny eki-ben 🍱🚄",
      description: null,
      category: "food",
      currency: "JPY",
      scale: 0,
      originalMinor: 1,
      settlementMinor: 1,
      participantIds: [all[4]],
      participation: "EXCLUDED" as const,
      status: "ACCEPTED" as const,
    },
    {
      title: "Kuwait layover coffee — 3-decimal display check",
      description: "12.345 KWD visual precision fixture.",
      category: "food",
      currency: "KWD",
      scale: 3,
      originalMinor: 12_345,
      settlementMinor: 6_700,
      participantIds: all,
      participation: "INCLUDED" as const,
      status: "ACCEPTED" as const,
    },
    {
      title: "Faroe weather detour — rate needed",
      description: "A valid RATE_REQUIRED visual state with no settlement valuation yet.",
      category: "transport",
      currency: "NOK",
      scale: 2,
      originalMinor: 45_678,
      settlementMinor: null,
      participantIds: all.slice(0, 6),
      participation: "EXCLUDED" as const,
      status: "RATE_REQUIRED" as const,
    },
    {
      title: "Bakery receipt ready 📎",
      description: "Receipt-link candidate for the normal attachment lifecycle.",
      category: "food",
      currency: "DKK",
      scale: 2,
      originalMinor: 7_500,
      settlementMinor: 1_850,
      participantIds: all.slice(0, 3),
      participation: "INCLUDED" as const,
      status: "ACCEPTED" as const,
    },
  ];

  return specs.map((spec, index) => {
    const id = uuidFor("boundary-expense", String(index));
    const splits = allocateEqual(
      spec.originalMinor,
      spec.settlementMinor,
      spec.participantIds,
    );
    return {
      expense: {
        id,
        payerMemberId: spec.participantIds[0],
        title: spec.title,
        description: spec.description,
        category: spec.category,
        occurredAt: new Date(Date.UTC(2026, 6, 25, 12 + index)).toISOString(),
        originalAmountMinor: spec.originalMinor,
        originalCurrency: spec.currency,
        originalScale: spec.scale,
        businessStatus: spec.status,
        settlementParticipation: spec.participation,
        importProvenance: {
          fixtureVersion: UI_POLISH_FIXTURE_VERSION,
          baselineClone: false,
          boundaryCase: index + 1,
        },
      },
      participants: spec.participantIds.map((memberId, displayOrder) => ({
        expenseId: id,
        memberId,
        displayNameSnapshot: members.find((member) => member.id === memberId)!
          .displayName,
        householdIdSnapshot: null,
        displayOrder,
      })),
      splits: splits.map((split) => ({ expenseId: id, ...split })),
      valuation:
        spec.status === "ACCEPTED"
          ? {
              id: uuidFor("boundary-valuation", String(index)),
              expenseId: id,
              policy: "MANUAL_AGREED" as const,
              originalAmountMinor: spec.originalMinor,
              originalCurrency: spec.currency,
              originalScale: spec.scale,
              settlementAmountMinor: spec.settlementMinor!,
              settlementCurrency,
              settlementScale,
              rateSnapshotId: null,
              reason: "Synthetic Dev-only UI fixture valuation.",
              effectiveAt: new Date(Date.UTC(2026, 6, 25, 12 + index)).toISOString(),
            }
          : null,
    };
  });
}

export function buildUiPolishDataset(source: UiPolishSource) {
  if (text(source.journey, "id") !== UI_POLISH_SOURCE_JOURNEY_ID)
    throw new Error("SOURCE_JOURNEY_REJECTED");
  if (text(source.journey, "name") !== UI_POLISH_SOURCE_NAME)
    throw new Error("SOURCE_NAME_REJECTED");
  if (source.members.length !== memberNames.length)
    throw new Error("MEMBER_COUNT_REJECTED");

  const journeyId = uuidFor("journey", UI_POLISH_JOURNEY_NAME);
  const sortedMembers = [...source.members].sort((left, right) => {
    const leftOwner = left.user_id ? 0 : 1;
    const rightOwner = right.user_id ? 0 : 1;
    return leftOwner - rightOwner || text(left, "id").localeCompare(text(right, "id"));
  });
  const members = sortedMembers.map((member, index) => ({
    id: uuidFor("member", text(member, "id")),
    userId: index === 0 ? nullableText(member, "user_id") : null,
    displayName: memberNames[index],
    role: index === 0 ? "owner" : String(member.role),
    status: index === 0 ? "linked" : "unlinked",
  }));
  if (!members[0].userId) throw new Error("LINKED_OWNER_REJECTED");
  const memberMap = new Map(
    sortedMembers.map((member, index) => [text(member, "id"), members[index]]),
  );

  const sortedExpenses = [...source.expenses].sort(
    (left, right) =>
      text(left, "occurred_at").localeCompare(text(right, "occurred_at")) ||
      text(left, "id").localeCompare(text(right, "id")),
  );
  const expenseMap = new Map(
    sortedExpenses.map((expense) => [
      text(expense, "id"),
      uuidFor("expense", text(expense, "id")),
    ]),
  );
  const expenses = sortedExpenses.map((expense, index) => {
    const title = syntheticTitle(index);
    const description = syntheticDescription(index);
    return {
      id: expenseMap.get(text(expense, "id"))!,
      payerMemberId: memberMap.get(text(expense, "payer_member_id"))!.id,
      title: title.title,
      description: description.description,
      category: text(expense, "category"),
      occurredAt: new Date(text(expense, "occurred_at")).toISOString(),
      originalAmountMinor: number(expense, "original_amount_minor"),
      originalCurrency: text(expense, "original_currency"),
      originalScale: number(expense, "original_currency_scale"),
      businessStatus: text(expense, "business_status") as ExpenseBusinessStatus,
      settlementParticipation: text(
        expense,
        "settlement_participation",
      ) as ExpenseSettlementParticipation,
      importProvenance: {
        fixtureVersion: UI_POLISH_FIXTURE_VERSION,
        baselineClone: true,
        titleLanguage: title.language,
        titleLength: title.lengthClass,
        descriptionKind: description.kind,
      },
    };
  });
  const participants = source.participants.map((participant) => ({
    expenseId: expenseMap.get(text(participant, "expense_id"))!,
    memberId: memberMap.get(text(participant, "member_id"))!.id,
    displayNameSnapshot: memberMap.get(text(participant, "member_id"))!.displayName,
    householdIdSnapshot: null,
    displayOrder: number(participant, "display_order"),
  }));
  const splits = source.splits.map((split) => ({
    expenseId: expenseMap.get(text(split, "expense_id"))!,
    memberId: memberMap.get(text(split, "member_id"))!.id,
    method: text(split, "split_method") as ExpenseSplitMethod,
    originalMinor: number(split, "original_amount_minor"),
    settlementMinor: number(split, "settlement_amount_minor"),
    weightUnits: split.weight_units === null ? null : number(split, "weight_units"),
    percentageUnits:
      split.percentage_units === null ? null : number(split, "percentage_units"),
    roundingAdjustmentMinor: number(split, "rounding_adjustment_minor"),
  }));
  const rateMap = new Map(
    source.rateSnapshots.map((rate) => [
      text(rate, "id"),
      uuidFor("rate", text(rate, "id")),
    ]),
  );
  const rateSnapshots = source.rateSnapshots.map((rate) => ({
    id: rateMap.get(text(rate, "id"))!,
    expenseId: expenseMap.get(text(rate, "expense_id"))!,
    baseCurrency: text(rate, "base_currency"),
    quoteCurrency: text(rate, "quote_currency"),
    decimalRate: String(rate.decimal_rate),
    effectiveDate: text(rate, "effective_date"),
  }));
  const valuations = source.valuations.map((valuation) => ({
    id: uuidFor("valuation", text(valuation, "id")),
    expenseId: expenseMap.get(text(valuation, "expense_id"))!,
    policy: text(valuation, "policy") as ValuationPolicy,
    originalAmountMinor: number(valuation, "original_amount_minor"),
    originalCurrency: text(valuation, "original_currency"),
    originalScale: number(valuation, "original_scale"),
    settlementAmountMinor: number(valuation, "settlement_amount_minor"),
    settlementCurrency: text(valuation, "settlement_currency"),
    settlementScale: number(valuation, "settlement_scale"),
    rateSnapshotId: rateMap.get(text(valuation, "rate_snapshot_id"))!,
    reason: null,
    effectiveAt: new Date(text(valuation, "effective_at")).toISOString(),
  }));

  const boundary = boundaryExpenses(
    members,
    text(source.settings, "settlement_currency"),
    number(source.settings, "settlement_scale"),
  );
  const allExpenses = [...expenses, ...boundary.map((item) => item.expense)];
  const allParticipants = [
    ...participants,
    ...boundary.flatMap((item) => item.participants),
  ];
  const allSplits = [...splits, ...boundary.flatMap((item) => item.splits)];
  const allValuations = [
    ...valuations,
    ...boundary.flatMap((item) => (item.valuation ? [item.valuation] : [])),
  ];

  const dataset = {
    targetProjectRef: UI_POLISH_TARGET_PROJECT_REF,
    fixtureVersion: UI_POLISH_FIXTURE_VERSION,
    sourceJourneyId: UI_POLISH_SOURCE_JOURNEY_ID,
    baselineExpenseCount: source.expenses.length,
    boundaryExpenseCount: boundary.length,
    journey: {
      id: journeyId,
      name: UI_POLISH_JOURNEY_NAME,
      startDate: nullableText(source.journey, "start_date"),
      endDate: nullableText(source.journey, "end_date"),
      createdByUserId: members[0].userId,
    },
    settings: {
      settlementCurrency: text(source.settings, "settlement_currency"),
      settlementScale: number(source.settings, "settlement_scale"),
      valuationPolicy: text(source.settings, "valuation_policy"),
    },
    members,
    expenses: allExpenses,
    participants: allParticipants,
    splits: allSplits,
    rateSnapshots,
    valuations: allValuations,
  };
  assertUiPolishDataset(dataset);
  return dataset;
}

export function assertUiPolishDataset(dataset: {
  targetProjectRef: string;
  fixtureVersion: string;
  sourceJourneyId: string;
  baselineExpenseCount: number;
  boundaryExpenseCount: number;
  journey: { id: string; name: string; createdByUserId: string | null };
  members: { id: string; userId: string | null; displayName: string }[];
  expenses: {
    id: string;
    payerMemberId: string;
    title: string;
    description: string | null;
    category: string;
    originalAmountMinor: number;
    originalCurrency: string;
    originalScale: number;
    businessStatus: ExpenseBusinessStatus;
    settlementParticipation: ExpenseSettlementParticipation;
  }[];
  participants: {
    expenseId: string;
    memberId: string;
    displayNameSnapshot: string;
    householdIdSnapshot: null;
  }[];
  splits: {
    expenseId: string;
    memberId: string;
    method: ExpenseSplitMethod;
    originalMinor: number;
    settlementMinor: number | null;
    weightUnits: number | null;
    percentageUnits: number | null;
    roundingAdjustmentMinor: number;
  }[];
  valuations: {
    id: string;
    expenseId: string;
    policy: ValuationPolicy;
    originalAmountMinor: number;
    originalCurrency: string;
    originalScale: number;
    settlementAmountMinor: number;
    settlementCurrency: string;
    settlementScale: number;
    rateSnapshotId: string | null;
    reason: string | null;
  }[];
}) {
  if (
    dataset.targetProjectRef !== UI_POLISH_TARGET_PROJECT_REF ||
    dataset.fixtureVersion !== UI_POLISH_FIXTURE_VERSION ||
    dataset.sourceJourneyId !== UI_POLISH_SOURCE_JOURNEY_ID ||
    dataset.journey.name !== UI_POLISH_JOURNEY_NAME
  )
    throw new Error("FIXTURE_IDENTITY_REJECTED");
  if (dataset.baselineExpenseCount !== 126 || dataset.boundaryExpenseCount !== 7)
    throw new Error("FIXTURE_COUNT_REJECTED");
  if (
    dataset.members.length !== 8 ||
    dataset.members.filter((member) => member.userId).length !== 1 ||
    dataset.journey.createdByUserId !==
      dataset.members.find((member) => member.userId)?.userId
  )
    throw new Error("FIXTURE_MEMBER_REJECTED");
  if (
    dataset.expenses.some(
      (expense) =>
        expense.title.length < 1 ||
        expense.title.length > 200 ||
        expense.title.startsWith("Imported ") ||
        (expense.description?.length ?? 0) > 5000,
    )
  )
    throw new Error("FIXTURE_TEXT_REJECTED");

  const memberIds = new Set(dataset.members.map((member) => member.id));
  for (const expense of dataset.expenses) {
    const participants = dataset.participants.filter(
      (participant) => participant.expenseId === expense.id,
    );
    const splits = dataset.splits.filter((split) => split.expenseId === expense.id);
    const valuation = dataset.valuations.find((item) => item.expenseId === expense.id);
    assertValidExpenseAggregate(
      {
        id: expense.id,
        journeyId: dataset.journey.id,
        revision: 1,
        title: expense.title,
        category: expense.category,
        payerMemberId: expense.payerMemberId,
        original: {
          minor: expense.originalAmountMinor,
          currency: expense.originalCurrency,
          scale: expense.originalScale,
        },
        participants,
        splits,
        valuation: valuation
          ? {
              id: valuation.id,
              policy: valuation.policy,
              original: {
                minor: valuation.originalAmountMinor,
                currency: valuation.originalCurrency,
                scale: valuation.originalScale,
              },
              settlement: {
                minor: valuation.settlementAmountMinor,
                currency: valuation.settlementCurrency,
                scale: valuation.settlementScale,
              },
              rateSnapshotId: valuation.rateSnapshotId,
              paymentRecordId: null,
              reason: valuation.reason,
            }
          : null,
        paymentRecords: [],
        status: expense.businessStatus,
        settlementParticipation: expense.settlementParticipation,
      },
      memberIds,
    );
  }
}

export function uiPolishFixtureStats(dataset: UiPolishDataset) {
  const count = (values: string[]) =>
    Object.fromEntries(
      [...new Set(values)]
        .sort()
        .map((value) => [value, values.filter((item) => item === value).length]),
    );
  const baseline = dataset.expenses.slice(0, dataset.baselineExpenseCount);
  return {
    baselineExpenses: dataset.baselineExpenseCount,
    boundaryExpenses: dataset.boundaryExpenseCount,
    finalExpenses: dataset.expenses.length,
    members: dataset.members.length,
    participants: dataset.participants.length,
    splits: dataset.splits.length,
    valuations: dataset.valuations.length,
    rateSnapshots: dataset.rateSnapshots.length,
    settlementParticipation: count(
      dataset.expenses.map((expense) => expense.settlementParticipation),
    ),
    businessStatus: count(dataset.expenses.map((expense) => expense.businessStatus)),
    titleLanguages: count(
      baseline.map((expense) =>
        "titleLanguage" in expense.importProvenance
          ? String(expense.importProvenance.titleLanguage)
          : "BOUNDARY",
      ),
    ),
    titleLengths: count(
      baseline.map((expense) =>
        "titleLength" in expense.importProvenance
          ? String(expense.importProvenance.titleLength)
          : "BOUNDARY",
      ),
    ),
    descriptions: count(
      baseline.map((expense) =>
        "descriptionKind" in expense.importProvenance
          ? String(expense.importProvenance.descriptionKind)
          : "BOUNDARY",
      ),
    ),
    memberLabels: dataset.members.map((member) => member.displayName),
  };
}

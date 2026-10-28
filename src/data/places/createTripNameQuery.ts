import { normalizePlaceQuery } from "@/data/places/applePlaceProvider";
// Frozen Place Match Lab public/core.ts nameAliases/nameHints only (2026-10-20).
// This chooses one real-provider query, never a place result or identity.
const nameAliases = [
  ["South Island", "南岛"],
  ["New Zealand", "新西兰"],
  ["Japan", "日本"],
  ["Europe", "欧洲"],
  ["Nelson", "尼尔森"],
  ["Tokyo", "东京"],
  ["Auckland", "奥克兰"],
  ["Paris", "巴黎"],
  ["Iceland", "冰岛"],
  ["Bavaria", "巴伐利亚"],
  ["Queenstown", "皇后镇"],
  ["Motueka", "莫图伊卡"],
  ["Shanghai", "上海"],
  ["Beijing", "北京"],
];
export const nameHints = (name: string) => {
  // Finite local query aliases, not a geocoder. Suggestions always require explicit selection.
  return nameAliases
    .filter((group) =>
      group.some((a) =>
        /[\u3400-\u9fff]/u.test(a)
          ? name.includes(a)
          : new RegExp(`(^|[^a-z])${a}([^a-z]|$)`, "i").test(name),
      ),
    )
    .map((g) => g[0]);
};

export const createTripNameQuery = (name: string) =>
  nameHints(name)[0] ?? normalizePlaceQuery(name).phrase;

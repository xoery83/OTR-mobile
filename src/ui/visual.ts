export const visual = {
  radius: { hero: 18, card: 14, control: 10, pill: 999 },
  space: { page: 16, section: 24, heading: 9, card: 12, row: 14 },
  type: {
    eyebrow: { fontSize: 12, fontWeight: "700" as const, letterSpacing: 0.6 },
    section: { fontSize: 18, fontWeight: "700" as const },
    row: { fontSize: 16, fontWeight: "600" as const },
    meta: { fontSize: 13, fontWeight: "400" as const },
    action: { fontSize: 14, fontWeight: "600" as const },
    metric: {
      fontSize: 22,
      fontWeight: "700" as const,
      fontVariant: ["tabular-nums"] as ["tabular-nums"],
    },
    rowAmount: {
      fontSize: 15,
      fontWeight: "700" as const,
      fontVariant: ["tabular-nums"] as ["tabular-nums"],
    },
    secondaryAmount: {
      fontSize: 12,
      fontWeight: "400" as const,
      fontVariant: ["tabular-nums"] as ["tabular-nums"],
    },
    percent: {
      fontSize: 12,
      fontWeight: "500" as const,
      fontVariant: ["tabular-nums"] as ["tabular-nums"],
    },
  },
} as const;

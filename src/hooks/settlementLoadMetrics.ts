export const settlementLoadMetrics = {
  controller: 0,
  ledgerPull: 0,
  serverPreview: 0,
  sections: 0,
  personalReview: 0,
};

export type SettlementLoadMetric = keyof typeof settlementLoadMetrics;

export function countSettlementLoad(metric: SettlementLoadMetric) {
  settlementLoadMetrics[metric] += 1;
  console.info(`[Settlement load] ${metric}: ${settlementLoadMetrics[metric]}`);
}

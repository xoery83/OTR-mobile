// Synthetic QA read allocation only. Not business storage, authentication or a sync engine.
export class QaReadBudgetError extends Error {
  constructor(
    public readonly code: "QA_READ_BUDGET_CLOSED" | "QA_READ_BUDGET_EXHAUSTED",
  ) {
    super(code);
  }
}
type Store = {
  exists(): boolean;
  read(): string;
  create(): void;
  write(text: string): void;
};
type Config = { version: 1; runId: string; maximum: number };
type Entry = { ordinal: number; method: "GET" | "POST"; route: string; at: string };
const routeWords = new Set(
  "v1 v2 trips journeys core operations commands capabilities collection items people person-create-operations metadata metadata-operations metadata-snapshot bootstrap report review payments personal-payments expenses ledger settings currency preview commit receipts settlement-review balances settlements destinations sources batches tasks results publications snapshot universal-source-originals result representations pdf-v4 observe-retained".split(
    " ",
  ),
);
export function redactQaReadRoute(path: string) {
  return (
    "/" +
    path
      .split("?")[0]
      .split("/")
      .filter(Boolean)
      .map((part) => (routeWords.has(part) ? part : ":id"))
      .join("/")
  );
}
function isResultRead(method: string, path: string) {
  return (
    method === "POST" &&
    (/^\/v2\/trips\/[0-9a-f-]{36}\/universal-source-originals\/result$/.test(
      path.split("?")[0],
    ) ||
      /^\/v2\/trips\/[0-9a-f-]{36}\/sources\/[0-9a-f-]{36}\/representations\/[0-9a-f-]{36}\/pdf-v4\/[0-9a-f-]{36}\/observe-retained$/.test(
        path.split("?")[0],
      ))
  );
}
function closed(): never {
  throw new QaReadBudgetError("QA_READ_BUDGET_CLOSED");
}
function config(raw: string): Config {
  let value: Config;
  try {
    value = JSON.parse(raw);
  } catch {
    return closed();
  }
  if (
    !value ||
    Object.keys(value).sort().join() !== "maximum,runId,version" ||
    value.version !== 1 ||
    typeof value.runId !== "string" ||
    value.runId !== "afdf5785-670b-44c1-951d-9864dc1307f6" ||
    !Number.isSafeInteger(value.maximum) ||
    (value.maximum !== 72 && value.maximum !== 136)
  )
    return closed();
  return value;
}
function load(text: string, expected: Config): Entry[] {
  let ledger: { version: number; runId: string; maximum: number; entries: Entry[] };
  try {
    ledger = JSON.parse(text);
  } catch {
    return closed();
  }
  if (
    !ledger ||
    Object.keys(ledger).sort().join() !== "entries,maximum,runId,version" ||
    ledger.version !== 1 ||
    ledger.runId !== expected.runId ||
    ledger.maximum !== expected.maximum ||
    !Array.isArray(ledger.entries) ||
    ledger.entries.length > expected.maximum ||
    (expected.maximum === 136 && ledger.entries.length < 72)
  )
    return closed();
  for (const [index, entry] of ledger.entries.entries()) {
    if (
      !entry ||
      Object.keys(entry).sort().join() !== "at,method,ordinal,route" ||
      entry.ordinal !== index + 1 ||
      (entry.method !== "GET" &&
        !(
          entry.method === "POST" &&
          (entry.route === "/v2/trips/:id/universal-source-originals/result" ||
            entry.route ===
              "/v2/trips/:id/sources/:id/representations/:id/pdf-v4/:id/observe-retained")
        )) ||
      typeof entry.route !== "string" ||
      !entry.route.startsWith("/") ||
      redactQaReadRoute(entry.route) !== entry.route ||
      typeof entry.at !== "string" ||
      !entry.at.endsWith("Z") ||
      !Number.isFinite(Date.parse(entry.at))
    )
      return closed();
  }
  return ledger.entries;
}
export function createQaGetReservation(
  readConfig: () => string | undefined,
  open: () => Store,
  now = () => new Date().toISOString(),
) {
  let observed = false;
  return (method: string, path: string, baseUrl: string) => {
    if (method !== "GET" && !isResultRead(method, path)) return;
    const raw = readConfig();
    if (!raw) return;
    const identity = config(raw);
    if (baseUrl !== "https://api-dev.xoery.art" || !path.startsWith("/")) return closed();
    try {
      const store = open();
      const exists = store.exists();
      if (!exists && (observed || identity.maximum === 136)) return closed();
      const entries = exists ? load(store.read(), identity) : [];
      observed = true;
      if (entries.length >= identity.maximum)
        throw new QaReadBudgetError("QA_READ_BUDGET_EXHAUSTED");
      const entry: Entry = {
        ordinal: entries.length + 1,
        method: method as "GET" | "POST",
        route: redactQaReadRoute(path),
        at: now(),
      };
      const next = JSON.stringify({ ...identity, entries: [...entries, entry] });
      if (!exists) store.create();
      store.write(next);
      // A failed/partial durable write cannot authorize an outbound request.
      if (!store.exists() || store.read() !== next) return closed();
      load(next, identity);
    } catch (error) {
      if (error instanceof QaReadBudgetError) throw error;
      return closed();
    }
  };
}
export const reserveNativeQaGet = createQaGetReservation(
  () => process.env.EXPO_PUBLIC_OTR_QA_READ_BUDGET,
  () => {
    // Keep Native module evaluation and file access completely off without the explicit QA env.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { File, Paths } =
      require("expo-file-system") as typeof import("expo-file-system");
    /* eslint-enable @typescript-eslint/no-require-imports */
    const file = new File(Paths.document, "otr-native-qa-read-budget-v1.json");
    return {
      exists: () => file.exists,
      read: () => file.textSync(),
      create: () => file.create({ overwrite: false }),
      write: (text: string) => file.write(text),
    };
  },
);

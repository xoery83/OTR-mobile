import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { LedgerOperationalSyncCompletion } from "@/data/sync/ledgerOperationalSync";

// Execute the real screen's subscriptions; native rendering is outside this probe.
export function createMountedMyLedgerProbe(generation: () => number) {
  const source = readFileSync(
    join(process.cwd(), "src/features/ledger/MyLedgerScreen.tsx"),
    "utf8",
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const effects: (() => unknown)[] = [];
  let listener!: (event: LedgerOperationalSyncCompletion) => void;
  let loads = 0;
  const modules: Record<string, unknown> = {
    react: {
      useState: (v: unknown) => [typeof v === "function" ? v() : v, () => {}],
      useRef: (v: unknown) => ({ current: v }),
      useCallback: (f: unknown) => f,
      useEffect: (f: () => unknown) => effects.push(f),
    },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
    "react-native": { StyleSheet: { create: (x: unknown) => x } },
    "expo-router": { useFocusEffect: () => {}, router: {} },
    "@/ui/theme": { useThemedStyles: () => ({}) },
    "@/data/auth/accountGeneration": {
      getAccountGeneration: generation,
      subscribeAccountGeneration: () => () => {},
    },
    "@/data/sync/ledgerOperationalSync": {
      subscribeLedgerOperationalSyncCompletion: (f: typeof listener) => (
        (listener = f),
        () => {}
      ),
    },
    "@/hooks/useLedgerReportingRefresh": {
      useLedgerReportingRefresh: () => ({ refreshPersonal: async () => {} }),
    },
    "./latestRequest": {
      createLatestRequest: () => ({
        begin: () => 1,
        isCurrent: () => true,
        cancel: () => {},
      }),
    },
    "./loadMyLedger": {
      loadMyLedger: async () => {
        loads++;
        return { currency: "NZD" };
      },
    },
  };
  const generic = new Proxy(
    {},
    { get: (_target, key) => (key === "t" ? () => "" : () => ({})) },
  );
  const result: Record<string, () => void> = {};
  runInNewContext(js, {
    exports: result,
    require: (id: string) => modules[id] ?? generic,
  });
  result.MyLedgerScreen();
  effects.forEach((f) => f());
  return {
    complete: (event: LedgerOperationalSyncCompletion) => listener(event),
    loads: () => loads,
  };
}

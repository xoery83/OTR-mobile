import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMigratedDatabaseOpener } from "@/data/db/databaseConnection";
import { migrations } from "@/data/db/migrations";
import { readFoundationDiagnostics } from "./foundationDiagnostics";
import { readDefaultLocalOperations } from "@/data/operations/localOperations";
import { FoundationDiagnosticsScreen } from "@/components/FoundationDiagnosticsScreen";
import { readLocalSession } from "@/data/auth/authRepository";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
  writable: false,
  set: vi.fn(),
  delete: vi.fn(),
  open: vi.fn(),
  migrate: vi.fn(),
  diagnosticOpen: vi.fn(),
  initialized: null as (() => Promise<any>) | null,
  focus: null as (() => () => void) | null,
  queries: [] as string[],
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => h.store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    h.set(key, value);
    if (!h.writable) throw new Error("SECURE_WRITE_FORBIDDEN");
    h.store.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    h.delete(key);
    if (!h.writable) throw new Error("SECURE_DELETE_FORBIDDEN");
    h.store.delete(key);
  },
}));
vi.mock("@/data/db/database", () => ({
  openDatabase: () => {
    h.diagnosticOpen();
    throw new Error("DIAGNOSTIC_OPEN_FORBIDDEN");
  },
  readInitializedDatabase: () => h.initialized!(),
}));
vi.mock("expo-network", () => ({
  getNetworkStateAsync: async () => ({ isInternetReachable: false }),
}));
vi.mock("@/data/operations/ledgerMaintenance", () => ({
  readLedgerSupportDiagnostics: async () => ({
    databaseBytes: 0,
    receiptBytes: 0,
    reviewCounts: {},
  }),
}));
vi.mock("@/data/sync/transportSelection", () => ({ getSyncTransportMode: () => "dev" }));
vi.mock("@/hooks/useFoundationDiagnostics", () => ({
  useFoundationDiagnostics: () => ({
    diagnostics: null,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    transportMode: "dev",
  }),
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: () => () => void) => {
    h.focus = callback;
  },
}));
vi.mock("react-native", () => ({
  Button: "button",
  ScrollView: "div",
  Text: "span",
  View: "div",
  StyleSheet: { create: (v: unknown) => v },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "div" }));
vi.mock("@/ui/forms", () => ({ UiTextInput: "input" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/UiFoundationFixture", () => ({ UiFoundationFixture: () => null }));
vi.mock("@/components/LocalOperationsDiagnostics", () => ({
  LocalOperationsDiagnostics: () => createElement("span", null, "OPERATIONS_MOUNTED"),
}));
let sql: DatabaseSync;
const identity = { userId: randomUUID(), displayName: "Fixture", email: null };
const session = { identity, accessToken: null, refreshToken: null, expiresAt: null };
const legacyKey = "otr.mobile.session.v1";
const indexKey = "otr.mobile.accounts.v2";
beforeEach(() => {
  vi.stubGlobal("__DEV__", true);
  h.store.clear();
  h.writable = false;
  h.set.mockClear();
  h.delete.mockClear();
  h.open.mockClear();
  h.migrate.mockClear();
  h.diagnosticOpen.mockClear();
  h.queries = [];
  sql = new DatabaseSync(":memory:");
  const db = {
    async getFirstAsync<T>(q: string, ...p: unknown[]): Promise<T | null> {
      h.queries.push(q);
      return (sql.prepare(q).get(...(p as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(q: string, ...p: unknown[]): Promise<T[]> {
      h.queries.push(q);
      return sql.prepare(q).all(...(p as never[])) as T[];
    },
    async runAsync() {
      throw new Error("SQL_WRITE_FORBIDDEN");
    },
    async withTransactionAsync(work: () => Promise<void>) {
      await work();
    },
  };
  h.open.mockImplementation(async () => db);
  h.migrate.mockImplementation(async () => {
    sql.exec("CREATE TABLE schema_migrations(id INTEGER,name TEXT,applied_at TEXT)");
    for (const m of migrations) {
      sql.exec(m.sql);
      sql
        .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
        .run(m.id, m.name, "2026-10-08T00:00:00.000Z");
    }
  });
  const opener = createMigratedDatabaseOpener(h.open, h.migrate);
  h.initialized = opener.readInitialized;
  // Startup is deliberate and separate from diagnostics in initialized cases.
  startup = async () => {
    await opener();
    sql.exec("PRAGMA query_only=ON");
  };
});
let startup: () => Promise<void>;
afterEach(() => {
  sql.close();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  "F1 legacy-only / missing indexed v2 fails closed through both real diagnostic session compositions (indexed=%s)",
  async (indexed) => {
    await startup();
    h.store.set(legacyKey, JSON.stringify(session));
    if (indexed)
      h.store.set(
        indexKey,
        JSON.stringify({ activeUserId: identity.userId, accounts: [identity] }),
      );
    await expect(readFoundationDiagnostics()).rejects.toThrow();
    await expect(readDefaultLocalOperations()).rejects.toThrow();
    expect(h.set).not.toHaveBeenCalled();
    expect(h.delete).not.toHaveBeenCalled();
    expect(h.store.has(legacyKey)).toBe(true);
  },
);
it("F1 normal Auth adopts v1 unchanged; subsequent diagnostics read v2 without SecureStore writes", async () => {
  await startup();
  h.store.set(legacyKey, JSON.stringify(session));
  h.writable = true;
  expect((await readLocalSession())?.identity).toEqual(identity);
  expect(h.set).toHaveBeenCalledTimes(2);
  expect(h.delete).toHaveBeenCalledOnce();
  h.writable = false;
  h.set.mockClear();
  h.delete.mockClear();
  expect((await readFoundationDiagnostics()).schemaVersion).toBe(51);
  expect((await readDefaultLocalOperations()).coverage.sync).toBe("AVAILABLE");
  expect(h.set).not.toHaveBeenCalled();
  expect(h.delete).not.toHaveBeenCalled();
});
it("F1 mismatched adopted identity cannot publish Account data", async () => {
  await startup();
  h.store.set(
    indexKey,
    JSON.stringify({ activeUserId: identity.userId, accounts: [identity] }),
  );
  h.store.set(
    `otr.mobile.session.v2.${identity.userId}`,
    JSON.stringify({ ...session, identity: { ...identity, userId: randomUUID() } }),
  );
  await expect(readFoundationDiagnostics()).rejects.toThrow();
  await expect(readDefaultLocalOperations()).rejects.toThrow();
  expect(h.set).not.toHaveBeenCalled();
  expect(h.delete).not.toHaveBeenCalled();
});
it.each([false, true])(
  "F2 actual screen focus fails closed without diagnostic open/migrate, including initialized Debug Mode OFF (%s)",
  async (initialized) => {
    if (initialized) {
      await startup();
      h.store.set(
        indexKey,
        JSON.stringify({ activeUserId: identity.userId, accounts: [identity] }),
      );
      h.store.set(`otr.mobile.session.v2.${identity.userId}`, JSON.stringify(session));
    }
    h.open.mockClear();
    h.migrate.mockClear();
    const html = renderToStaticMarkup(createElement(FoundationDiagnosticsScreen));
    expect(html).not.toContain("OPERATIONS_MOUNTED");
    const cleanup = h.focus!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    cleanup();
    expect(h.diagnosticOpen).not.toHaveBeenCalled();
    expect(h.open).not.toHaveBeenCalled();
    expect(h.migrate).not.toHaveBeenCalled();
    expect(h.set).not.toHaveBeenCalled();
    expect(h.delete).not.toHaveBeenCalled();
    expect(h.queries.some((q) => q.includes("debug_mode"))).toBe(initialized);
  },
);

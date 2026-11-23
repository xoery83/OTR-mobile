import { beforeEach, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountPrivateProfileScreen } from "./AccountPrivateProfileScreen";
import { AccountPrivateProfilePage } from "./AccountPrivateProfilePage";
import { getDefaultAccountPrivateProfileEditor } from "@/data/repositories/defaultAccountProfileRepository";
import { privateProfileDraft } from "@/domain/auth/privateAccountProfile";
import { createAccountProfileRepository } from "@/data/auth/accountProfileRepository";
import { privateAccountProfileMigration } from "@/data/db/privateAccountProfileMigration";
import type {
  PrivateProfileDatabase,
  PrivateProfileLocalState,
} from "@/data/auth/privateAccountProfileLocal";

const hooks = vi.hoisted(() => ({
  cursor: 0,
  values: [] as any[],
  effects: [] as (() => void)[],
  generation: 4,
  writes: 0,
  preventRemove: false,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_: unknown, get: () => number) => get(),
  useRef: (value: unknown) => {
    const index = hooks.cursor++;
    return (hooks.values[index] ??= { current: value });
  },
  useState: (value: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = value;
    return [
      hooks.values[index],
      (next: any) => {
        hooks.writes++;
        hooks.values[index] =
          typeof next === "function" ? next(hooks.values[index]) : next;
      },
    ];
  },
  useEffect: (effect: () => () => void, deps: unknown[]) => {
    const index = hooks.cursor++;
    const prior = hooks.values[index];
    if (prior && deps.every((value, n) => Object.is(value, prior.deps[n]))) return;
    hooks.effects.push(() => {
      prior?.cleanup?.();
      hooks.values[index] = { deps, cleanup: effect() };
    });
  },
}));
vi.mock("expo-router", () => ({ Stack: { Toolbar: Object.assign(() => null, { Button: "ToolbarButton" }) } }));
vi.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (blocked: boolean) => { hooks.preventRemove = blocked; },
}));
vi.mock("react-native", () => ({
  ScrollView: "Scroll",
  ActivityIndicator: "Loading",
  StyleSheet: { create: (v: unknown) => v },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => hooks.generation,
  subscribeAccountGeneration: vi.fn(),
}));
vi.mock("@/ui/controls", () => ({
  UiButton: "Button",
  UiText: "Text",
  UiSection: "Section",
}));
vi.mock("@/ui/locale", () => ({ t: (v: string) => v }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
vi.mock("@/data/repositories/defaultAccountProfileRepository", () => ({
  getDefaultAccountPrivateProfileEditor: vi.fn(),
}));
vi.mock("./PrivateProfileNameFields", () => ({ PrivateProfileNameFields: "Fields" }));

const a = { accountId: "11111111-1111-4111-8111-111111111111", generation: 4 };
const b = { accountId: "22222222-2222-4222-8222-222222222222", generation: 5 };
const nodes = (value: any): any[] =>
  Array.isArray(value)
    ? value.flatMap(nodes)
    : value?.props
      ? [value, ...nodes(value.props.children)]
      : [];
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  let scope = a;
  const read = vi.fn(async () => null as any);
  const saveDraft = vi.fn(async (input, draft): Promise<PrivateProfileLocalState> => ({
    accountId: input.accountId,
    draft,
    accepted: null,
  }));
  let local = { read, saveDraft };
  const onCancel = vi.fn();
  const onSaved = vi.fn(() => expect(hooks.preventRemove).toBe(false));
  const render = () => {
    hooks.cursor = 0;
    const tree = nodes(
      AccountPrivateProfileScreen({
        scope,
        local,
        onSaved,
      }),
    );
    for (const effect of hooks.effects.splice(0)) effect();
    return tree;
  };
  const field = () => render().find((v) => v.type === "Fields").props;
  const save = () =>
    render().find((v) => v.props.accessibilityLabel === "ui.save").props;
  return {
    local,
    render,
    field,
    save,
    onCancel,
    onSaved,
    back() {
      render();
      if (hooks.preventRemove || onCancel.mock.calls.length) return;
      unmount();
      onCancel();
    },
    replaceLocal() {
      local = { read: vi.fn(async () => null), saveDraft: vi.fn() };
      return local;
    },
    switch() {
      hooks.generation = 5;
      scope = b;
    },
  };
}
beforeEach(() => {
  hooks.cursor = 0;
  hooks.values = [];
  hooks.effects = [];
  hooks.generation = 4;
  hooks.writes = 0;
  hooks.preventRemove = false;
  vi.mocked(getDefaultAccountPrivateProfileEditor).mockReset();
});

function unmount() {
  for (const value of hooks.values) value?.cleanup?.();
}
function pageFixture() {
  const onSignIn = vi.fn();
  const render = () => {
    hooks.cursor = 0;
    const tree = nodes(AccountPrivateProfilePage({ onSignIn, onSaved: vi.fn() }));
    for (const effect of hooks.effects.splice(0)) effect();
    return tree;
  };
  return { render, onSignIn };
}

it("loads the normal page through the existing local repository entry", async () => {
  const editor = { scope: a, local: fixture().local };
  vi.mocked(getDefaultAccountPrivateProfileEditor).mockResolvedValueOnce(editor);
  const page = pageFixture();
  expect(page.render().some((v) => v.type === AccountPrivateProfileScreen)).toBe(false);
  await tick();
  const screen = page.render().find((v) => v.type === AccountPrivateProfileScreen);
  expect(screen.props.scope).toEqual(a);
  expect(screen.props.local).toBe(editor.local);
  expect(page.render().some((v) => v.props.label === "common.cancel")).toBe(false);
});

it("offers sign-in to a committed Guest without showing a draft read error", async () => {
  vi.mocked(getDefaultAccountPrivateProfileEditor).mockResolvedValueOnce(null);
  const page = pageFixture();
  page.render();
  await tick();
  const tree = page.render();
  expect(tree.some((v) => v.props.children === "privateProfile.signInRequired")).toBe(true);
  expect(tree.some((v) => v.props.label === "common.tryAgain")).toBe(false);
  tree.find((v) => v.props.label === "navigation.signIn").props.onPress();
  expect(page.onSignIn).toHaveBeenCalledOnce();
});

it("hides A and ignores its late page entry after switching to B", async () => {
  const pending = deferred<any>();
  const local = fixture().local;
  vi.mocked(getDefaultAccountPrivateProfileEditor)
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ scope: b, local });
  const page = pageFixture();
  page.render();
  hooks.generation = 5;
  expect(page.render().some((v) => v.type === AccountPrivateProfileScreen)).toBe(false);
  await tick();
  pending.resolve({ scope: a, local });
  await tick();
  expect(
    page.render().find((v) => v.type === AccountPrivateProfileScreen).props.scope,
  ).toEqual(b);
});

it("retries a failed entry and cannot show a canceled late response", async () => {
  const pending = deferred<any>();
  vi.mocked(getDefaultAccountPrivateProfileEditor)
    .mockRejectedValueOnce(Error("storage unavailable"))
    .mockReturnValueOnce(pending.promise);
  const page = pageFixture();
  page.render();
  await tick();
  page
    .render()
    .find((v) => v.props.label === "common.tryAgain")
    .props.onPress();
  page.render();
  unmount();
  const writes = hooks.writes;
  pending.resolve({ scope: a, local: fixture().local });
  await tick();
  expect(hooks.writes).toBe(writes);
});

it("cancels once without saving edits or accepting retained callbacks", async () => {
  const f = fixture();
  f.render();
  await tick();
  f.field().onChange({ ...privateProfileDraft(), displayName: "unsaved" });
  const save = f.save();
  const field = f.field();
  f.back();
  f.back();
  save.onPress();
  field.onChange({ ...privateProfileDraft(), displayName: "late" });
  expect(f.onCancel).toHaveBeenCalledOnce();
  expect(f.local.saveDraft).not.toHaveBeenCalled();
});

it("does not cancel a local save already in progress", async () => {
  const f = fixture();
  const pending = deferred<any>();
  f.local.saveDraft.mockImplementationOnce(() => pending.promise);
  f.render();
  await tick();
  f.save().onPress();
  f.render();
  expect(hooks.preventRemove).toBe(true);
  f.back();
  expect(f.onCancel).not.toHaveBeenCalled();
  pending.resolve({ accountId: a.accountId });
  await tick();
  f.render();
  expect(f.onSaved).toHaveBeenCalledOnce();
  expect(f.onCancel).not.toHaveBeenCalled();
});

it("ignores a pending read after cancellation", async () => {
  const f = fixture();
  const pending = deferred<any>();
  f.local.read.mockImplementationOnce(() => pending.promise);
  f.render();
  f.back();
  const writes = hooks.writes;
  pending.resolve({ accountId: a.accountId, draft: privateProfileDraft() });
  await tick();
  expect(hooks.writes).toBe(writes);
  expect(f.onCancel).toHaveBeenCalledOnce();
});

it("returns after saving through the existing repository and restores the draft after SQLite reopen", async () => {
  const folder = mkdtempSync(join(tmpdir(), "otr-profile-editor-"));
  const path = join(folder, "profile.db");
  let sql = new DatabaseSync(path);
  const network = vi.fn(async () => {
    throw Error("UNEXPECTED_NETWORK");
  });
  const database: PrivateProfileDatabase = {
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      return (sql.prepare(query).get(...(args as never[])) ?? null) as T;
    },
    async runAsync(query: string, ...args: unknown[]) {
      return sql.prepare(query).run(...(args as never[])) as never;
    },
    async withTransactionAsync(work) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const mount = () => {
    const repository = createAccountProfileRepository(
      async () => a.accountId,
      { fetchImplementation: network },
      undefined,
      database,
    );
    const f = fixture();
    f.local.read.mockImplementation(() => repository.local!.read(a));
    f.local.saveDraft.mockImplementation((scope, draft) =>
      repository.local!.saveDraft(scope, draft),
    );
    f.render();
    return f;
  };
  try {
    sql.exec(privateAccountProfileMigration.sql);
    const f = mount();
    await vi.waitFor(() => expect(f.field().draft).toEqual(privateProfileDraft()));
    const draft = {
      ...privateProfileDraft(),
      displayName: "",
      mode: "UNSPLIT" as const,
      fullName: "  林 e\u0301  ",
      familyName: "保留",
      givenNames: "原文",
    };
    f.field().onChange(draft);
    f.save().onPress();
    await vi.waitFor(() => {
      f.render();
      expect(f.onSaved).toHaveBeenCalledOnce();
    });
    f.back();
    for (const value of hooks.values) value?.cleanup?.();
    hooks.values = [];
    hooks.effects = [];
    sql.close();
    sql = new DatabaseSync(path);
    const restored = mount();
    await vi.waitFor(() => expect(restored.field().draft).toEqual(draft));
    expect(restored.local.saveDraft).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  } finally {
    for (const value of hooks.values) value?.cleanup?.();
    sql.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

it("reads and saves an optional private Unicode draft without making a cloud call", async () => {
  const f = fixture();
  f.render();
  await tick();
  expect(f.field().draft).toEqual(privateProfileDraft());
  const draft = {
    ...privateProfileDraft(),
    displayName: "",
    mode: "UNSPLIT" as const,
    fullName: "  林 e\u0301  ",
  };
  f.field().onChange(draft);
  f.save().onPress();
  await tick();
  expect(f.local.saveDraft).toHaveBeenCalledExactlyOnceWith(a, draft);
  f.render();
  f.render();
  expect(f.onSaved).toHaveBeenCalledOnce();
});

it("includes an alias still in the field when toolbar Save is tapped", async () => {
  const f = fixture();
  f.render();
  await tick();
  const draft = { ...privateProfileDraft(), globalAkaDraft: ["Original", "Keep"] };
  f.field().onChange(draft);
  f.field().onPendingAliasChange({ value: "  林 e\u0301  ", index: 0 });
  f.save().onPress();
  await tick();
  f.render();
  expect(f.local.saveDraft).toHaveBeenCalledExactlyOnceWith(a, {
    ...draft, globalAkaDraft: ["  林 e\u0301  ", "Keep"],
  });
  expect(f.onSaved).toHaveBeenCalledOnce();
});

it("fences duplicate presses and edits during a pending save", async () => {
  const f = fixture();
  const pending = deferred<any>();
  f.local.saveDraft.mockImplementationOnce(() => pending.promise);
  f.render();
  await tick();
  const oldField = f.field();
  const oldSave = f.save();
  oldSave.onPress();
  oldSave.onPress();
  oldField.onChange({ ...privateProfileDraft(), displayName: "late" });
  expect(f.local.saveDraft).toHaveBeenCalledTimes(1);
  expect(f.field().disabled).toBe(true);
  expect(f.field().draft.displayName).toBe("");
  pending.resolve({ accountId: a.accountId });
  await tick();
  expect(f.field().disabled).toBe(true);
  expect(f.onSaved).toHaveBeenCalledOnce();
});

it("preserves entered names and exposes retryable feedback after local save failure", async () => {
  const f = fixture();
  f.local.saveDraft.mockRejectedValueOnce(Error("disk unavailable"));
  f.render();
  await tick();
  f.field().onChange({ ...privateProfileDraft(), displayName: "原文" });
  f.save().onPress();
  await tick();
  expect(f.field().draft.displayName).toBe("原文");
  expect(f.onSaved).not.toHaveBeenCalled();
  expect(f.render().some((v) => v.props.children === "privateProfile.saveFailed")).toBe(
    true,
  );
  f.save().onPress();
  await tick();
  expect(f.local.saveDraft).toHaveBeenCalledTimes(2);
});

it("hides A immediately and ignores A's late read after switching to B", async () => {
  const f = fixture();
  const pending = deferred<any>();
  f.local.read.mockImplementationOnce(() => pending.promise);
  f.render();
  f.switch();
  expect(f.render().some((v) => v.type === "Fields")).toBe(false);
  await tick();
  pending.resolve({
    accountId: a.accountId,
    draft: { ...privateProfileDraft(), displayName: "private A" },
  });
  await tick();
  expect(f.field().draft.displayName).toBe("");
});

it("ignores A's late save result and retained callbacks after B is mounted", async () => {
  const f = fixture();
  const pending = deferred<any>();
  f.local.saveDraft.mockImplementationOnce(() => pending.promise);
  f.render();
  await tick();
  const oldField = f.field();
  const oldSave = f.save();
  oldSave.onPress();
  f.switch();
  f.render();
  await tick();
  oldField.onChange({ ...privateProfileDraft(), displayName: "private A" });
  oldSave.onPress();
  pending.resolve({ accountId: a.accountId });
  await tick();
  expect(f.field().draft.displayName).toBe("");
  expect(f.local.saveDraft).toHaveBeenCalledTimes(1);
  f.render();
  expect(f.onSaved).not.toHaveBeenCalled();
});

it("does not expose a foreign or unreadable persisted draft", async () => {
  const f = fixture();
  f.local.read.mockResolvedValueOnce({
    accountId: b.accountId,
    draft: { ...privateProfileDraft(), displayName: "foreign" },
  });
  f.render();
  await tick();
  const tree = f.render();
  expect(tree.some((v) => v.type === "Fields")).toBe(false);
  expect(tree.some((v) => v.props.children === "privateProfile.loadFailed")).toBe(true);
  tree.find((v) => v.props.label === "common.tryAgain").props.onPress();
  f.render();
  await tick();
  expect(f.field().draft.displayName).toBe("");
});

it("rejects retained callbacks when the same Account receives a different repository", async () => {
  const f = fixture();
  f.render();
  await tick();
  const oldField = f.field();
  const oldSave = f.save();
  const replacement = f.replaceLocal();
  f.render();
  await tick();
  oldField.onChange({ ...privateProfileDraft(), displayName: "old store" });
  oldSave.onPress();
  expect(f.field().draft.displayName).toBe("");
  expect(f.local.saveDraft).not.toHaveBeenCalled();
  expect(replacement.saveDraft).not.toHaveBeenCalled();
  expect(f.onCancel).not.toHaveBeenCalled();
});

it("ignores a read after unmount and hides fields after a generation change", async () => {
  const f = fixture();
  const pending = deferred<any>();
  f.local.read.mockImplementationOnce(() => pending.promise);
  f.render();
  for (const value of hooks.values) value?.cleanup?.();
  const writes = hooks.writes;
  pending.resolve({ accountId: a.accountId, draft: privateProfileDraft() });
  await tick();
  expect(hooks.writes).toBe(writes);
  hooks.generation = 6;
  expect(f.render()).toEqual([]);
});

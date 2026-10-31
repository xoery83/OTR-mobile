import { beforeEach, expect, it, vi } from "vitest";
import { AccountPrivateProfileScreen } from "./AccountPrivateProfileScreen";
import { privateProfileDraft } from "@/domain/auth/privateAccountProfile";

const hooks = vi.hoisted(() => ({
  cursor: 0,
  values: [] as any[],
  effects: [] as (() => void)[],
  generation: 4,
  writes: 0,
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
      prior?.cleanup();
      hooks.values[index] = { deps, cleanup: effect() };
    });
  },
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
  const saveDraft = vi.fn(async (input, draft) => ({
    accountId: input.accountId,
    draft,
    accepted: null,
  }));
  let local = { read, saveDraft };
  const render = () => {
    hooks.cursor = 0;
    const tree = nodes(AccountPrivateProfileScreen({ scope, local }));
    for (const effect of hooks.effects.splice(0)) effect();
    return tree;
  };
  const field = () => render().find((v) => v.type === "Fields").props;
  const save = () =>
    render().find((v) => v.props.label === "privateProfile.saveDraft").props;
  return {
    local,
    render,
    field,
    save,
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
  expect(f.render().some((v) => v.props.children === "privateProfile.draftSaved")).toBe(
    true,
  );
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
  expect(f.field().disabled).toBe(false);
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
  expect(f.render().some((v) => v.props.children === "privateProfile.draftSaved")).toBe(
    false,
  );
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

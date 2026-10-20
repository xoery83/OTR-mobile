import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { LocalTripPhotos } from "./LocalTripPhotos";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const state = vi.hoisted(() => ({
  hooks: [] as unknown[],
  refs: [] as { current: unknown }[],
  cursor: 0,
  refCursor: 0,
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  mount: false,
  refreshEffects: false,
  buttons: [] as { label: string; disabled: boolean; onPress(): void }[],
  repository: vi.fn(),
  picker: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_: unknown, snapshot: () => unknown) => snapshot(),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    if (state.mount || state.refreshEffects) state.effects.push(effect);
  },
  useState: (initial: unknown) => {
    const index = state.cursor++,
      hooks = state.hooks;
    if (!(index in hooks)) hooks[index] = initial;
    return [
      hooks[index],
      (value: unknown) => {
        hooks[index] = typeof value === "function" ? value(hooks[index]) : value;
      },
    ];
  },
  useRef: (initial: unknown) => (state.refs[state.refCursor++] ??= { current: initial }),
}));
vi.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  Image: (props: any) => createElement("img", { src: props.source.uri }),
  StyleSheet: { create: (styles: unknown) => styles },
  Text: (props: any) => createElement("span", null, props.children),
  View: (props: any) => createElement("div", null, props.children),
}));
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (...args: unknown[]) => state.picker(...args),
}));
vi.mock("@/data/repositories/tripPhotoRepository", () => ({
  readLocalTripPhotoRepository: () => state.repository(),
}));
vi.mock("@/ui/controls", () => ({
  UiButton: (props: any) => {
    state.buttons.push(props);
    return createElement("button", { disabled: props.disabled }, props.label);
  },
  UiSection: (props: any) => createElement("section", null, props.title, props.children),
}));
vi.mock("@/ui/forms", () => ({
  UiFormRow: (props: any) => {
    state.buttons.push(props);
    return createElement("button", null, props.label, props.value);
  },
}));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));

const tripId = "11111111-1111-4111-8111-111111111111";
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
let key: string | null;
function render(
  id = tripId,
  compact = false,
  registerAdd?: (add: (() => void) | null) => void,
) {
  const element = LocalTripPhotos({ tripId: id, compact, registerAdd });
  const next = String(element.key);
  state.mount = next !== key;
  if (state.mount) {
    state.cleanups.forEach((cleanup) => cleanup());
    state.cleanups = [];
    state.hooks = [];
    state.refs = [];
    key = next;
  }
  state.cursor = 0;
  state.refCursor = 0;
  state.buttons = [];
  const html = renderToStaticMarkup(element);
  for (const effect of state.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) state.cleanups.push(cleanup);
  }
  state.mount = false;
  return html;
}

beforeEach(() => {
  state.cleanups.forEach((cleanup) => cleanup());
  state.cleanups = [];
  key = null;
  state.refreshEffects = false;
  state.hooks = [];
  state.refs = [];
  state.effects = [];
  state.buttons = [];
  state.repository.mockReset();
  state.picker.mockReset();
});

it("lists local retained photos and only saves the explicitly selected picker file", async () => {
  const repo = {
    listTripPhotos: vi.fn(async () => []),
    addTripPhoto: vi.fn(async () => ({})),
  };
  state.repository.mockResolvedValue(repo);
  render();
  await flush();
  expect(repo.listTripPhotos).toHaveBeenCalledWith(tripId);
  expect(repo.addTripPhoto).not.toHaveBeenCalled();
  render();
  state.picker.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///picked.jpg" }],
  });
  state.buttons[0].onPress();
  await flush();
  expect(repo.addTripPhoto).toHaveBeenCalledWith(tripId, "file:///picked.jpg");
  expect(state.picker).toHaveBeenCalledWith(
    expect.objectContaining({
      allowsMultipleSelection: true,
      base64: false,
      exif: false,
    }),
  );
});

it("does not save canceled, non-file or account-switched picker results", async () => {
  const repo = {
    listTripPhotos: vi.fn(async () => []),
    addTripPhoto: vi.fn(async () => ({})),
  };
  state.repository.mockResolvedValue(repo);
  render();
  await flush();
  render();
  state.picker.mockResolvedValueOnce({ canceled: true, assets: [] });
  state.buttons[0].onPress();
  await flush();
  expect(repo.addTripPhoto).not.toHaveBeenCalled();
  render();
  state.picker.mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: "https://invalid" }],
  });
  state.buttons[0].onPress();
  await flush();
  expect(repo.addTripPhoto).not.toHaveBeenCalled();
  render();
  let release!: (result: unknown) => void;
  state.picker.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
  state.buttons[0].onPress();
  advanceAccountGeneration();
  release({ canceled: false, assets: [{ uri: "file:///old-account.jpg" }] });
  await flush();
  expect(repo.addTripPhoto).not.toHaveBeenCalled();
});

it("clears old Trip images immediately and rejects its in-flight picker after switching", async () => {
  const nextTrip = "22222222-2222-4222-8222-222222222222";
  let releaseRows!: (rows: unknown[]) => void;
  let releasePicker!: (result: unknown) => void;
  const repo = {
    listTripPhotos: vi.fn(async (id: string) =>
      id === tripId
        ? [{ assetId: "old", localUri: "file:///old-trip.jpg" }]
        : new Promise<unknown[]>((resolve) => {
            releaseRows = resolve;
          }),
    ),
    addTripPhoto: vi.fn(async () => ({})),
  };
  state.repository.mockResolvedValue(repo);
  render();
  await flush();
  expect(render()).toContain("file:///old-trip.jpg");
  state.picker.mockReturnValueOnce(
    new Promise((resolve) => {
      releasePicker = resolve;
    }),
  );
  state.buttons[0].onPress();
  const oldKey = key;
  const immediate = render(nextTrip);
  expect(key).not.toBe(oldKey);
  expect(immediate).not.toContain("file:///old-trip.jpg");
  expect(immediate).toContain("dayFeed.loading");
  await flush();
  releasePicker({ canceled: false, assets: [{ uri: "file:///old-choice.jpg" }] });
  releaseRows([{ assetId: "new", localUri: "file:///new-trip.jpg" }]);
  await flush();
  expect(repo.addTripPhoto).not.toHaveBeenCalled();
  const next = render(nextTrip);
  expect(next).toContain("file:///new-trip.jpg");
  expect(next).not.toContain("file:///old-trip.jpg");
});

it("clears old Account images before the same Trip finishes reloading", async () => {
  const repo = {
    listTripPhotos: vi.fn(async () => [
      { assetId: "old", localUri: "file:///old-account.jpg" },
    ]),
  };
  state.repository.mockResolvedValue(repo);
  render();
  await flush();
  expect(render()).toContain("file:///old-account.jpg");
  advanceAccountGeneration();
  state.repository.mockReturnValueOnce(new Promise(() => {}));
  const immediate = render();
  expect(immediate).not.toContain("file:///old-account.jpg");
  expect(immediate).toContain("dayFeed.loading");
});

it("multi-select saves each explicit retained file through the same owning helper", async () => {
  const repo = {
    listTripPhotos: vi.fn(async () => []),
    addTripPhoto: vi.fn(async () => ({})),
  };
  state.repository.mockResolvedValue(repo);
  render();
  await flush();
  render();
  state.picker.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///one.jpg" }, { uri: "file:///two.jpg" }],
  });
  state.buttons[0].onPress();
  await flush();
  expect(state.picker).toHaveBeenCalledWith(
    expect.objectContaining({ allowsMultipleSelection: true }),
  );
  expect(repo.addTripPhoto.mock.calls).toEqual([
    [tripId, "file:///one.jpg"],
    [tripId, "file:///two.jpg"],
  ]);
});
it("a partial multi-save failure reloads retained rows and reports failure rather than whole-operation success", async () => {
  const retained: unknown[] = [];
  const repo = {
    listTripPhotos: vi.fn(async () => retained),
    addTripPhoto: vi.fn(async (_id: string, uri: string) => {
      if (uri.endsWith("two.jpg")) throw new Error("FAIL");
      retained.push({ assetId: "one", localUri: uri });
      return {};
    }),
  };
  state.repository.mockResolvedValue(repo);
  render();
  await flush();
  render();
  state.picker.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///one.jpg" }, { uri: "file:///two.jpg" }],
  });
  state.buttons[0].onPress();
  await flush();
  const html = render();
  expect(html).toContain("file:///one.jpg");
  expect(html).toContain("tripPhotos.addFailed");
});

it("keeps the real Photos capability mounted behind a compact More row", async () => {
  state.repository.mockResolvedValue({
    listTripPhotos: vi.fn(async () => []),
    addTripPhoto: vi.fn(),
  });
  render(tripId, true);
  await flush();
  expect(render(tripId, true)).not.toContain("tripPhotos.choose");
  state.buttons[0].onPress();
  expect(render(tripId, true)).toContain("tripPhotos.choose");
});

it("shows ActionIsland picker failures even while the compact Photos row is collapsed", async () => {
  const repo = { listTripPhotos: vi.fn(async () => []), addTripPhoto: vi.fn() };
  state.repository.mockResolvedValue(repo);
  let add: (() => void) | null = null;
  const register = (value: (() => void) | null) => {
    add = value;
  };
  render(tripId, true, register);
  await flush();
  state.refreshEffects = true;
  expect(render(tripId, true, register)).not.toContain("tripPhotos.choose");
  state.refreshEffects = false;
  state.picker.mockRejectedValueOnce(new Error("PICKER_FAILED"));
  expect(add).toBeTypeOf("function");
  add!();
  await flush();
  expect(render(tripId, true, register)).toContain("tripPhotos.addFailed");
  expect(repo.addTripPhoto).not.toHaveBeenCalled();
});

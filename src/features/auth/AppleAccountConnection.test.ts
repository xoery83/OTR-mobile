import { beforeEach, expect, it, vi } from "vitest";
import { AppleAccountConnection } from "./AppleAccountConnection";

const state = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  cursor: 0,
  refCursor: 0,
  generation: 1,
  effect: null as null | (() => () => void),
  alert: vi.fn(),
  link: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_sub: unknown, get: () => unknown) => get(),
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (value: unknown) => {
        state.values[i] = value;
      },
    ];
  },
  useRef: (initial: unknown) => (state.refs[state.refCursor++] ??= { current: initial }),
  useEffect: (effect: () => () => void) => {
    state.effect ??= effect;
  },
}));
vi.mock("react-native", () => ({ Alert: { alert: state.alert } }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: vi.fn(),
}));
vi.mock("@/data/auth/authRepository", () => ({
  readLocalSession: async () => ({ identity: { userId: "account-a" } }),
}));
vi.mock("@/data/auth/appleSignIn", () => ({
  loadNativeApple: () => ({ isAvailableAsync: async () => true }),
}));
vi.mock("@/data/auth/linkAppleAccount", () => ({
  linkAppleToCurrentAccount: state.link,
}));
vi.mock("@/ui/controls", () => ({ UiSection: "Section", UiText: "Text" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("./AppleSignInButton", () => ({ AppleSignInButton: "AppleButton" }));

function render() {
  state.cursor = state.refCursor = 0;
  return AppleAccountConnection();
}
async function openConfirmation() {
  render();
  const cleanup = state.effect!();
  await vi.waitFor(() =>
    expect(state.values[0]).toEqual({ id: "account-a", generation: 1 }),
  );
  const node = render()!;
  const button = node.props.children.find((child: any) => child?.type === "AppleButton");
  button.props.onPress();
  const confirm = state.alert.mock.calls[0][2][1].onPress;
  return { cleanup, confirm };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.values = [];
  state.refs = [];
  state.effect = null;
  state.generation = 1;
  state.link.mockResolvedValue(undefined);
});
it("does not start Apple linking from a retained confirmation after Settings unmount", async () => {
  const { cleanup, confirm } = await openConfirmation();
  cleanup();
  confirm();
  await Promise.resolve();
  expect(state.link).not.toHaveBeenCalled();
});
it("requires a fresh confirmation after Account switching", async () => {
  const { confirm } = await openConfirmation();
  state.generation++;
  confirm();
  await Promise.resolve();
  expect(state.link).not.toHaveBeenCalled();
});
it("cancels an already-started link when Settings unmounts", async () => {
  state.link.mockImplementationOnce(async () => new Promise(() => {}));
  const { cleanup, confirm } = await openConfirmation();
  confirm();
  expect(state.link).toHaveBeenCalledOnce();
  const signal = state.link.mock.calls[0][0] as AbortSignal;
  cleanup();
  expect(signal.aborted).toBe(true);
});

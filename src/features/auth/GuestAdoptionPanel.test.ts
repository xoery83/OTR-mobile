import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GuestAdoptionPanel } from "./GuestAdoptionPanel";
const s = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  cursor: 0,
  refCursor: 0,
  effects: [] as (() => unknown)[],
  prepare: vi.fn(),
  principal: vi.fn(),
  session: vi.fn(),
  prevent: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (value: unknown) => (s.refs[s.refCursor++] ??= { current: value }),
  useState: (value: unknown) => {
    const index = s.cursor++;
    if (index >= s.values.length) s.values[index] = value;
    return [
      s.values[index],
      (next: unknown) => {
        s.values[index] = next;
      },
    ];
  },
  useEffect: (fn: () => unknown) => s.effects.push(fn),
}));
vi.mock("expo-router/react-navigation", () => ({ usePreventRemove: s.prevent }));
vi.mock("@/data/auth/guestTripP1Adoption", () => ({
  prepareGuestTripP1Adoption: s.prepare,
}));
vi.mock("@/data/auth/authRepository", () => ({
  readCommittedLocalPrincipal: s.principal,
  readCommittedLocalSession: s.session,
}));
vi.mock("@/ui/controls", () => ({
  UiSection: "Section",
  UiText: "Text",
  UiButton: "Button",
}));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));
const session = {
  identity: { userId: "target", displayName: "", email: null },
  accessToken: "local-fixture",
  refreshToken: "local-fixture",
  expiresAt: "2099-01-01T00:00:00Z",
};
type Node = { props: Record<string, any> };
const nodes = (v: any): Node[] =>
  Array.isArray(v) ? v.flatMap(nodes) : v?.props ? [v, ...nodes(v.props.children)] : [];
const makeProps = () => ({
  session,
  generation: getAccountGeneration(),
  signal: new AbortController().signal,
  onComplete: vi.fn(async () => {}),
  onFinished: vi.fn(),
  onCancel: vi.fn(),
  onBusyChange: vi.fn(),
});
let props: ReturnType<typeof makeProps>;
afterEach(() => vi.unstubAllGlobals());
function render() {
  s.cursor = s.refCursor = 0;
  s.effects = [];
  return nodes(GuestAdoptionPanel(props));
}
function press(label: string) {
  render()
    .find((n) => n.props.label === label)!
    .props.onPress();
}
beforeEach(() => {
  vi.resetAllMocks();
  s.values = [];
  s.refs = [];
  props = makeProps();
  s.principal.mockResolvedValue({ kind: "GUEST", localId: "guest" });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    callback();
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
it("does not freeze or transfer any data before explicit Add trips confirmation", async () => {
  const cancel = vi.fn(async () => {}),
    publish = vi.fn();
  s.prepare.mockResolvedValue({ cancel, publish, canCancel: true });
  render();
  expect(s.prepare).not.toHaveBeenCalled();
  press("auth.adoptionCancel");
  await vi.waitFor(() => expect(props.onCancel).toHaveBeenCalledOnce());
  expect(s.prepare).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledOnce();
  expect(publish).not.toHaveBeenCalled();
  expect(props.onComplete).not.toHaveBeenCalled();
});
it("keeps the same attempt and cancellation intent after revocation UNKNOWN", async () => {
  const cancel = vi
      .fn()
      .mockRejectedValueOnce(Error("REVOCATION_UNKNOWN"))
      .mockResolvedValueOnce(undefined),
    publish = vi.fn();
  s.prepare.mockResolvedValue({ cancel, publish, canCancel: true });
  press("auth.adoptionCancel");
  await vi.waitFor(() =>
    expect(render().some((n) => n.props.accessibilityRole === "alert")).toBe(true),
  );
  expect(props.onCancel).not.toHaveBeenCalled();
  expect(s.prevent).toHaveBeenLastCalledWith(true, expect.any(Function));
  press("auth.adoptionRetryCancel");
  await vi.waitFor(() => expect(props.onCancel).toHaveBeenCalledOnce());
  expect(s.prepare).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(publish).not.toHaveBeenCalled();
});
it("locks dismissal during publication and navigates only after Session completion unlocks", async () => {
  let release!: () => void;
  const publish = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  s.prepare.mockResolvedValue({ publish, cancel: vi.fn(), canCancel: false });
  press("auth.adoptionAdd");
  await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
  const current = render();
  expect(s.prevent).toHaveBeenLastCalledWith(true, expect.any(Function));
  expect(
    current.find((n) => n.props.label === "auth.adoptionCancel")!.props.disabled,
  ).toBe(true);
  release();
  await vi.waitFor(() =>
    expect(props.onComplete).toHaveBeenCalledWith(session, props.generation),
  );
  render();
  s.effects.forEach((effect) => effect());
  expect(s.prevent).toHaveBeenLastCalledWith(false, expect.any(Function));
  expect(props.onFinished).toHaveBeenCalledOnce();
});
it("retries an UNKNOWN publication with the retained attempt and no new OTP or preparation", async () => {
  const publish = vi
    .fn()
    .mockRejectedValueOnce(Error("UNKNOWN"))
    .mockResolvedValueOnce(undefined);
  s.prepare.mockResolvedValue({ publish, cancel: vi.fn(), canCancel: false });
  press("auth.adoptionAdd");
  await vi.waitFor(() =>
    expect(render().some((n) => n.props.accessibilityRole === "alert")).toBe(true),
  );
  press("auth.adoptionRetry");
  await vi.waitFor(() => expect(props.onComplete).toHaveBeenCalledOnce());
  expect(s.prepare).toHaveBeenCalledOnce();
  expect(publish).toHaveBeenCalledTimes(2);
});
it("resumes a retained same-Account Session through the ordinary coordinator without replaying Guest publication", async () => {
  const retained = { ...session, refreshToken: "refreshed-local-fixture" };
  s.principal.mockResolvedValue({ kind: "ACCOUNT", accountId: "target" });
  s.session.mockResolvedValue(retained);
  press("auth.adoptionAdd");
  await vi.waitFor(() =>
    expect(props.onComplete).toHaveBeenCalledWith(retained, getAccountGeneration()),
  );
  expect(s.prepare).not.toHaveBeenCalled();
});
it("cannot resume sign-in against a different active Account", async () => {
  s.principal.mockResolvedValue({ kind: "ACCOUNT", accountId: "other" });
  press("auth.adoptionAdd");
  await vi.waitFor(() =>
    expect(render().some((n) => n.props.accessibilityRole === "alert")).toBe(true),
  );
  expect(s.session).not.toHaveBeenCalled();
  expect(props.onComplete).not.toHaveBeenCalled();
  expect(s.prepare).not.toHaveBeenCalled();
});

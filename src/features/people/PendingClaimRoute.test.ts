import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import PendingClaimRoute from "../../../app/pending-claim";
const run = vi.hoisted(() => ({
  params: {} as Record<string, unknown>,
  generation: 3,
  accountId: "",
  cursor: 0,
  hooks: [] as any[],
  pending: [] as (() => void)[],
  deps: undefined as unknown[] | undefined,
  cleanup: undefined as (() => void) | undefined,
  capture: vi.fn(),
  guard: vi.fn(),
  ports: vi.fn(),
  create: vi.fn(),
}));
vi.mock("react", () => ({
  useState: (value: unknown) => {
    const i = run.cursor++;
    if (!(i in run.hooks)) run.hooks[i] = value;
    return [
      run.hooks[i],
      (next: unknown) => {
        run.hooks[i] = next;
      },
    ];
  },
  useSyncExternalStore: (_s: unknown, get: () => unknown) => get(),
  useEffect: (effect: () => () => void, deps: unknown[]) => {
    if (!run.deps || deps.some((v, i) => v !== run.deps![i])) {
      run.deps = deps;
      run.pending.push(() => {
        run.cleanup?.();
        run.cleanup = effect();
      });
    }
  },
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: "StackScreen" },
  useLocalSearchParams: () => run.params,
}));
vi.mock("react-native", () => ({
  View: "View",
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock("@/data/auth/authRepository", () => ({
  requireAdoptedUserId: async () => run.accountId,
  readNativeDirectedInvitePorts: run.ports,
}));
vi.mock("@/data/auth/accountRequestContext", () => ({
  captureAccountRequestContext: run.capture,
  assertAccountRequestContext: run.guard,
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => run.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("./pendingClaimSubmissionController", () => ({
  createPendingClaimSubmissionController: run.create,
}));
vi.mock("./PendingClaimSubmissionScreen", () => ({
  PendingClaimSubmissionScreen: "ResolutionScreen",
}));
vi.mock("@/ui/controls", () => ({ UiSection: "Section", UiText: "Text" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
const nodes = (v: any): any[] =>
  Array.isArray(v) ? v.flatMap(nodes) : v?.props ? [v, ...nodes(v.props.children)] : [];
const render = () => {
  run.cursor = 0;
  return nodes(PendingClaimRoute());
};
const effects = async () => {
  run.pending.splice(0).forEach((effect) => effect());
  await new Promise((resolve) => setImmediate(resolve));
};
beforeEach(() => {
  run.params = {};
  run.generation = 3;
  run.accountId = randomUUID();
  run.cursor = 0;
  run.hooks = [];
  run.pending = [];
  run.deps = undefined;
  run.cleanup = undefined;
  run.capture.mockReset().mockImplementation(async (tripId) => ({
    accountId: run.accountId,
    tripId,
    generation: run.generation,
  }));
  run.guard.mockReset().mockImplementation(async (context) => {
    if (context.accountId !== run.accountId || context.generation !== run.generation)
      throw Error("STALE");
  });
  run.ports
    .mockReset()
    .mockReturnValue({
      account: "accountPort",
      reader: "invitationsPort",
      resolutionReader: "previewPort",
      attempts: "originalPort",
    });
  run.create.mockReset().mockImplementation((context, inviteId) => ({
    context,
    inviteId,
    load: vi.fn(async () => {}),
    dispose: vi.fn(),
  }));
});
it.each([
  {},
  { tripId: randomUUID() },
  { tripId: "bad", inviteId: randomUUID() },
  { tripId: randomUUID(), inviteId: "bad" },
  { tripId: [randomUUID()], inviteId: randomUUID() },
])(
  "never invents a request or starts qualification for invalid params",
  async (params) => {
    run.params = params;
    const tree = render();
    await effects();
    expect(
      tree.some((n) => n.props.children === "people.claimResolution.unavailable"),
    ).toBe(true);
    expect(run.capture).not.toHaveBeenCalled();
    expect(run.ports).not.toHaveBeenCalled();
    expect(run.create).not.toHaveBeenCalled();
  },
);
it("binds the exact supplied request/Trip and existing Account scope, loads once and releases on unmount", async () => {
  const tripId = randomUUID(),
    inviteId = randomUUID();
  run.params = { tripId, inviteId };
  render();
  await effects();
  expect(run.create).toHaveBeenCalledWith(
    { accountId: run.accountId, tripId, generation: 3 },
    inviteId,
    {
      account: "accountPort",
      invitations: "invitationsPort",
      reader: "previewPort",
      attempts: "originalPort",
    },
  );
  const c = run.create.mock.results[0].value;
  expect(c.load).toHaveBeenCalledOnce();
  expect(render().find((n) => n.type === "ResolutionScreen").props.controller).toBe(c);
  run.cleanup?.();
  expect(c.dispose).toHaveBeenCalledOnce();
});
it("generation change hides the old controller before the new effect and disposes its scope", async () => {
  run.params = { tripId: randomUUID(), inviteId: randomUUID() };
  render();
  await effects();
  const old = run.create.mock.results[0].value;
  run.generation++;
  run.accountId = randomUUID();
  expect(render().some((n) => n.type === "ResolutionScreen")).toBe(false);
  await effects();
  expect(old.dispose).toHaveBeenCalledOnce();
});

import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import IncomingInvitationsRoute from "../../../app/directed-invitations";
import { createIncomingInvitationSelection } from "@/data/repositories/incomingInvitationSelection";
import { captureAccountScope } from "@/data/auth/accountRequestContext";

const run = vi.hoisted(() => ({
  accountId: "", generation: 3, cursor: 0, hooks: [] as any[],
  deps: undefined as unknown[] | undefined, effect: undefined as (() => void) | undefined,
  cleanup: undefined as (() => void) | undefined,
  ports: vi.fn(), push: vi.fn(),
}));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const i = run.cursor++;
    if (!(i in run.hooks)) run.hooks[i] = initial;
    return [run.hooks[i], (value: any) => { run.hooks[i] = typeof value === "function" ? value(run.hooks[i]) : value; }];
  },
  useRef(initial: unknown) {
    const i = run.cursor++;
    return (run.hooks[i] ??= { current: initial });
  },
  useLayoutEffect(effect: () => void) { effect(); },
  useEffect(effect: () => () => void, deps: unknown[]) {
    if (!run.deps || deps.some((value, i) => value !== run.deps![i])) {
      run.deps = deps;
      run.effect = () => { run.cleanup?.(); run.cleanup = effect(); };
    }
  },
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
}));
vi.mock("expo-router", () => ({ Stack: { Screen: "StackScreen" }, router: { push: run.push } }));
vi.mock("react-native", () => ({ ScrollView: "ScrollView" }));
vi.mock("@/data/auth/authRepository", () => ({
  requireAdoptedUserId: async () => run.accountId,
  readNativeDirectedInvitePorts: run.ports,
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => run.generation, subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/ui/controls", () => ({ UiButton: "Button", UiText: "Text", UiSection: "Section" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
const nodes = (value: any): any[] => Array.isArray(value) ? value.flatMap(nodes) : value?.props ? [value, ...nodes(value.props.children)] : [];
const render = () => { run.cursor = 0; return nodes(IncomingInvitationsRoute()); };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const effects = async () => { const effect = run.effect; run.effect = undefined; effect?.(); await tick(); };
beforeEach(() => {
  run.accountId = randomUUID(); run.generation = 3; run.cursor = 0; run.hooks = []; run.deps = undefined;
  run.effect = undefined; run.cleanup = undefined; run.ports.mockReset(); run.push.mockReset();
});
it("restores selected navigation after Back and can list new invitations without touching UNKNOWN", async () => {
  const scope = await captureAccountScope(async () => run.accountId);
  const rows = new Map<string, string>([["original-unknown-checkpoint", "same-original-operation-bytes"]]);
  const storage = { getItem: async (key: string) => rows.get(key) ?? null,
    setItem: async (key: string, value: string) => { rows.set(key, value); }, deleteItem: async (key: string) => { rows.delete(key); } };
  const selection = createIncomingInvitationSelection(storage, async () => run.accountId);
  const old = { tripId: randomUUID(), inviteId: randomUUID() }, next = { tripId: randomUUID(), inviteId: randomUUID() };
  await selection.select(scope, old);
  const incoming = vi.fn(async () => ({ invitations: [next] }));
  run.ports.mockResolvedValue({ selection, reader: { incoming } });
  render(); await effects();
  let tree = render();
  expect(incoming).not.toHaveBeenCalled();
  tree.find((node) => node.props.label === "people.directedInvite.all").props.onPress();
  await tick(); render(); await effects(); tree = render();
  expect(incoming).toHaveBeenCalledOnce();
  expect(rows.get("original-unknown-checkpoint")).toBe("same-original-operation-bytes");
  tree.find((node) => node.props.label === "people.directedClaim.title").props.onPress();
  await tick();
  expect(run.push).toHaveBeenCalledWith({ pathname: "/pending-claim", params: next });
  expect(rows.get("original-unknown-checkpoint")).toBe("same-original-operation-bytes");
});
it("does not navigate after the selected Account changes during selection", async () => {
  let finish!: () => void;
  const reference = { tripId: randomUUID(), inviteId: randomUUID() };
  run.ports.mockResolvedValue({ selection: {
    open: async (scope: unknown) => ({ scope, selected: null, invitations: [reference] }),
    select: () => new Promise<void>((resolve) => { finish = resolve; }),
  } });
  render(); await effects();
  render().find((node) => node.props.label === "people.directedClaim.title").props.onPress();
  await tick();
  run.accountId = randomUUID(); run.generation++; render();
  finish(); await tick();
  expect(run.push).not.toHaveBeenCalled();
});

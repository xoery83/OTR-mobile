import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { DirectedInviteScreen, DirectedClaimScreen } from "./DirectedInviteScreens";
import type {
  createDirectedClaimController,
  createDirectedInviteController,
} from "./directedInviteControllers";
const hooks = vi.hoisted(() => ({
  generation: 3,
  ref: { current: null as unknown },
  effects: [] as (() => () => void)[],
}));
vi.mock("react", () => ({
  useSyncExternalStore: (_s: unknown, get: () => unknown) => get(),
  useRef: () => hooks.ref,
  useEffect: (effect: () => () => void) => {
    hooks.effects.push(effect);
  },
}));
vi.mock("react-native", () => ({
  View: "View",
  StyleSheet: { create: (v: unknown) => v },
}));
vi.mock("@/ui/controls", () => ({
  UiText: "Text",
  UiButton: "Button",
  UiSection: "Section",
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("./DirectedClaimContent", () => ({ DirectedClaimContent: "ClaimContent" }));
vi.mock("./DirectedInviteRecipientsContent", () => ({
  DirectedInviteRecipientsContent: "InviteContent",
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => hooks.generation,
  subscribeAccountGeneration: () => () => {},
}));
beforeEach(() => {
  hooks.effects = [];
  hooks.ref = { current: null };
  hooks.generation = 3;
});
const nodes = (v: any): any[] =>
  Array.isArray(v) ? v.flatMap(nodes) : v?.props ? [v, ...nodes(v.props.children)] : [];
function fixture() {
  const context = { accountId: randomUUID(), tripId: randomUUID(), generation: 3 };
  const detail = {
    version: 1 as const,
    accountId: context.accountId,
    invitation: {
      inviteId: randomUUID(),
      tripId: context.tripId,
      personId: randomUUID(),
      tripName: "Synthetic",
      personName: "Synthetic",
      expiresAt: "2026-11-15T00:00:00Z",
      status: "PENDING" as const,
    },
  };
  const state = {
    phase: "READY" as
      "READY" | "UNKNOWN" | "LOADING" | "AWAITING_READBACK" | "UNAVAILABLE",
    detail,
    operationId: randomUUID() as string | null,
    memberReadbackVerified: false,
    outcome: null,
  };
  const model = {
    context,
    getSnapshot: () => state,
    subscribe: () => () => {},
    dispose: vi.fn(),
    load: vi.fn(async () => {}),
    confirm: vi.fn(async () => {}),
    checkOriginal: vi.fn(async () => {}),
    retryReadback: vi.fn(async () => {}),
  } satisfies ReturnType<typeof createDirectedClaimController>;
  const copy = Object.fromEntries(
    [
      "title",
      "confirm",
      "check",
      "busy",
      "unknown",
      "readback",
      "expired",
      "revoked",
      "unavailable",
      "loading",
      "reload",
      "verified",
    ].map((k) => [k, `catalog.${k}`]),
  ) as Parameters<typeof DirectedClaimScreen>[0]["copy"];
  return { context, state, model, copy };
}
it("mounts an Auth model and routes explicit confirm/check to it", () => {
  const f = fixture();
  const tree = nodes(DirectedClaimScreen({ controller: f.model, copy: f.copy }));
  hooks.effects[0]();
  expect(f.model.load).toHaveBeenCalledOnce();
  tree.find((n) => n.type === "ClaimContent").props.onConfirm();
  tree.find((n) => n.type === "ClaimContent").props.onCheckOriginal();
  expect(f.model.confirm).toHaveBeenCalledOnce();
  expect(f.model.checkOriginal).toHaveBeenCalledOnce();
});
it("a claimed invitation with no original retries readback rather than querying an absent operation", () => {
  const f = fixture();
  f.state.phase = "AWAITING_READBACK";
  f.state.operationId = null;
  const content = nodes(DirectedClaimScreen({ controller: f.model, copy: f.copy })).find(
    (n) => n.type === "ClaimContent",
  );
  expect(content.props.copy.check).toBe(f.copy.reload);
  content.props.onCheckOriginal();
  expect(f.model.retryReadback).toHaveBeenCalledOnce();
  expect(f.model.checkOriginal).not.toHaveBeenCalled();
});
it("shows verified member wording only from the Auth readback state", () => {
  const f = fixture();
  f.state.phase = "AWAITING_READBACK";
  let content = nodes(DirectedClaimScreen({ controller: f.model, copy: f.copy })).find(
    (n) => n.type === "ClaimContent",
  );
  expect(content.props.copy.readback).toBe(f.copy.readback);
  f.state.memberReadbackVerified = true;
  content = nodes(DirectedClaimScreen({ controller: f.model, copy: f.copy })).find(
    (n) => n.type === "ClaimContent",
  );
  expect(content.props.readbackVerified).toBe(true);
  expect(content.props.copy.readback).toBe(f.copy.verified);
});
it("replays StrictMode effects without disposing the live model; real unmount disposes", async () => {
  const f = fixture();
  DirectedClaimScreen({ controller: f.model, copy: f.copy });
  const first = hooks.effects[0]();
  first();
  const second = hooks.effects[0]();
  await Promise.resolve();
  expect(f.model.dispose).not.toHaveBeenCalled();
  second();
  await Promise.resolve();
  expect(f.model.dispose).toHaveBeenCalledOnce();
});
it("disposes the old controller when the committed view uses a new one", async () => {
  const f = fixture(),
    g = fixture();
  DirectedClaimScreen({ controller: f.model, copy: f.copy });
  const first = hooks.effects[0]();
  first();
  DirectedClaimScreen({ controller: g.model, copy: g.copy });
  hooks.effects[1]();
  await Promise.resolve();
  expect(f.model.dispose).toHaveBeenCalledOnce();
  expect(g.model.dispose).not.toHaveBeenCalled();
});
it("hides a stale Account generation", () => {
  const f = fixture();
  hooks.generation++;
  expect(DirectedClaimScreen({ controller: f.model, copy: f.copy })).toBeNull();
});
it("A screen forwards explicit Account selection and one Send to its Auth model", () => {
  const f = fixture();
  const state = {
    phase: "READY" as const,
    recipients: {
      version: 1 as const,
      accountId: f.context.accountId,
      tripId: f.context.tripId,
      recipients: [{ accountId: randomUUID(), displayName: "Synthetic" }],
    },
    selectedAccountId: null,
    outcome: null,
    operationId: null,
  };
  const controller = {
    context: f.context,
    getSnapshot: () => state,
    subscribe: () => () => {},
    dispose: vi.fn(),
    load: vi.fn(async () => {}),
    select: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    checkOriginal: vi.fn(async () => {}),
  } satisfies ReturnType<typeof createDirectedInviteController>;
  const copy = Object.fromEntries(
    [
      "title",
      "unnamed",
      "send",
      "check",
      "busy",
      "unknown",
      "pending",
      "unavailable",
      "empty",
      "loading",
      "reload",
    ].map((k) => [k, `catalog.${k}`]),
  ) as Parameters<typeof DirectedInviteScreen>[0]["copy"];
  const content = nodes(DirectedInviteScreen({ controller, copy })).find(
    (n) => n.type === "InviteContent",
  );
  const selected = state.recipients.recipients[0].accountId;
  content.props.onSelect(selected);
  content.props.onSend();
  expect(controller.select).toHaveBeenCalledWith(selected);
  expect(controller.send).toHaveBeenCalledOnce();
});

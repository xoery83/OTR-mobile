import { beforeEach, expect, it, vi } from "vitest";
import { getAccountGeneration } from "@/data/auth/accountGeneration";

const state = vi.hoisted(() => ({
  dispatch: vi.fn(),
  setFallback: vi.fn(),
  home: false,
}));
vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => unknown) => { effect(); },
  useLayoutEffect: (effect: () => unknown) => { effect(); },
  useRef: (value: unknown) => ({ current: value }),
  useState: () => [undefined, state.setFallback],
}));
vi.mock("expo-router/react-navigation", () => ({ useRoute: () => ({ key: "source-day" }) }));
vi.mock("expo-router", () => ({
  useNavigation: (path: string | undefined) => path
    ? {
        getState: () => ({ key: "root", index: 0, routes: [{ key: "root-day" }] }),
        dispatch: state.dispatch,
      }
    : {
        isFocused: () => true,
        getState: () => ({ routes: [{
          key: "source-day", params: { view: state.home ? "home" : "day", tripId: "trip" },
        }] }),
      },
}));

beforeEach(() => {
  state.dispatch.mockReset();
  state.setFallback.mockReset();
  state.home = false;
});

const confirmation = {
  proposalIdentity: {},
  body: null,
  titleKey: "fidelity.moveTitle" as const,
  disabled: false,
  isBusy: () => false,
  isCurrent: () => true,
  apply: vi.fn(async () => true),
  dismiss: vi.fn(),
};

it("passes the same invocation to the root and nested screen and retains the fallback on refusal", async () => {
  const { useHostedDayMoveConfirmation } = await import("./useHostedDayMoveConfirmation");
  const { readDayMoveSheet } = await import("./dayMoveConfirmationSheet");
  useHostedDayMoveConfirmation(confirmation, true, false, "trip", getAccountGeneration());
  expect(state.dispatch).toHaveBeenCalledOnce();
  const [action] = state.dispatch.mock.lastCall!;
  const id = action.payload.params.invocation;
  expect(action).toMatchObject({
    type: "PUSH", target: "root", source: "root-day",
    payload: { name: "day-move", params: { invocation: id, screen: "index", params: { invocation: id } } },
  });
  expect(readDayMoveSheet(id)).toBeUndefined();
  expect(state.setFallback).toHaveBeenCalledExactlyOnceWith(confirmation.proposalIdentity);
});

it("does not stage a stale Day proposal when the original route is now Home", async () => {
  const { useHostedDayMoveConfirmation } = await import("./useHostedDayMoveConfirmation");
  state.home = true;
  useHostedDayMoveConfirmation(confirmation, true, false, "trip", getAccountGeneration());
  expect(state.dispatch).not.toHaveBeenCalled();
  expect(state.setFallback).not.toHaveBeenCalled();
});

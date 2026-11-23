import { describe, expect, it, vi } from "vitest";
import { createSheetDrag, createSheetScrollDismissal, createSheetBackSwipe } from "./sheetDrag";

vi.mock("react-native", () => ({
  PanResponder: { create: (panHandlers: unknown) => ({ panHandlers }) },
}));

const dragFixture = () => ({ start: vi.fn(), move: vi.fn(), release: vi.fn() });

describe("sheet drag ownership", () => {
  const touch = (pageY: number, pageX = 5) => [{ pageX, pageY }];

  it("keeps a gesture that starts away from the top with the native scroller", () => {
    const drag = dragFixture();
    const gesture = createSheetScrollDismissal();
    gesture.onScroll(90, drag);
    gesture.begin(touch(200), drag);
    gesture.onScroll(0, drag);
    gesture.move(touch(280), drag);
    gesture.end(drag);
    expect(drag.start).not.toHaveBeenCalled();

    gesture.begin(touch(200), drag);
    gesture.move(touch(208), drag);
    gesture.move(touch(275), drag);
    gesture.end(drag);
    expect(drag.start).toHaveBeenCalledOnce();
    expect(drag.move.mock.calls).toEqual([[8], [75]]);
    expect(drag.release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("rejects drags initially traveling in the list and horizontal or multiple fingers", () => {
    const drag = dragFixture();
    const gesture = createSheetScrollDismissal();
    for (const move of [touch(180), touch(209, 75), [...touch(210), ...touch(212)]]) {
      gesture.begin(touch(200), drag);
      gesture.move(move, drag);
      gesture.move(touch(280), drag);
      gesture.end(drag);
    }
    expect(drag.start).not.toHaveBeenCalled();
  });

  it("settles when reversed, cancelled or interrupted by actual scroll offset", () => {
    const drag = dragFixture();
    const gesture = createSheetScrollDismissal();
    gesture.begin(touch(0), drag);
    gesture.move(touch(74), drag);
    gesture.move(touch(2), drag);
    gesture.end(drag);
    gesture.begin(touch(0), drag);
    gesture.move(touch(74), drag);
    gesture.cancel(drag);
    gesture.begin(touch(0), drag);
    gesture.move(touch(74), drag);
    gesture.onScroll(15, drag);
    gesture.onScroll(0, drag);
    gesture.end(drag);
    expect(drag.release.mock.calls).toEqual([[false], [false], [false]]);
  });

  it("returns from a child only for a completed dominant rightward swipe", () => {
    const back = vi.fn();
    const events = createSheetBackSwipe(back) as unknown as {
      onPanResponderGrant(): void;
      onPanResponderMove(event: unknown, gesture: unknown): void;
      onPanResponderRelease(event: unknown, gesture: unknown): void;
    };
    events.onPanResponderGrant();
    events.onPanResponderRelease(null, { dx: 84, dy: 9 });
    events.onPanResponderGrant();
    events.onPanResponderRelease(null, { dx: 84, dy: 110 });
    events.onPanResponderRelease(null, { dx: -84, dy: 9 });
    events.onPanResponderRelease(null, { dx: 20, dy: 2 });
    events.onPanResponderMove(null, { numberActiveTouches: 2 });
    events.onPanResponderRelease(null, { dx: 120, dy: 2 });
    expect(back).toHaveBeenCalledOnce();
  });

  it("supports dragging from the caption and returns on a short drag", () => {
    const drag = dragFixture();
    const events = createSheetDrag(drag) as unknown as {
      onStartShouldSetPanResponderCapture(event: unknown): boolean;
      onPanResponderRelease(event: unknown, gesture: unknown): void;
    };
    expect(events.onStartShouldSetPanResponderCapture({ nativeEvent: { touches: [{}] } })).toBe(true);
    events.onPanResponderRelease(null, { dx: 0, dy: 30 });
    events.onPanResponderRelease(null, { dx: 0, dy: 80 });
    expect(drag.release.mock.calls).toEqual([[false], [true]]);
  });
});

it("claims a short body only after a single, dominant downward move", () => {
  const drag = dragFixture();
  const events = createSheetDrag(drag, "downward-move") as unknown as {
    onStartShouldSetPanResponderCapture(event: unknown): boolean;
    onMoveShouldSetPanResponderCapture(event: unknown, gesture: unknown): boolean;
    onPanResponderGrant(): void;
    onPanResponderMove(event: unknown, gesture: unknown): void;
    onPanResponderRelease(event: unknown, gesture: unknown): void;
  };
  expect(events.onStartShouldSetPanResponderCapture({ nativeEvent: { touches: [{}] } })).toBe(false);
  const canClaim = (dx: number, dy: number, numberActiveTouches = 1) =>
    events.onMoveShouldSetPanResponderCapture(null, { dx, dy, numberActiveTouches });
  expect(canClaim(0, 4)).toBe(false);
  expect(canClaim(0, -17)).toBe(false);
  expect(canClaim(26, 13)).toBe(false);
  expect(canClaim(0, 20, 2)).toBe(false);
  expect(canClaim(1, 20)).toBe(true);
  events.onPanResponderGrant();
  events.onPanResponderMove(null, { dx: 1, dy: 58, numberActiveTouches: 1 });
  events.onPanResponderRelease(null, { dx: 1, dy: 58 });
  expect(drag.move.mock.calls).toEqual([[20], [78]]);
  expect(drag.release).toHaveBeenCalledWith(true);

  // A coalesced drag can cross the threshold on the same event that grants it.
  expect(canClaim(2, 65)).toBe(true);
  events.onPanResponderGrant();
  events.onPanResponderRelease(null, { dx: 0, dy: 0 });
  expect(drag.release).toHaveBeenLastCalledWith(true);
});

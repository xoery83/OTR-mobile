import { PanResponder, type PanResponderGestureState } from "react-native";

export type SheetDrag = {
  start(): void;
  move(distance: number): void;
  release(dismiss: boolean): void;
};

type Travel = Pick<PanResponderGestureState, "dx" | "dy">;

const isDownward = ({ dx, dy }: Travel) => dy > Math.abs(dx);
const isRightward = ({ dx, dy }: PanResponderGestureState) => dx > Math.abs(dy);

export function createSheetDrag(drag: SheetDrag, start: "touch" | "downward-move" = "touch") {
  let interrupted = false;
  let claim: Travel = { dx: 0, dy: 0 };
  const travel = ({ dx, dy }: Travel): Travel => ({ dx: dx + claim.dx, dy: dy + claim.dy });
  return PanResponder.create({
    onStartShouldSetPanResponderCapture: event =>
      start === "touch" && event.nativeEvent.touches.length === 1,
    onMoveShouldSetPanResponderCapture: (_, gesture) => {
      if (start !== "downward-move" || gesture.numberActiveTouches !== 1 ||
        gesture.dy < 8 || !isDownward(gesture)) return false;
      // PanResponder resets its deltas when granting ownership.
      claim = { dx: gesture.dx, dy: gesture.dy };
      return true;
    },
    onPanResponderGrant: () => {
      interrupted = false;
      drag.start();
      if (claim.dy > 0) drag.move(claim.dy);
    },
    onPanResponderMove: (_, gesture) => {
      if (gesture.numberActiveTouches !== 1) interrupted = true;
      const distance = travel(gesture);
      if (!interrupted) drag.move(isDownward(distance) ? distance.dy : 0);
    },
    onPanResponderRelease: (_, gesture) => {
      const distance = travel(gesture);
      drag.release(!interrupted && distance.dy >= 56 && isDownward(distance));
      claim = { dx: 0, dy: 0 };
    },
    onPanResponderReject: () => { claim = { dx: 0, dy: 0 }; },
    onPanResponderTerminate: () => {
      claim = { dx: 0, dy: 0 };
      drag.release(false);
    },
    onPanResponderTerminationRequest: (_, gesture) => isRightward(gesture),
  }).panHandlers;
}

type TouchPoint = { pageX: number; pageY: number };

export function createSheetScrollDismissal() {
  let offset = 0;
  let origin: TouchPoint | undefined;
  let distance = 0;
  let following = false;
  const finish = (drag: SheetDrag, dismiss = false) => {
    if (following) drag.release(dismiss);
    following = false;
    origin = undefined;
    distance = 0;
  };

  return {
    onScroll(next: number, drag: SheetDrag) {
      offset = next;
      // A touch that scrolled into the list must finish before it can dismiss.
      if (next > 1) finish(drag);
    },
    begin(touches: readonly TouchPoint[], drag: SheetDrag) {
      finish(drag);
      if (offset <= 1 && touches.length === 1) origin = touches[0];
    },
    move(touches: readonly TouchPoint[], drag: SheetDrag) {
      if (!origin) return;
      if (touches.length !== 1) {
        finish(drag);
        return;
      }
      const point = touches[0];
      const dx = point.pageX - origin.pageX;
      const dy = point.pageY - origin.pageY;
      const downward = isDownward({ dx, dy });
      if (!following) {
        if (!downward && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) {
          origin = undefined;
          return;
        }
        if (!downward || dy < 8) return;
        drag.start();
        following = true;
      }
      distance = downward ? dy : 0;
      drag.move(distance);
    },
    end(drag: SheetDrag) { finish(drag, distance >= 56); },
    cancel: finish,
  };
}

export function createSheetBackSwipe(onBack: () => void) {
  let interrupted = false;
  return PanResponder.create({
    onStartShouldSetPanResponder: event => event.nativeEvent.touches.length === 1,
    onPanResponderGrant: () => { interrupted = false; },
    onPanResponderMove: (_, gesture) => {
      if (gesture.numberActiveTouches !== 1) interrupted = true;
    },
    onPanResponderRelease: (_, gesture) => {
      if (!interrupted && gesture.dx >= 64 && isRightward(gesture)) onBack();
    },
  }).panHandlers;
}

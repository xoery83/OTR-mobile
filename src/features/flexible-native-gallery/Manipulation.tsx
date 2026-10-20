import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AppState,
  PanResponder,
  Pressable,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native";
import { useUiTheme } from "@/ui/theme";
export function Manipulation({
  children,
  label,
  hint,
  dragDisabled,
  onTap,
  onArm,
  onMove,
  onDrop,
  onCancel,
  onBusy,
  cancelKey,
}: {
  cancelKey: number;
  children: ReactNode;
  label: string;
  hint?: string;
  dragDisabled?: boolean;
  onTap?: () => void;
  onArm?: () => void;
  onMove?: (e: GestureResponderEvent, g: PanResponderGestureState) => void;
  onDrop: (e: GestureResponderEvent, g: PanResponderGestureState) => void;
  onCancel?: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const armed = useRef(false);
  const dragging = useRef(false);
  const [activeKey, setActiveKey] = useState<number | null>(null);
  const colors = useUiTheme();
  const latest = useRef({ onMove, onDrop, onBusy, onCancel });
  useLayoutEffect(() => {
    latest.current = { onMove, onDrop, onBusy, onCancel };
  }, [onMove, onDrop, onBusy, onCancel]);
  const cancel = useCallback(() => {
    armed.current = false;
    dragging.current = false;
    setActiveKey(null);
    latest.current.onBusy(false);
    latest.current.onCancel?.();
  }, []);
  const responder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- PanResponder registers these closures; refs are read only during native events.
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_, g) => {
          const capture = armed.current && Math.hypot(g.dx, g.dy) > 6;
          if (capture) dragging.current = true;
          return capture;
        },
        onPanResponderMove: (e, g) => latest.current.onMove?.(e, g),
        onPanResponderRelease: (e, g) => {
          if (armed.current) latest.current.onDrop(e, g);
          cancel();
        },
        onPanResponderTerminate: cancel,
        onPanResponderTerminationRequest: () => true,
      }),
    [cancel],
  );
  useLayoutEffect(() => {
    armed.current = false;
    dragging.current = false;
  }, [cancelKey]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status !== "active") cancel();
    });
    return () => {
      subscription.remove();
      armed.current = false;
      latest.current.onBusy(false);
      latest.current.onCancel?.();
    };
  }, [cancel]);
  return (
    <View
      {...responder.panHandlers}
      style={
        activeKey === cancelKey
          ? { borderWidth: 1, borderColor: colors.accent }
          : undefined
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        delayLongPress={450}
        onLongPress={() => {
          if (dragDisabled) return;
          armed.current = true;
          setActiveKey(cancelKey);
          onArm?.();
          onBusy(true);
        }}
        onPress={() => {
          if (armed.current) cancel();
          else onTap?.();
        }}
        onPressOut={() => {
          if (armed.current && !dragging.current) cancel();
        }}
        onTouchCancel={cancel}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        {children}
      </Pressable>
    </View>
  );
}

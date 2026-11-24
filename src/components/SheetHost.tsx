import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo, Animated, Easing, KeyboardAvoidingView,
  Platform, Pressable, StyleSheet, View, type ScrollViewProps,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles } from "@/ui/theme";
import { visual } from "@/ui/visual";
import { createSheetDrag, createSheetScrollDismissal, type SheetDrag } from "./sheetDrag";

export type SheetHostHeight =
  | { mode: "content"; measuredHeight?: number }
  | { mode: "immersive" };

const SheetMotionContext = createContext<{
  requestClose(): void;
  requestCloseWithAction(action: () => void): void;
  drag: SheetDrag;
  exitPending: boolean;
  isExitPending(): boolean;
  getExitAttempt(): number;
  mode: SheetHostHeight["mode"];
} | null>(null);

export function useSheetMotion() {
  const motion = useContext(SheetMotionContext);
  if (!motion) throw new Error("SHEET_MOTION_CONTEXT_UNAVAILABLE");
  return motion;
}

// A short native scroller may never publish an overscroll offset. Capture only
// a real downward move so the first touch can still focus or press its target.
export function useShortSheetBodyDrag() {
  const motion = useContext(SheetMotionContext);
  const drag = motion?.drag;
  return useMemo(() => drag && createSheetDrag(drag, "downward-move"), [drag]);
}

export function useSheetScrollDismissal(enabled = true): ScrollViewProps {
  const motion = useContext(SheetMotionContext);
  const [dismissal] = useState(createSheetScrollDismissal);
  if (!motion || !enabled) return {};
  const { drag } = motion;
  const trackOffset: NonNullable<ScrollViewProps["onScroll"]> = ({ nativeEvent }) => {
    dismissal.onScroll(nativeEvent.contentOffset.y, drag);
  };
  return {
    // The host translates as the finger moves; keep the native content at its edge.
    bounces: false,
    overScrollMode: "never",
    contentInsetAdjustmentBehavior: "never",
    scrollEventThrottle: 16,
    onScrollBeginDrag: trackOffset,
    onScrollEndDrag: trackOffset,
    onScroll: trackOffset,
    onTouchStart: ({ nativeEvent }) => dismissal.begin(nativeEvent.touches, drag),
    onTouchMove: ({ nativeEvent }) => dismissal.move(nativeEvent.touches, drag),
    onTouchEnd: () => dismissal.end(drag),
    onTouchCancel: () => dismissal.cancel(drag),
  };
}

export function SheetHost({ children, height, headerHeight, interceptClose, confirmClose, onClose }: {
  children: ReactNode;
  height: SheetHostHeight;
  headerHeight: number;
  interceptClose?(): boolean;
  confirmClose(): boolean | Promise<boolean>;
  onClose(action?: () => void): boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const { top, bottom } = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  const [offset] = useState(() => new Animated.Value(0));
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [reduceMotion, setReduceMotion] = useState<boolean>();
  const [exitPending, setExitPending] = useState(false);
  const hasOpened = useRef(false);
  const closePending = useRef(false);
  const exitAttempt = useRef(0);
  const active = useRef(true);
  const contentHeight = height.mode === "content" && height.measuredHeight !== undefined
    ? height.measuredHeight + bottom
    : undefined;
  const measuring = height.mode === "content" && contentHeight === undefined;

  useEffect(() => {
    active.current = true;
    let changed = false;
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", value => {
      changed = true;
      setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(
      value => { if (active.current && !changed) setReduceMotion(value); },
      () => { if (active.current && !changed) setReduceMotion(false); },
    );
    return () => {
      active.current = false;
      listener.remove();
    };
  }, []);

  useEffect(() => {
    if (measuring || layoutHeight === 0 || reduceMotion === undefined || hasOpened.current) return;
    hasOpened.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? 0 : 270,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [layoutHeight, measuring, progress, reduceMotion]);

  const settle = useCallback(() => {
    if (reduceMotion) offset.setValue(0);
    else Animated.spring(offset, { toValue: 0, useNativeDriver: true, overshootClamping: true }).start();
  }, [offset, reduceMotion]);

  const requestCloseWithAction = useCallback(async (action?: () => void) => {
    if (!hasOpened.current || closePending.current) return;
    if (interceptClose?.()) {
      settle();
      return;
    }
    exitAttempt.current += 1;
    closePending.current = true;
    setExitPending(true);
    const approval = confirmClose();
    if (typeof approval !== "boolean") settle();
    const allowed = await approval;
    if (!active.current) return;
    if (!allowed) {
      closePending.current = false;
      setExitPending(false);
      settle();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: reduceMotion ? 0 : 220,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!active.current || (finished && onClose(action))) return;
      progress.setValue(1);
      offset.setValue(0);
      closePending.current = false;
      setExitPending(false);
    });
  }, [confirmClose, interceptClose, offset, onClose, progress, reduceMotion, settle]);
  const requestClose = useCallback(() => { void requestCloseWithAction(); }, [requestCloseWithAction]);

  useEffect(() => () => {
    progress.stopAnimation();
    offset.stopAnimation();
  }, [offset, progress]);

  const drag = useMemo<SheetDrag>(() => ({
    start: () => offset.stopAnimation(),
    move: distance => offset.setValue(distance),
    release: dismiss => {
      if (dismiss) void requestClose();
      else settle();
    },
  }), [offset, requestClose, settle]);
  const isExitPending = useCallback(() => closePending.current, []);
  const getExitAttempt = useCallback(() => exitAttempt.current, []);

  const translateY = useMemo(() => Animated.add(
    progress.interpolate({ inputRange: [0, 1], outputRange: [layoutHeight, 0] }),
    offset,
  ), [layoutHeight, offset, progress]);

  return (
    <View style={styles.viewport}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]} />
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        onPress={requestClose}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        pointerEvents="box-none"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <View pointerEvents="box-none" style={[styles.placement, { marginTop: top + visual.space.card }]}>
          <Animated.View
            onLayout={event => setLayoutHeight(event.nativeEvent.layout.height)}
            pointerEvents={measuring || exitPending ? "none" : "auto"}
            style={[
              styles.sheet,
              contentHeight === undefined ? styles.fill : [styles.content, { height: contentHeight }],
              (measuring || layoutHeight === 0) && styles.measuring,
              { transform: [{ translateY }] },
            ]}
          >
            <SafeAreaView
              accessibilityElementsHidden={measuring}
              accessibilityViewIsModal
              onAccessibilityEscape={requestClose}
              edges={["left", "right", "bottom"]}
              style={styles.safeContent}
            >
              <SheetMotionContext.Provider value={{ requestClose, requestCloseWithAction, drag, exitPending, isExitPending, getExitAttempt, mode: height.mode }}>
                {children}
              </SheetMotionContext.Provider>
            </SafeAreaView>
            <SheetCaptionDrag drag={drag} height={headerHeight} />
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function SheetCaptionDrag({ drag, height }: { drag: SheetDrag; height: number }) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const handlers = useMemo(() => createSheetDrag(drag), [drag]);
  const leadingToolbarSpace = Platform.OS === "ios" && Platform.isPad ? 128 : 64;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...handlers}
      // iPad window controls can shift the native leading button toward the title.
      style={[styles.captionTarget, {
        height,
        left: insets.left + leadingToolbarSpace,
        right: insets.right + 64,
      }]}
    />
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    viewport: { flex: 1, overflow: "hidden" },
    backdrop: {
      experimental_backgroundImage: `linear-gradient(180deg, ${colors.transparent} 0%, ${colors.overlay} 100%)`,
    },
    keyboard: { flex: 1 },
    placement: { flex: 1, justifyContent: "flex-end" },
    fill: { flex: 1 },
    content: { minHeight: "40%" },
    measuring: { opacity: 0 },
    safeContent: { flex: 1 },
    captionTarget: { position: "absolute", top: 0, zIndex: 2 },
    sheet: {
      maxHeight: "100%",
      flexShrink: 1,
      backgroundColor: colors.surface,
      borderTopLeftRadius: visual.radius.sheet,
      borderTopRightRadius: visual.radius.sheet,
      overflow: "hidden",
    },
  });

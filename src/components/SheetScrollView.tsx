import { useMemo, useState, type Ref } from "react";
import { ScrollView, StyleSheet, View, type ScrollViewProps } from "react-native";
import { useSheetMotion, useSheetScrollDismissal, useShortSheetBodyDrag } from "./SheetHost";
import { createSheetBackSwipe } from "./sheetDrag";

export function SheetScrollView({
  onScroll, onScrollBeginDrag, onScrollEndDrag, onSwipeRight, onLayout, onContentSizeChange,
  scrollEnabled, ref, ...props
}: ScrollViewProps & { onSwipeRight?: () => void; ref?: Ref<ScrollView> }) {
  const bodyDrag = useShortSheetBodyDrag();
  const [viewportHeight, setViewportHeight] = useState<number>();
  const [contentHeight, setContentHeight] = useState<number>();
  const shortBody = Boolean(bodyDrag) && !props.automaticallyAdjustKeyboardInsets &&
    viewportHeight !== undefined && viewportHeight > 0 &&
    contentHeight !== undefined && contentHeight <= viewportHeight;
  const dismissal = useSheetScrollDismissal(!shortBody);

  return (
    <View style={styles.body} {...(shortBody ? bodyDrag : undefined)}>
      <ScrollView
        ref={ref}
        {...props}
        {...dismissal}
        scrollEnabled={shortBody ? false : scrollEnabled}
        onLayout={event => {
          setViewportHeight(event.nativeEvent.layout.height);
          onLayout?.(event);
        }}
        onContentSizeChange={(width, height) => {
          setContentHeight(height);
          onContentSizeChange?.(width, height);
        }}
        onScrollBeginDrag={event => {
          dismissal.onScrollBeginDrag?.(event);
          onScrollBeginDrag?.(event);
        }}
        onScroll={event => {
          dismissal.onScroll?.(event);
          onScroll?.(event);
        }}
        onScrollEndDrag={event => {
          dismissal.onScrollEndDrag?.(event);
          onScrollEndDrag?.(event);
        }}
      />
      {onSwipeRight ? <SheetBackSwipeEdge onBack={onSwipeRight} /> : null}
    </View>
  );
}

export function SheetBackSwipeEdge({ onBack }: { onBack(): void }) {
  const { isExitPending } = useSheetMotion();
  const handlers = useMemo(
    () => createSheetBackSwipe(() => {
      if (!isExitPending()) onBack();
    }),
    [isExitPending, onBack],
  );
  return (
    <View
      {...handlers}
      collapsable={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.backEdge}
    />
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  backEdge: { position: "absolute", top: 0, bottom: 0, left: 0, width: 20 },
});

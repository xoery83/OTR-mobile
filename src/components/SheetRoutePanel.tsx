import { useEffect, type ComponentProps, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { SheetNavigationHeader, useSheetContentSize } from "./SheetNavigationHeader";
import { SheetBackSwipeEdge, SheetScrollView } from "./SheetScrollView";
import { useSheetMotion } from "./SheetHost";
import { useSheetRouteLayout } from "./sheetRouteContext";

export function SheetRoutePanel({
  title, onBack, leadingDisabled, action, ownsScroll = false, keyboardInsets = false, preferNativeScroll, children, overlay,
}: {
  title: string;
  onBack?: () => void;
  leadingDisabled?: boolean;
  action?: ComponentProps<typeof SheetNavigationHeader>["action"];
  ownsScroll?: boolean;
  keyboardInsets?: boolean;
  preferNativeScroll?: boolean;
  children: ReactNode;
  overlay?: ReactNode;
}) {
  const { requestClose } = useSheetMotion();
  const { reportContentHeight, reportHeaderHeight } = useSheetRouteLayout();
  const onContentSizeChange = useSheetContentSize(reportContentHeight, reportHeaderHeight);
  const { height } = useWindowDimensions();
  useEffect(() => {
    if (ownsScroll) onContentSizeChange(0, height);
  }, [height, ownsScroll, onContentSizeChange]);
  const swipeBack = leadingDisabled ? undefined : onBack;
  return (
    <>
      <SheetNavigationHeader
        title={title}
        level={onBack ? "child" : "root"}
        onLeadingAction={onBack ?? requestClose}
        leadingDisabled={leadingDisabled}
        action={action}
        nativeBackGesture={false}
      />
      {ownsScroll ? (
        <View style={styles.panel}>
          {children}
          {swipeBack ? <SheetBackSwipeEdge onBack={swipeBack} /> : null}
        </View>
      ) : (
        <SheetScrollView
          automaticallyAdjustKeyboardInsets={keyboardInsets}
          preferNativeScroll={preferNativeScroll}
          onSwipeRight={swipeBack}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={onContentSizeChange}
          contentContainerStyle={styles.readingColumn}
        >
          {children}
        </SheetScrollView>
      )}
      {overlay}
    </>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
  readingColumn: { alignSelf: "center", maxWidth: 680, width: "100%" },
});

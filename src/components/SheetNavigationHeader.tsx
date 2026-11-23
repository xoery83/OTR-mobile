import { Stack } from "expo-router";
import { useHeaderHeight, useIsFocused } from "expo-router/react-navigation";
import { useCallback, useLayoutEffect, useState, type ComponentProps } from "react";
import { useSheetMotion } from "./SheetHost";
import { t } from "@/ui/locale";

export function SheetNavigationHeader({ title, level, onLeadingAction, leadingDisabled, action, nativeBackGesture = true }: {
  title: string;
  level: "root" | "child";
  onLeadingAction(): void;
  leadingDisabled?: boolean;
  nativeBackGesture?: boolean;
  action?: { label: string; icon?: ComponentProps<typeof Stack.Toolbar.Button>["icon"]; onPress(): void; disabled?: boolean };
}) {
  const { exitPending } = useSheetMotion();
  const canSwipeBack = level === "child" && nativeBackGesture && !exitPending && !leadingDisabled;
  return (
    <>
      <Stack.Screen options={{ title, gestureEnabled: canSwipeBack, fullScreenGestureEnabled: canSwipeBack }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon={level === "root" ? "xmark" : "chevron.left"}
          accessibilityLabel={t(level === "root" ? "common.close" : "common.back")}
          onPress={onLeadingAction}
          disabled={exitPending || leadingDisabled}
        />
      </Stack.Toolbar>
      {action ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon={action.icon ?? "checkmark"}
            accessibilityLabel={action.label}
            onPress={action.onPress}
            disabled={exitPending || action.disabled}
          />
        </Stack.Toolbar>
      ) : null}
    </>
  );
}

export function useSheetContentSize(
  reportHeight: (height: number) => void,
  reportHeaderHeight: (height: number) => void,
) {
  const headerHeight = useHeaderHeight();
  const focused = useIsFocused();
  const [contentHeight, setContentHeight] = useState<number>();
  useLayoutEffect(() => {
    if (!focused) return;
    reportHeaderHeight(headerHeight);
    if (contentHeight !== undefined) reportHeight(headerHeight + contentHeight);
  }, [focused, contentHeight, headerHeight, reportHeight, reportHeaderHeight]);
  return useCallback((_width: number, height: number) => setContentHeight(height), []);
}

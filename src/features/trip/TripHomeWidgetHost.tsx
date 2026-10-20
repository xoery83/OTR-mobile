import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { UiText } from "@/ui/controls";
import { UiChoiceChip } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

export type TripHomeWidget = Readonly<{ id: string; title: string; content: ReactNode }>;
// Caller supplies only separately approved, currently qualified pages.
export function TripHomeWidgetHost({ widgets }: { widgets: readonly TripHomeWidget[] }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const [selectedId, setSelectedId] = useState<string | null>(widgets[0]?.id ?? null);
  const [width, setWidth] = useState(0);
  const [sizes, setSizes] = useState<
    Record<string, { width: number; fontScale: number; height: number }>
  >({});
  const scroll = useRef<ScrollView>(null);
  const index = Math.max(
    0,
    widgets.findIndex((widget) => widget.id === selectedId),
  );
  const currentId = widgets[index]?.id ?? null;
  if (selectedId !== currentId) setSelectedId(currentId);
  useEffect(() => {
    if (width) scroll.current?.scrollTo({ x: index * width, animated: false });
  }, [index, width]);
  if (!widgets.length)
    return <UiText style={styles.fallback}>{t("tripHome.noQualifiedWork")}</UiText>;
  if (widgets.length === 1) return <View style={styles.page}>{widgets[0].content}</View>;
  const measured = currentId ? sizes[currentId] : undefined;
  const pageHeight =
    measured?.width === width && measured.fontScale === fontScale
      ? measured.height
      : undefined;
  return (
    <View style={styles.host}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tags}
      >
        {widgets.map((widget) => (
          <UiChoiceChip
            compact
            key={widget.id}
            label={widget.title}
            selected={widget.id === currentId}
            onPress={() => {
              setSelectedId(widget.id);
            }}
          />
        ))}
      </ScrollView>
      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        style={[styles.pager, pageHeight !== undefined && { height: pageHeight }]}
        contentContainerStyle={styles.pages}
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onMomentumScrollEnd={(event) => {
          if (!width) return;
          const at = Math.max(
            0,
            Math.min(
              widgets.length - 1,
              Math.round(event.nativeEvent.contentOffset.x / width),
            ),
          );
          setSelectedId(widgets[at].id);
        }}
      >
        {widgets.map((widget) => (
          <View
            key={widget.id}
            accessibilityElementsHidden={widget.id !== currentId}
            importantForAccessibility={
              widget.id === currentId ? "auto" : "no-hide-descendants"
            }
            style={[styles.page, { width }]}
            onLayout={(event) => {
              if (!width) return;
              const height = Math.ceil(event.nativeEvent.layout.height);
              setSizes((previous) =>
                previous[widget.id]?.width === width &&
                previous[widget.id]?.fontScale === fontScale &&
                previous[widget.id]?.height === height
                  ? previous
                  : { ...previous, [widget.id]: { width, fontScale, height } },
              );
            }}
          >
            {widget.content}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    host: { gap: visual.space.card },
    tags: { gap: visual.space.heading, alignItems: "center" },
    pager: { flexGrow: 0 },
    pages: { alignItems: "flex-start" },
    page: {
      padding: visual.space.page,
      backgroundColor: colors.surface,
      borderRadius: visual.radius.hero,
    },
    fallback: { ...visual.type.row, color: colors.textSecondary },
  });

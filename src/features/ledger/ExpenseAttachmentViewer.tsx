import { useEffect, useRef, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export type AttachmentImage = { id: string; localUri: string };
export function ExpenseAttachmentViewer({
  images,
  selectedId,
  onSelect,
  onClose,
}: {
  images: AttachmentImage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const index = images.findIndex((item) => item.id === selectedId);
  const selected = images[index];
  const touch = useRef({ x: 0, y: 0, zoom: 1, multiple: false });
  useEffect(() => {
    touch.current.zoom = 1;
    touch.current.multiple = false;
  }, [selectedId]);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  return (
    <Modal
      animationType="fade"
      presentationStyle="fullScreen"
      visible={Boolean(selected)}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Close attachment preview"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.text}>Close</Text>
          </Pressable>
          <Text style={styles.text}>
            {index + 1} of {images.length}
          </Text>
        </View>
        <View
          style={styles.body}
          onLayout={(event) => setFrame(event.nativeEvent.layout)}
        >
          {selected ? (
            <ScrollView
              key={selected.id}
              minimumZoomScale={1}
              maximumZoomScale={5}
              bouncesZoom
              centerContent
              pinchGestureEnabled={Platform.OS === "ios"}
              contentContainerStyle={{ width: frame.width, height: frame.height }}
              onScroll={(event) => {
                touch.current.zoom = event.nativeEvent.zoomScale ?? 1;
              }}
              scrollEventThrottle={16}
              onTouchStart={(event) => {
                touch.current = {
                  ...touch.current,
                  x: event.nativeEvent.pageX,
                  y: event.nativeEvent.pageY,
                  multiple: event.nativeEvent.touches.length > 1,
                };
              }}
              onTouchMove={(event) => {
                if (event.nativeEvent.touches.length > 1) touch.current.multiple = true;
              }}
              onTouchEnd={(event) => {
                if (touch.current.multiple || touch.current.zoom > 1.01) return;
                const dx = event.nativeEvent.pageX - touch.current.x;
                const dy = event.nativeEvent.pageY - touch.current.y;
                if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
                  const next = images[index + (dx < 0 ? 1 : -1)];
                  if (next) onSelect(next.id);
                }
              }}
            >
              <Image
                accessible
                accessibilityLabel="Receipt image. Pinch to zoom and drag to inspect."
                resizeMode="contain"
                source={{ uri: selected.localUri }}
                style={{ width: frame.width, height: frame.height }}
              />
            </ScrollView>
          ) : null}
        </View>
        {images.length > 1 ? (
          <View style={styles.navigation}>
            <Pressable
              accessibilityRole="button"
              disabled={index <= 0}
              onPress={() => onSelect(images[index - 1].id)}
              style={styles.close}
            >
              <Text style={[styles.text, index <= 0 && styles.disabled]}>Previous</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={index >= images.length - 1}
              onPress={() => onSelect(images[index + 1].id)}
              style={styles.close}
            >
              <Text style={[styles.text, index >= images.length - 1 && styles.disabled]}>
                Next
              </Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: { backgroundColor: "#111827", flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  close: { minHeight: 44, minWidth: 64, justifyContent: "center" },
  text: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  body: { flex: 1 },
  navigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  disabled: { color: "#64748B" },
});

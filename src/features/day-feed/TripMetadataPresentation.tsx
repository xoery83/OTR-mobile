import { router } from "expo-router";
import { useLayoutEffect, useRef } from "react";
import { Modal, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  hostedTripMetadataEnabled, openTripMetadataSheet, readTripMetadataSheet, releaseTripMetadataSheet, updateTripMetadataSheet, type MetadataEditorElement,
} from "./tripMetadataSheet";

export function TripMetadataPresentation({ generation, tripId, requestClose, swipeEnabled, style, children }: {
  generation: number;
  tripId: string;
  requestClose(): void;
  swipeEnabled: boolean;
  style: StyleProp<ViewStyle>;
  children: MetadataEditorElement | null;
}) {
  const invocation = useRef<string | undefined>(undefined);
  useLayoutEffect(() => () => {
    releaseTripMetadataSheet(invocation.current);
    invocation.current = undefined;
  }, [generation, tripId]);

  useLayoutEffect(() => {
    if (!hostedTripMetadataEnabled) return;
    const current = readTripMetadataSheet(invocation.current);
    const value = { editor: children, requestClose };
    if (current) updateTripMetadataSheet(invocation.current, value);
    else if (children) {
      const id = openTripMetadataSheet(generation, value);
      if (!id) return;
      invocation.current = id;
      router.push({ pathname: "/trip-metadata-sheet", params: { invocation: id } });
    }
  });

  if (hostedTripMetadataEnabled) return null;
  return (
    <Modal
      visible={!!children}
      presentationStyle="pageSheet"
      allowSwipeDismissal={swipeEnabled}
      onRequestClose={requestClose}
      animationType="slide"
    >
      <SafeAreaProvider style={style}>{children}</SafeAreaProvider>
    </Modal>
  );
}

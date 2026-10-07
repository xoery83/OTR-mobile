import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { CapturePicker, CaptureSelection } from "@/features/capture/captureStaging";

// Only metadata is retained. No byte read/hash, cache copy, upload or classification.
export const pickCaptureMaterial: CapturePicker = async (source) => {
  if (source === "files") {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: false,
      base64: false,
    });
    return result.canceled
      ? []
      : result.assets.map(
          (item) =>
            ({
              source,
              temporaryUri: item.uri || null,
              name: item.name || null,
              typeHint: item.mimeType ?? null,
              size: item.size,
            }) satisfies CaptureSelection,
        );
  }
  // System Photos picker needs no broad library permission for image selection.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    orderedSelection: true,
    quality: 1,
    base64: false,
    exif: false,
  });
  return result.canceled
    ? []
    : result.assets.map(
        (item) =>
          ({
            source,
            temporaryUri: item.uri || null,
            name: item.fileName ?? null,
            typeHint: item.mimeType ?? null,
            size: item.fileSize,
            width: item.width,
            height: item.height,
          }) satisfies CaptureSelection,
      );
};

import { requireNativeView, requireOptionalNativeModule } from "expo";
import { useLayoutEffect, useRef, type ComponentType } from "react";
import { Platform, type NativeSyntheticEvent, type ViewProps } from "react-native";
import {
  createImagePasteDeliveryGate,
  type ImagePasteFailure,
  type ImagePastePayload,
} from "./imagePasteContract";
export type {
  ImagePasteItem,
  ImagePastePayload,
  ImagePasteFailure,
} from "./imagePasteContract";

type NativePaste = { release(tokens: string[]): Promise<void> };
function module(): NativePaste | null {
  if (Platform.OS !== "ios") return null;
  try {
    return requireOptionalNativeModule<NativePaste>("OTRImagePaste");
  } catch {
    return null;
  }
}
export function isImagePasteAvailable(): boolean {
  return typeof module()?.release === "function";
}
export async function releaseImagePasteTokens(tokens: readonly string[]): Promise<void> {
  const native = module();
  for (let i = 0; i < tokens.length; i += 10)
    await native?.release(tokens.slice(i, i + 10));
}
// Staging cleanup is synchronous; native cleanup is best-effort and never blocks removal.
export function releaseImagePaste(tokens: readonly string[]): void {
  void releaseImagePasteTokens(tokens).catch(() => {});
}
export type ImagePasteControlProps = ViewProps & {
  requestId: string;
  enabled: boolean;
  onImages(payload: ImagePastePayload): void;
  onFailure(payload: ImagePasteFailure): void;
};
type NativeProps = ViewProps & {
  requestId: string;
  enabled: boolean;
  onImages(event: NativeSyntheticEvent<unknown>): void;
  onFailure(event: NativeSyntheticEvent<unknown>): void;
};
let NativeControl: ComponentType<NativeProps> | null = null;
export function ImagePasteControl(props: ImagePasteControlProps) {
  const current = useRef({ props, mounted: true });
  useLayoutEffect(() => {
    current.current = { props, mounted: true };
  });
  const gate = useRef<ReturnType<typeof createImagePasteDeliveryGate> | null>(null);
  useLayoutEffect(() => {
    gate.current = createImagePasteDeliveryGate({
      current: (id) =>
        current.current.mounted &&
        current.current.props.enabled &&
        current.current.props.requestId === id,
      release: releaseImagePaste,
      images: (payload) => current.current.props.onImages(payload),
      failure: (payload) => current.current.props.onFailure(payload),
    });
    return () => {
      current.current.mounted = false;
    };
  }, []);
  if (!isImagePasteAvailable()) return null;
  NativeControl ??= requireNativeView<NativeProps>("OTRImagePaste");
  const {
    requestId,
    enabled,
    onImages: _images,
    onFailure: _failure,
    ...viewProps
  } = props;
  return (
    <NativeControl
      {...viewProps}
      requestId={requestId}
      enabled={enabled}
      onImages={(event) => gate.current?.images(event.nativeEvent)}
      onFailure={(event) => gate.current?.failure(event.nativeEvent)}
    />
  );
}

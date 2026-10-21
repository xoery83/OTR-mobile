import { requireNativeModule } from "expo";
import { Platform } from "react-native";
import type { DictationNative } from "@/features/capture/localDictation";

export function readLocalDictation(): DictationNative {
  if (Platform.OS !== "ios")
    throw Object.assign(new Error("Local dictation unavailable"), {
      code: "unavailable",
    });
  return requireNativeModule<DictationNative>("OTRLocalDictation");
}

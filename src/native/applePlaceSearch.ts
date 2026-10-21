import { requireNativeModule } from "expo";
import type { ApplePlaceNative } from "@/data/places/applePlaceProvider";

// Match the existing native adapters; keep this dependency out of pure Place logic.
export function readApplePlaceNativeModule() {
  return requireNativeModule<ApplePlaceNative>("OTRPlaceSearch");
}

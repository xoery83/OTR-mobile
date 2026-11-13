import * as SecureStore from "expo-secure-store";
import { setUiLocale, type UiLocale } from "@/ui/locale";
const key = "otr-ui-locale-v1";
let generation = 0;
let writes = Promise.resolve();
export async function hydrateUiLocale() {
  if (generation !== 0) return;
  const version = generation;
  const value = await SecureStore.getItemAsync(key);
  if (generation === version && (value === "en" || value === "zh-Hans"))
    setUiLocale(value);
}
export function chooseUiLocale(value: UiLocale) {
  ++generation;
  const write = writes
    .catch(() => undefined)
    .then(async () => {
      await SecureStore.setItemAsync(key, value);
      setUiLocale(value);
    });
  writes = write;
  return write;
}

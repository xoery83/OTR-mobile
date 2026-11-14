import * as SecureStore from "expo-secure-store";
import { Appearance } from "react-native";

export type UiAppearancePreference = "system" | "light" | "dark";
const key = "otr-ui-appearance-v1";
let preference: UiAppearancePreference = "system";
let generation = 0;
let writes = Promise.resolve();
const listeners = new Set<() => void>();
const valid = (value: unknown): value is UiAppearancePreference =>
  value === "system" || value === "light" || value === "dark";
function apply(value: UiAppearancePreference) {
  Appearance.setColorScheme(value === "system" ? "unspecified" : value);
  preference = value;
  for (const listener of listeners) listener();
}
// Device-local like UI language; never Account-private or cloud-synchronized.
export const getUiAppearancePreference = () => preference;
export function subscribeUiAppearancePreference(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export async function hydrateUiAppearance() {
  if (generation !== 0) return;
  const version = generation;
  const value = await SecureStore.getItemAsync(key);
  if (generation === version && valid(value)) apply(value);
}
export function chooseUiAppearance(value: UiAppearancePreference) {
  if (!valid(value)) throw Error("INVALID_UI_APPEARANCE");
  ++generation;
  const write = writes
    .catch(() => undefined)
    .then(async () => {
      await SecureStore.setItemAsync(key, value);
      apply(value);
    });
  writes = write;
  return write;
}

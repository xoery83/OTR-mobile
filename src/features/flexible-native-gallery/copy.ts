import { getUiLocale } from "@/ui/locale";
import { en, zhHans } from "../../../fixtures/flexible-native/src/ui/catalogs";
export function t(key: keyof typeof en, params: Record<string, string | number> = {}) {
  const text = (getUiLocale() === "zh-Hans" ? zhHans : en)[key];
  return text.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (params[name] === undefined) throw new Error(`Missing fixture parameter: ${name}`);
    return String(params[name]);
  });
}

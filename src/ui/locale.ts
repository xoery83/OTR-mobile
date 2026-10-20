import { catalogs, type MessageKey, type UiLocale } from "./catalogs";
export { type MessageKey, type UiLocale } from "./catalogs";
export function resolveUiLocale(value: string): UiLocale {
  return /^zh(?:-(?:Hans|CN|SG))?(?:-|$)/i.test(value) &&
    !/^zh-(?:Hant|TW|HK|MO)(?:-|$)/i.test(value)
    ? "zh-Hans"
    : "en";
}
let locale = resolveUiLocale(Intl.DateTimeFormat().resolvedOptions().locale);
const listeners = new Set<() => void>();
export const getUiLocale = () => locale;
export const subscribeUiLocale = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function setUiLocale(value: UiLocale) {
  // ui-foundation-exception: string -- programmer-only validation failure for unsupported locale; never rendered as UI
  if (value !== "en" && value !== "zh-Hans") throw new Error("Unsupported UI locale");
  if (value === locale) return;
  locale = value;
  for (const listener of listeners) listener();
}
export function translate(
  key: MessageKey,
  params: Record<string, string | number> = {},
  language: UiLocale = locale,
): string {
  const message = catalogs[language]?.[key] ?? catalogs.en[key];
  return message.replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (params[name] === undefined)
      throw new Error(`Missing UI message parameter: ${name}`);
    return String(params[name]);
  });
}
export const t = translate;
// Formatting follows the selected UI language; English preserves the device's regional conventions.
export function getFormatLocale(): string {
  const device = Intl.DateTimeFormat().resolvedOptions().locale;
  return locale === "zh-Hans" ? "zh-Hans" : /^en(?:-|$)/i.test(device) ? device : "en";
}
export const formatUiDate = (
  value: Date,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  },
) => new Intl.DateTimeFormat(getFormatLocale(), options).format(value);
export const formatUiTime = (value: Date) =>
  formatUiDate(value, { hour: "numeric", minute: "2-digit" });
export const formatUiNumber = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(getFormatLocale(), options).format(value);
export const formatUiPercent = (value: number) =>
  formatUiNumber(value, { style: "percent", maximumFractionDigits: 1 });

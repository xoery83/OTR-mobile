import { UiTextInput, UiDatePicker, UiChoiceChip, UiFormRow } from "./forms";
import { formatLedgerMoney } from "@/features/ledger/format";
import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import { UiFoundationFixture } from "./UiFoundationFixture";
import { UiButton } from "./controls";
import { getUiLocale, getFormatLocale, setUiLocale, t } from "./locale";
import { uiPalette } from "./palette";
const state = vi.hoisted(() => ({
  scheme: "light" as "light" | "dark",
  input: {} as Record<string, any>,
  picker: {} as Record<string, any>,
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup: (element: ReactNode) => string;
};
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const flatten = (value: unknown): Record<string, unknown> =>
    Array.isArray(value)
      ? Object.assign({}, ...value.filter(Boolean).map(flatten))
      : ((value as Record<string, unknown>) ?? {});
  const primitive = (tag: string) => (props: Record<string, any>) =>
    createElement(
      tag,
      {
        style: flatten(props.style),
        disabled: props.disabled,
        "aria-label": props.accessibilityLabel,
        "aria-disabled": props.accessibilityState?.disabled,
      },
      props.children,
    );
  return {
    TextInput: (props: Record<string, any>) => {
      state.input = props;
      return createElement("input", {
        style: flatten(props.style),
        disabled: props.editable === false,
        placeholder: props.placeholder,
        "aria-label": props.accessibilityLabel,
      });
    },
    Text: primitive("span"),
    View: primitive("div"),
    Pressable: primitive("button"),
    ActivityIndicator: primitive("span"),
    Modal: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? children : null,
    StyleSheet: { create: (value: unknown) => value, flatten },
    useColorScheme: () => state.scheme,
    useWindowDimensions: () => ({ width: 375, fontScale: 1 }),
  };
});
vi.mock("@react-native-community/datetimepicker", () => ({
  default: (props: Record<string, any>) => {
    state.picker = props;
    return null;
  },
}));
vi.mock("expo-router", async () => {
  const { createElement } = await import("react");
  const Button = ({ accessibilityLabel }: { accessibilityLabel: string }) =>
    createElement("button", { "aria-label": accessibilityLabel });
  return {
    Stack: {
      Toolbar: Object.assign(({ children }: { children: ReactNode }) => children, {
        Button,
      }),
    },
  };
});
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
  SafeAreaView: ({ children }: { children: ReactNode }) => children,
}));
const original = getUiLocale();
afterEach(() => {
  setUiLocale(original);
  state.scheme = "light";
});
it("renders the disposable fixture with the same semantic controls and complete money in both locales/appearances", () => {
  for (const scheme of ["light", "dark"] as const)
    for (const locale of ["en", "zh-Hans"] as const) {
      state.scheme = scheme;
      setUiLocale(locale);
      const html = renderToStaticMarkup(createElement(UiFoundationFixture));
      expect(html).toContain(t("fixture.title"));
      expect(html).toContain(t("fixture.description"));
      expect(html).toContain(t("fixture.disabled"));
      expect(html).toContain(`aria-label="${t("fixture.nativeAction")}"`);
      expect(html).toContain(`background-color:${uiPalette(scheme).surface}`);
      expect(html).toContain(`color:${uiPalette(scheme).textPrimary}`);
      expect(html).toContain('aria-disabled="true"');
      expect(html).toContain("min-height:44px");
      for (const [minor, currency, scale] of [
        [123456, "NZD", 2],
        [-12345, "JPY", 0],
        [12345, "KWD", 3],
      ] as const)
        expect(html).toContain(
          `aria-label="${formatLedgerMoney(minor, currency, scale)}"`,
        );
    }
});
it("makes disabled and destructive content actions explicit", () => {
  const disabled = renderToStaticMarkup(
    createElement(UiButton, {
      label: t("fixture.disabled"),
      disabled: true,
      onPress: () => {
        throw new Error("disabled action");
      },
    }),
  );
  expect(disabled).toContain('disabled=""');
  expect(disabled).toContain('aria-disabled="true"');
  const destructive = renderToStaticMarkup(
    createElement(UiButton, {
      label: t("fixture.destructive"),
      variant: "destructive",
      onPress: () => undefined,
    }),
  );
  expect(destructive).toContain(`color:${uiPalette("light").destructive}`);
});

it("propagates both appearances/locales through inputs, choices and the native spinner without replacing callbacks or values", () => {
  const date = new Date(2026, 9, 3);
  const onChange = vi.fn();
  const ref = { current: null };
  for (const scheme of ["light", "dark"] as const)
    for (const locale of ["en", "zh-Hans"] as const) {
      state.scheme = scheme;
      setUiLocale(locale);
      const colors = uiPalette(scheme);
      renderToStaticMarkup(
        createElement(UiTextInput, {
          ref,
          editable: false,
          style: { color: colors.textPrimary },
          placeholder: t("fixture.input"),
        }),
      );
      expect(state.input.ref).toBe(ref);
      expect(state.input.placeholderTextColor).toBe(colors.textSecondary);
      expect(state.input.selectionColor).toBe(colors.accent);
      expect(state.input.keyboardAppearance).toBe(scheme);
      expect(state.input.style.at(-1).color).toBe(colors.disabled);
      renderToStaticMarkup(
        createElement(UiDatePicker, {
          mode: "date",
          display: "spinner",
          value: date,
          onChange,
        }),
      );
      expect(state.picker.value).toBe(date);
      expect(state.picker.onChange).toBe(onChange);
      expect(state.picker.themeVariant).toBe(scheme);
      expect(state.picker.textColor).toBe(colors.textPrimary);
      expect(state.picker.locale).toBe(getFormatLocale());
      const html = renderToStaticMarkup(
        createElement(UiChoiceChip, {
          label: t("fixture.choice"),
          selected: true,
          onPress: () => undefined,
        }),
      );
      expect(html).toContain(t("fixture.choice"));
      expect(html).toContain(`background-color:${colors.accent}`);
      const row = renderToStaticMarkup(
        createElement(UiFormRow, {
          label: t("fixture.date"),
          value: "2026-10-03",
          onPress: () => undefined,
        }),
      );
      expect(row).toContain(`background-color:${colors.surface}`);
      expect(row).toContain(t("fixture.date"));
    }
});

import { useState } from "react";
import { StyleSheet, Text, useWindowDimensions, type TextProps } from "react-native";
import {
  contentVisual as cv,
  heroAmountSizes,
  nextHeroAmountStep,
} from "./contentVisual";
import { ledgerMoneyParts } from "./format";

export type MoneyVariant = "hero" | "headline" | "standard" | "compact";
export type MoneyTextProps = Omit<TextProps, "children"> & {
  minor: number | null;
  currency: string;
  scale: number;
  locale?: string | string[];
  variant?: MoneyVariant;
  signed?: boolean;
  prefix?: string;
  placeholder?: string;
};

const typography = {
  hero: { size: 44, weight: "800", fraction: 0.54, symbol: 0.7 },
  headline: { size: cv.type.metric.fontSize, weight: "700", fraction: 0.6, symbol: 0.75 },
  standard: {
    size: cv.type.rowAmount.fontSize,
    weight: "700",
    fraction: 0.75,
    symbol: 0.9,
  },
  compact: {
    size: cv.type.secondaryAmount.fontSize,
    weight: "400",
    fraction: 0.9,
    symbol: 1,
  },
} as const;

export function MoneyText(props: MoneyTextProps) {
  const { width, fontScale } = useWindowDimensions();
  return (
    <FittedMoneyText
      key={`${props.minor}:${props.currency}:${props.scale}:${props.locale}:${props.variant}:${width}:${fontScale}`}
      {...props}
    />
  );
}

function FittedMoneyText({
  minor,
  currency,
  scale,
  locale,
  variant = "standard",
  signed = false,
  prefix = "",
  placeholder = "—",
  style,
  onTextLayout,
  accessibilityLabel,
  ...props
}: MoneyTextProps) {
  const [step, setStep] = useState(0);
  const type = typography[variant];
  const size =
    (StyleSheet.flatten(style)?.fontSize ?? type.size) *
    (variant === "hero" ? heroAmountSizes[step] / heroAmountSizes[0] : 1);
  const parts = minor === null ? [] : ledgerMoneyParts(minor, currency, scale, locale);
  const leading = minor === null ? "" : `${prefix}${signed && minor > 0 ? "+" : ""}`;
  const value =
    minor === null ? placeholder : leading + parts.map((part) => part.value).join("");
  const fragment = (text: string, fontSize: number, key: string) => (
    <Text
      key={key}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ fontSize }}
    >
      {text}
    </Text>
  );
  return (
    <Text
      accessible
      accessibilityRole="text"
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      numberOfLines={1}
      {...(variant === "hero" ? { maxFontSizeMultiplier: 1.35 } : {})}
      {...props}
      accessibilityLabel={accessibilityLabel ?? value}
      onTextLayout={(event) => {
        if (variant === "hero") {
          const next = nextHeroAmountStep(step, event.nativeEvent.lines.length);
          if (next !== step) setStep(next);
        }
        onTextLayout?.(event);
      }}
      style={[
        {
          color: cv.color.text,
          fontWeight: type.weight,
          fontVariant: ["tabular-nums"],
          flexShrink: 1,
          minWidth: 0,
        },
        style,
        { fontSize: size },
      ]}
    >
      {minor === null ? (
        placeholder
      ) : (
        <>
          {leading ? fragment(leading, size * type.symbol, "prefix") : null}
          {parts.map((part, index) => {
            if (part.type === "fraction" && parts[index - 1]?.type === "decimal")
              return null;
            if (part.type === "decimal")
              return fragment(
                part.value +
                  (parts[index + 1]?.type === "fraction" ? parts[index + 1].value : ""),
                size * type.fraction,
                String(index),
              );
            return fragment(
              part.value,
              size *
                (part.type === "currency" ||
                part.type === "minusSign" ||
                part.type === "plusSign"
                  ? type.symbol
                  : part.type === "fraction"
                    ? type.fraction
                    : 1),
              String(index),
            );
          })}
        </>
      )}
    </Text>
  );
}

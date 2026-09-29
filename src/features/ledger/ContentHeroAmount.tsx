import { useState } from "react";
import { Text, useWindowDimensions, type TextProps } from "react-native";
import { heroAmountSizes, nextHeroAmountStep } from "./contentVisual";

export function ContentHeroAmount(props: TextProps & { value: string }) {
  const { width, fontScale } = useWindowDimensions();
  return <FittedHeroAmount key={`${props.value}:${width}:${fontScale}`} {...props} />;
}

function FittedHeroAmount({ value, style, ...props }: TextProps & { value: string }) {
  const [step, setStep] = useState(0);
  return (
    <Text
      {...props}
      onTextLayout={(event) => {
        const next = nextHeroAmountStep(step, event.nativeEvent.lines.length);
        if (next !== step) setStep(next);
      }}
      style={[
        {
          color: "#111827",
          fontSize: heroAmountSizes[step],
          fontWeight: "800",
          fontVariant: ["tabular-nums"],
          flexShrink: 1,
        },
        style,
      ]}
    >
      {value}
    </Text>
  );
}

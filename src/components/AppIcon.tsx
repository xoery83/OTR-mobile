import type { ColorValue } from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

export function AppIcon({
  name,
  color,
  size = 20,
}: {
  name: SymbolViewProps["name"];
  color: ColorValue;
  size?: number;
}) {
  return <SymbolView name={name} size={size} tintColor={color} weight="semibold" />;
}

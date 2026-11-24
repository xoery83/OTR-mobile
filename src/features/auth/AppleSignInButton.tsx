/* eslint-disable @typescript-eslint/no-require-imports -- older QA binaries lack this native module */
import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { loadNativeApple } from "@/data/auth/appleSignIn";
import { useUiAppearance } from "@/ui/theme";
import { visual } from "@/ui/visual";

export function AppleSignInButton({
  disabled,
  height = 48,
  pill = false,
  onPress,
}: {
  disabled: boolean;
  height?: number;
  pill?: boolean;
  onPress(): void;
}) {
  const appearance = useUiAppearance();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    void loadNativeApple()
      ?.isAvailableAsync()
      .then((value) => {
        if (active) setAvailable(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (!available) return null;
  const sdk =
    require("expo-apple-authentication") as typeof import("expo-apple-authentication");
  return (
    <View pointerEvents={disabled ? "none" : "auto"} accessibilityState={{ disabled }}>
      <sdk.AppleAuthenticationButton
        buttonType={sdk.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          appearance === "dark" && !pill
            ? sdk.AppleAuthenticationButtonStyle.WHITE
            : sdk.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={pill ? height / 2 : visual.radius.control}
        style={[styles.button, { height }]}
        onPress={() => {
          if (!disabled) onPress();
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({ button: { width: "100%" } });

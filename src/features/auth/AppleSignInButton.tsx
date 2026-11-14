/* eslint-disable @typescript-eslint/no-require-imports -- older QA binaries lack this native module */
import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { loadNativeApple } from "@/data/auth/appleSignIn";
import { useUiAppearance } from "@/ui/theme";
import { visual } from "@/ui/visual";

export function AppleSignInButton({
  disabled,
  onPress,
}: {
  disabled: boolean;
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
          appearance === "dark"
            ? sdk.AppleAuthenticationButtonStyle.WHITE
            : sdk.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={visual.radius.control}
        style={styles.button}
        onPress={() => {
          if (!disabled) onPress();
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({ button: { height: 48, width: "100%" } });

/* eslint-disable @typescript-eslint/no-require-imports -- native SDK must load only after checking binary capability */
import { Image, Platform, Pressable, StyleSheet, TurboModuleRegistry } from "react-native";
import { UiButton, UiText } from "@/ui/controls";
import { googleSignInPalette } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { t } from "@/ui/locale";

export function GoogleSignInButton({
  disabled,
  onPress,
}: {
  disabled: boolean;
  onPress(): void;
}) {
  if (Platform.OS !== "ios" || !TurboModuleRegistry.get("RNGoogleSignin"))
    return (
      <UiButton
        label={t("auth.continueGoogle")}
        variant="secondary"
        disabled={disabled}
        onPress={onPress}
      />
    );
  const { GoogleSigninButton } =
    require("@react-native-google-signin/google-signin") as typeof import("@react-native-google-signin/google-signin");
  // Use Google's native branded/localized control and its automatic system appearance.
  return (
    <GoogleSigninButton
      accessibilityLabel={t("auth.continueGoogle")}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
    />
  );
}

export function GoogleSignInPill({
  disabled,
  minHeight,
  onPress,
}: {
  disabled: boolean;
  minHeight: number;
  onPress(): void;
}) {
  const label = t("auth.continueGoogle");
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { minHeight },
        (pressed || disabled) && styles.muted,
      ]}
    >
      <Image
        accessible={false}
        resizeMode="contain"
        source={require("../../../assets/google-sign-in-mark.png")}
        style={styles.mark}
      />
      <UiText style={styles.label}>{label}</UiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: visual.space.page,
    paddingVertical: visual.space.row,
    gap: visual.space.heading,
    borderRadius: visual.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: googleSignInPalette.border,
    backgroundColor: googleSignInPalette.background,
  },
  mark: {
    width: 15,
    height: 15,
    borderRadius: visual.radius.pill,
    backgroundColor: googleSignInPalette.markBackground,
  },
  label: {
    ...visual.type.row,
    // Match the iOS Apple sign-in control at the 52 pt sheet row height.
    fontSize: 20,
    flexShrink: 1,
    textAlign: "center",
    color: googleSignInPalette.text,
  },
  muted: { opacity: 0.65 },
});

/* eslint-disable @typescript-eslint/no-require-imports -- native SDK must load only after checking binary capability */
import { Platform, TurboModuleRegistry } from "react-native";
import { UiButton } from "@/ui/controls";
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

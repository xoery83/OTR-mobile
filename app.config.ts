import type { ConfigContext, ExpoConfig } from "expo/config";

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const appleConfig = {
    ...config,
    ios: { ...config.ios, usesAppleSignIn: true },
    plugins: [
      ...(config.plugins ?? []).filter(
        (plugin) =>
          (Array.isArray(plugin) ? plugin[0] : plugin) !== "expo-apple-authentication",
      ),
      "expo-apple-authentication",
    ],
  };
  if (process.env.OTR_IOS_VARIANT !== "production") return appleConfig as ExpoConfig;

  return {
    ...appleConfig,
    ios: {
      ...appleConfig.ios,
      bundleIdentifier: "art.xoery.otr",
      appleTeamId: "3K49Z2Q5X7",
      usesAppleSignIn: true,
    },
    plugins: [
      ...(appleConfig.plugins ?? []).filter(
        (plugin) =>
          (Array.isArray(plugin) ? plugin[0] : plugin) !==
          "@react-native-google-signin/google-signin",
      ),
    ],
  } as ExpoConfig;
}

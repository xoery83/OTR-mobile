import type { ConfigContext, ExpoConfig } from "expo/config";

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  if (process.env.OTR_IOS_VARIANT !== "production") return config as ExpoConfig;

  return {
    ...config,
    ios: {
      ...config.ios,
      bundleIdentifier: "art.xoery.otr",
      appleTeamId: "3K49Z2Q5X7",
      usesAppleSignIn: true,
    },
    plugins: [
      ...(config.plugins ?? []).filter(
        (plugin) =>
          (Array.isArray(plugin) ? plugin[0] : plugin) !==
          "@react-native-google-signin/google-signin",
      ),
      "expo-apple-authentication",
    ],
  } as ExpoConfig;
}

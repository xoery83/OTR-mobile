import { router } from "expo-router";
import { AccountPrivateProfilePage } from "@/features/auth/AccountPrivateProfilePage";

export default function ProfileRoute() {
  return (
    <AccountPrivateProfilePage
      onSignIn={() => router.push("/foundation")}
      onSaved={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/settings");
      }}
    />
  );
}

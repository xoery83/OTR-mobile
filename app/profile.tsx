import { router } from "expo-router";
import { AccountPrivateProfilePage } from "@/features/auth/AccountPrivateProfilePage";

export default function ProfileRoute() {
  return <AccountPrivateProfilePage onCancel={() => router.back()} />;
}

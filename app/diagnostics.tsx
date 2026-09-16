import { FoundationDiagnosticsScreen } from "@/components/FoundationDiagnosticsScreen";

export default function DiagnosticsRoute() {
  return process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev" ? (
    <FoundationDiagnosticsScreen />
  ) : null;
}

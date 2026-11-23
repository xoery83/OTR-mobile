import { Redirect } from "expo-router";
import CaptureRoute from "../(tabs)/capture";
import { hostedImportEnabled } from "@/features/capture/hostedImport";

export default function NestedImportComposer() {
  if (!hostedImportEnabled) return <Redirect href="/import-plans" />;
  return <CaptureRoute overlay hosted hostedChild />;
}

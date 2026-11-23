import { useSheetMotion } from "@/components/SheetHost";
import CaptureRoute from "../(tabs)/capture";
import { hostedImportEnabled } from "@/features/capture/hostedImport";

export default function ImportPlansRoute() {
  return hostedImportEnabled ? <HostedImportEntry /> : <CaptureRoute overlay />;
}

function HostedImportEntry() {
  const { requestClose } = useSheetMotion();
  return <CaptureRoute overlay hosted onHostedClose={requestClose} />;
}

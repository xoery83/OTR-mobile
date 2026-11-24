import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { DocumentFileInfoRootKey } from "@/features/documents/documentFileInfoReadback";
import { useRoute } from "expo-router/react-navigation";

export default function DocumentFileInfoLayout() {
  const { key } = useRoute();
  return (
    <DocumentFileInfoRootKey.Provider value={key}>
      <SheetRouteLayout />
    </DocumentFileInfoRootKey.Provider>
  );
}

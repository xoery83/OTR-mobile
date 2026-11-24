import { router } from "expo-router";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { hostedDocumentsTripPickerEnabled } from "./documentsTripPicker";

export function openHostedDocumentInformation(
  params: { documentId: string; tripId: string; origin?: string; captureId?: string; originRouteKey?: string },
  menu = false,
) {
  if (!hostedDocumentsTripPickerEnabled) return false;
  router.navigate({
    pathname: "/document-file-info",
    params: {
      ...params,
      originGeneration: String(getAccountGeneration()),
      ...(menu ? { menu: "true" } : {}),
    },
  });
  return true;
}

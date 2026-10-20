import { t } from "@/ui/locale";
import {
  legacyTripCoverAssetIds,
  isTripCoverAssetId,
} from "@/domain/trip/tripCoverAssets";
import {
  coverCatalog,
  rankedTripCovers,
  type CoverMetadata,
} from "@/features/trip-cover/coverDecision";

export function suggestedCoverIds(trip: CoverMetadata, currentId?: string | null) {
  return rankedTripCovers(trip, isTripCoverAssetId(currentId) ? 7 : 6)
    .map((row) => row.asset.id)
    .filter(isTripCoverAssetId)
    .filter((id) => id !== currentId)
    .slice(0, 6);
}

export function tripCoverDescription(id: string) {
  const legacy = legacyTripCoverAssetIds.find((value) => value === id);
  if (legacy) return t(`myTrips.cover.${legacy}`);
  const asset = coverCatalog.find((value) => value.id === id);
  if (asset && asset.provenance.kind !== "generated_illustration")
    return asset.title.replace(/\.(jpe?g|png|heic|heif)$/i, "");
  const themes = asset?.themes ?? [];
  if (themes.includes("scene:snow")) return t("coverLibrary.snow");
  if (themes.includes("scene:coast")) return t("myTrips.cover.coast");
  if (themes.includes("scene:forest")) return t("coverLibrary.forest");
  if (themes.includes("scene:desert")) return t("coverLibrary.desert");
  if (themes.includes("scene:food") || themes.includes("scene:market"))
    return t("coverLibrary.food");
  if (themes.includes("scene:culture")) return t("coverLibrary.culture");
  if (themes.includes("scene:road") || themes.includes("scene:rail"))
    return t("coverLibrary.travel");
  if (themes.includes("scene:urban") || themes.includes("scene:architecture"))
    return t("myTrips.cover.city");
  return t("coverLibrary.landscape");
}

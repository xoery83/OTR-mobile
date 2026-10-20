import type { SearchCategory, SearchResult } from "@/domain/trip/tripSearch";
export function searchRows(results: readonly SearchResult[]) {
  return [
    ...new Map(
      results.map((row) => [`${row.category}/${row.tripId}/${row.id}`, row]),
    ).values(),
  ].sort(
    (a, b) =>
      a.rank - b.rank || a.tripId.localeCompare(b.tripId) || a.id.localeCompare(b.id),
  );
}
export function filterSearchRows(
  results: readonly SearchResult[],
  category: SearchCategory,
) {
  return searchRows(results).filter(
    (row) => category === "ALL" || row.category === category,
  );
}

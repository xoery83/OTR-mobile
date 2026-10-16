// Route identity is navigation intent, never Trip read/write authority.
export function isExplicitTripDay(params: {
  view?: unknown;
  tripId?: unknown;
  date?: unknown;
  zone?: unknown;
}) {
  return (
    params.view === "day" ||
    [params.tripId, params.date, params.zone].every(
      (v) => typeof v === "string" && v.length > 0,
    )
  );
}
export function isTripWorkspacePath(pathname: string) {
  return pathname === "/trip" || pathname === "/trip-home";
}

// The Tabs navigator stays mounted; only its bar style changes with the path.
export function bottomBarVisible(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/trip" ||
    pathname === "/capture" ||
    pathname === "/updates" ||
    pathname === "/expenses" ||
    /^\/expenses\/journey\/[^/]+$/.test(pathname)
  );
}

export function shellShowsUpdates(
  pathname: string,
  params: { tripId?: unknown; view?: unknown },
  hasWorkingTrip: boolean,
) {
  const tripList =
    pathname === "/trip" &&
    (!params.tripId || params.view === "trips" || params.view === "create");
  return (
    bottomBarVisible(pathname) && hasWorkingTrip && !tripList && params.view !== "create"
  );
}

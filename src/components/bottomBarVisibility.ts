// The Tabs navigator stays mounted; only its bar style changes with the path.
export function bottomBarVisible(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/trip" ||
    pathname === "/capture" ||
    pathname === "/expenses" ||
    /^\/expenses\/journey\/[^/]+$/.test(pathname)
  );
}

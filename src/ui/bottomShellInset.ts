import { visual } from "./visual";
// The absolute shell includes its safe area; reserve it even before its first layout.
export function bottomShellInset(
  measured: number | null | undefined,
  bottom: number,
  fontScale: number,
) {
  const island =
    fontScale > 1.5 ? 2 * 76 + 2 * visual.bottomShell.gap : visual.bottomShell.height;
  const padding =
    visual.space.heading +
    (fontScale > 1.5 ? visual.space.section : visual.space.heading);
  return Math.max(
    Number.isFinite(measured) ? measured! : 0,
    island + padding + Math.max(0, bottom),
  );
}

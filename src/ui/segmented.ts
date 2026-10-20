import type { UiColors } from "./palette";

// Shared selection semantics; geometry/animation remain with existing controls.
export const segmentedControlTokens = (colors: UiColors) => ({
  trackSurface: colors.controlTrack,
  selectedSurface: colors.elevatedSurface,
  selectedLabel: colors.textPrimary,
  label: colors.textSecondary,
  indicator: colors.accent,
});

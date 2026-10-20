import { visual } from "@/ui/visual";
// ui-foundation-exception: static-theme -- existing compatibility export for unmigrated Review only; new UI must use visual/theme
import { lightPalette } from "@/ui/palette";

// Historical compatibility only; new screens use useUiTheme and visual.
export const contentVisual = {
  ...visual,
  color: {
    page: lightPalette.background,
    card: lightPalette.surface,
    hero: lightPalette.accentSurface,
    expanded: lightPalette.expandedSurface,
    warning: lightPalette.warningSurface,
    positive: lightPalette.successSurface,
    selected: lightPalette.groupedBackground,
    text: lightPalette.textPrimary,
    secondary: lightPalette.textSecondary,
    accent: lightPalette.accent,
    divider: lightPalette.separator,
  },
} as const;

export const heroAmountSizes = [44, 40, 36, 32] as const;

export function nextHeroAmountStep(step: number, lineCount: number) {
  return lineCount > 1 ? Math.min(step + 1, heroAmountSizes.length - 1) : step;
}

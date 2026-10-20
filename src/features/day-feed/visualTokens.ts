import { visual } from "@/ui/visual";

// Role aliases preserve the single UI Foundation; no per-Event colors or sizes.
export const experienceVisualTokens = {
  primitives: {
    RELATIONSHIP: { title: visual.type.meta, radius: null, surface: "background" },
    ROW: { title: visual.type.row, radius: null, surface: "background" },
    FUNCTIONAL_BLOCK: {
      title: visual.type.section,
      radius: visual.radius.card,
      surface: "surface",
    },
    FEATURED_SURFACE: {
      title: visual.type.section,
      radius: visual.radius.hero,
      surface: "elevatedSurface",
    },
  },
  spacing: visual.space,
  gutters: { content: visual.space.page, grouped: visual.space.card },
  typography: {
    context: visual.type.meta,
    title: visual.type.row,
    block: visual.type.section,
    action: visual.type.action,
    secondary: visual.type.meta,
  },
  radius: visual.radius,
  surfaces: { canvas: "background", functional: "surface", featured: "elevatedSurface" },
  separators: { none: "NONE", contextual: "separator" },
  icons: {
    quiet: "textSecondary",
    standard: "textPrimary",
    // ui-foundation-exception: string -- semantic palette role name, not visible UI text
    action: "accent",
    minimumTarget: 44,
  },
  images: { thumbnail: 1, landscape: 16 / 9 },
  actions: { primary: "primary", contextual: "secondary", quiet: "text" },
  density: {
    COMPACT: { gap: visual.space.heading, inset: visual.space.card },
    REGULAR: { gap: visual.space.row, inset: visual.space.page },
    FEATURED: { gap: visual.space.section, inset: visual.space.page },
  },
  decoration: {
    iconPerGroup: 1,
    repeatStatus: false,
    pagination: "NONE",
    denseStrategy: "GROUP_BEFORE_FONT_REDUCTION",
  },
  text: {
    allowFontScaling: true,
    ellipsizeMode: "tail",
    focusLines: "UNBOUNDED",
    accessibilityIdentity: "FULL_AUTHORED_TITLE",
    fixedHeight: false,
  },
} as const;

// Bound the shared rail so enlarged clocks do not consume the Event title width.
export const timeRailWidth = (fontScale: number) => 48 * Math.min(fontScale, 5 / 3);

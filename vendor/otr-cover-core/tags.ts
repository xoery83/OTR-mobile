/** Shared lexical/editorial tags. Geographic entity facts belong to geo.ts. */
export type TagCategory = 'geo' | 'activity' | 'scene' | 'mood';
export interface ThemeTag {
  id: string;
  label: { en: string; zh: string };
  category: TagCategory;
}
export interface TagSchema extends ThemeTag {
  aliases: string[];
  preferredScenes: string[];
}
export interface ThemeEvidence {
  literal: string;
  canonicalId: string | null;
  source: 'name';
  start: number;
  end: number;
  negated: boolean;
  conflict: boolean;
  ambiguous: boolean;
}
export interface PreferredScene {
  scene: string;
  sourceThemeIds: string[];
  source: 'hand_authored_soft_association';
  strength: 'soft';
}
export interface ThemeCombination {
  id: string;
  themeIds: string[];
  evidence: string[];
}
export interface ThemeResolution {
  tags: ThemeTag[];
  evidence: ThemeEvidence[];
  preferredScenes: PreferredScene[];
  combinations: ThemeCombination[];
  warnings: string[];
  status: 'matched' | 'unknown' | 'conflict';
}
export interface AssetTagAnnotation {
  id: string;
  evidence: 'visible_scene' | 'activity_suitability' | 'editorial_mood';
  note: string;
}

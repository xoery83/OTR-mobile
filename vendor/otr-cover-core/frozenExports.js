/** Versioned pure-TypeScript entry point; no I/O, browser, React Native or persistence. */
export { resolveGeoContext, resolveThemeEvidence, resolveProductionTags, rankCoverAssets, configureProductionGeo, productionDefaultWeights } from './production.js';
export { TAG_SCHEMA_VERSION } from './taxonomyV2.js';
export { THEME_VOCABULARY_V2_VERSION } from './themeVocabularyV2.js';
export const FROZEN_COVER_CORE_VERSION = 'otr-cover-core/theme-v2-owner-freeze-1';
export const FROZEN_CANDIDATE_CATALOG_VERSION = 'otr-native-candidate48/1';

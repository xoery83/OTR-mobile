import { resolveTravelThemes, TRAVEL_THEMES } from './themes.js';
import { CANONICAL_PROJECTION, SCENE_AFFINITIES } from './taxonomyV2.js';
import { THEME_V2_ADDITIONS, THEME_V2_CONTEXT_ONLY, THEME_VOCABULARY_V2_VERSION } from './themeVocabularyV2.js';
export const TRAVEL_THEME_VOCABULARY_V2 = [...TRAVEL_THEMES.map(t => ({ ...t, id: CANONICAL_PROJECTION[t.id], sourceVocabularyId: t.id })), ...THEME_V2_ADDITIONS];
export const THEME_V2_STATS = { version: THEME_VOCABULARY_V2_VERSION, canonicalCount: TRAVEL_THEME_VOCABULARY_V2.length, aliasCount: TRAVEL_THEME_VOCABULARY_V2.reduce((n, t) => n + t.aliases.length, 0), uniqueNormalizedAliasCount: new Set(TRAVEL_THEME_VOCABULARY_V2.flatMap(t => t.aliases.map(a => a.normalize('NFKC').toLowerCase().trim()))).size, baselineCanonicalCount: 42, addedCanonicalCount: THEME_V2_ADDITIONS.length, contextOnlyCount: THEME_V2_CONTEXT_ONLY.length, contextOnlyAliasCount: THEME_V2_CONTEXT_ONLY.reduce((n, t) => n + t.aliases.length, 0), byCategory: Object.fromEntries([...new Set(TRAVEL_THEME_VOCABULARY_V2.map(t => t.category))].map(c => [c, TRAVEL_THEME_VOCABULARY_V2.filter(t => t.category === c).length])) };
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const canonicalForm = (s) => s.normalize('NFKC').replace(/[’‘]/g, "'").replace(/[‐‑–—-]/g, ' ');
function normalizeWithOffsets(name) { let text = ''; const starts = [], ends = []; let offset = 0; for (const c of name) {
    const normalized = canonicalForm(c);
    for (let i = 0; i < normalized.length; i++) {
        starts.push(offset);
        ends.push(offset + c.length);
    }
    text += normalized;
    offset += c.length;
} return { text, starts, ends }; }
function find(text, alias) { const pattern = escape(canonicalForm(alias)).replace(/\s+/g, '\\s+'); return [...text.matchAll(new RegExp(pattern, 'giu'))].filter(m => !(/^[A-Za-z]/.test(alias) && m.index > 0 && /[\p{L}\p{N}_]/u.test(text[m.index - 1])) && !(/[A-Za-z]$/.test(alias) && m.index + m[0].length < text.length && /[\p{L}\p{N}_]/u.test(text[m.index + m[0].length]))); }
function isNegated(text, start, end) { return /(?:\b(?:no|not|without|skip|avoid)\s+(?:(?:any|more|a|the)\s+)?|(?:不要|不想|没有|沒有|不是|不去|不做|不看|不赏|不賞|不|非|避开|避開)\s*)$/iu.test(text.slice(Math.max(0, start - 40), start)) || /^(?:\s*free\b|\s*(?:不要|不想|没有|沒有)(?=[，,。.!！?？\s]|$))/iu.test(text.slice(end, end + 15)); }
/** Unified name-only lexer. Original 42 records/parser remain independently callable and unchanged. */
export function resolveThemeEvidence(name) {
    const baseline = resolveTravelThemes(name);
    const normalized = normalizeWithOffsets(name);
    const candidates = baseline.evidence.map(e => ({ ...e, vocabularyId: e.canonicalId, canonicalId: e.canonicalId ? CANONICAL_PROJECTION[e.canonicalId] : null, category: e.canonicalId ? TRAVEL_THEME_VOCABULARY_V2.find(t => t.id === CANONICAL_PROJECTION[e.canonicalId])?.category : undefined, vocabularyVersion: 'otr-travel-theme-vocabulary/1', rule: 'baseline42_literal' }));
    if (name.length <= 1000) {
        for (const theme of [...THEME_V2_ADDITIONS, ...THEME_V2_CONTEXT_ONLY])
            for (const alias of theme.aliases)
                for (const m of find(normalized.text, alias)) {
                    const start = m.index, end = start + m[0].length;
                    const contextOnly = THEME_V2_CONTEXT_ONLY.some(t => t.id === theme.id);
                    const ambiguous = theme.id === 'scene:aurora' && /^aurora$/iu.test(m[0]) && !/\b(?:aurora\s+(?:trip|tour|hunting|chase)|northern lights)\b/iu.test(normalized.text);
                    candidates.push({ literal: name.slice(normalized.starts[start], normalized.ends[end - 1]), canonicalId: ambiguous || contextOnly ? null : theme.id, ...(contextOnly ? { contextId: theme.id } : {}), vocabularyId: theme.id, source: 'name', start: normalized.starts[start], end: normalized.ends[end - 1], negated: isNegated(normalized.text, start, end), conflict: false, ambiguous, category: theme.category, vocabularyVersion: THEME_VOCABULARY_V2_VERSION, rule: ambiguous ? 'ambiguous_aurora_name' : contextOnly ? 'context_only_no_image_affinity' : 'curated_v2_literal' });
                }
        // Proper-name phrase exclusions prevent seasonal/holiday words becoming travel intent.
        for (const phrase of ['Christmas Island', 'Easter Island', 'Summer Palace', 'Spring Hill', 'Safari browser', 'Spring training camp', 'Aurora research'])
            for (const m of find(normalized.text, phrase)) {
                const start = m.index, end = start + m[0].length;
                candidates.push({ literal: name.slice(normalized.starts[start], normalized.ends[end - 1]), canonicalId: null, vocabularyId: null, source: 'name', start: normalized.starts[start], end: normalized.ends[end - 1], negated: false, conflict: false, ambiguous: true, vocabularyVersion: THEME_VOCABULARY_V2_VERSION, rule: 'proper_name_phrase_not_theme' });
            }
    }
    candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start || Number(b.vocabularyVersion === THEME_VOCABULARY_V2_VERSION) - Number(a.vocabularyVersion === THEME_VOCABULARY_V2_VERSION) || (a.canonicalId ?? '').localeCompare(b.canonicalId ?? ''));
    const evidence = [];
    for (const e of candidates)
        if (!evidence.some(k => e.start < k.end && e.end > k.start))
            evidence.push({ ...e });
    evidence.sort((a, b) => a.start - b.start);
    const warnings = name.length > 1000 ? [...baseline.warnings] : [];
    for (let i = 1; i < evidence.length; i++) {
        const prior = evidence[i - 1], current = evidence[i];
        const between = canonicalForm(name.slice(prior.end, current.start));
        if (prior.negated && !current.negated && /^\s*(?:(?:,\s*)?(?:and|or)|[或和及与與、])\s*$/iu.test(between)) {
            current.negated = true;
            warnings.push('Coordinated negation conservatively suppresses: ' + current.literal);
        }
    }
    const identity = (e) => e.canonicalId ?? e.contextId;
    const conflicts = new Set();
    for (const e of evidence) {
        const id = identity(e);
        if (id && evidence.some(x => identity(x) === id && x.negated !== e.negated))
            conflicts.add(id);
    }
    for (const e of evidence)
        e.conflict = !!identity(e) && conflicts.has(identity(e));
    const contextEvidence = evidence.filter(e => e.contextId);
    const active = new Set(evidence.filter(e => !e.negated && !e.conflict && !e.ambiguous).map(e => e.canonicalId));
    const tags = TRAVEL_THEME_VOCABULARY_V2.filter(t => active.has(t.id)).map(t => ({ id: t.id, label: t.label, category: t.category, sourceVocabularyId: 'sourceVocabularyId' in t ? t.sourceVocabularyId : t.id }));
    const excluded = new Set(evidence.filter(e => e.negated || e.conflict).map(e => e.canonicalId));
    const preferredScenes = [];
    for (const tag of tags)
        for (const [scene, weight] of Object.entries(SCENE_AFFINITIES[tag.id] ?? {})) {
            if (excluded.has(scene))
                continue;
            const old = preferredScenes.find(p => p.scene === scene);
            if (old) {
                old.weight = Math.max(old.weight, weight);
                if (!old.sourceThemeIds.includes(tag.id))
                    old.sourceThemeIds.push(tag.id);
            }
            else
                preferredScenes.push({ scene, sourceThemeIds: [tag.id], weight, source: 'SCENE_AFFINITIES / ' + THEME_VOCABULARY_V2_VERSION, strength: 'soft' });
        }
    warnings.push(...[...conflicts].map(id => 'Conflicting positive and negative name evidence: ' + id), ...evidence.filter(e => e.ambiguous).map(e => 'Ambiguous name term requires clarification: ' + e.literal));
    for (const t of THEME_V2_ADDITIONS.filter(t => active.has(t.id) && t.coverageNote))
        warnings.push(t.coverageNote);
    return { baseline, contextEvidence, baselineVocabularyCount: 42, vocabularyVersion: THEME_VOCABULARY_V2_VERSION, vocabularyStats: THEME_V2_STATS, tags, evidence, preferredScenes, combinations: baseline.combinations.filter(c => c.themeIds.every(id => active.has(CANONICAL_PROJECTION[id]))).map(c => ({ ...c, themeIds: c.themeIds.map(id => CANONICAL_PROJECTION[id]) })), warnings, status: conflicts.size ? 'conflict' : tags.length ? 'matched' : contextEvidence.some(e => !e.negated && !e.conflict) ? 'context_only' : 'unknown', policyNotes: ['V1原42项与解析器保持原样；V2补充季节、场合、旅行方式意图', '所有季节/场合/方式关联均为软封面偏好，不是地理、当季可见性或活动事实', '特定极光/樱花/游猎素材未经验证时明确回退泛景，不冒充精确主题素材'] };
}
export const resolveTravelThemesV2 = resolveThemeEvidence;

import { resolveTravelThemes, TRAVEL_THEMES } from './themes.js';
import { GeoIndex } from './geo.js';
export const defaultWeights = { location: 80, activity: 18, scene: 16, mood: 8, preferredScene: 8, fallback: 8, diversity: 12 };
let geoIndex = new GeoIndex([]);
export function configureGeoCatalog(entities) { geoIndex = new GeoIndex(entities); return geoIndex; }
export function getGeoIndex() { return geoIndex; }
export function resolveTags(input) {
    const dest = (input.destination ?? '').trim();
    const geo = geoIndex.resolve(dest || input.name, dest ? 'destination' : 'name', input.confirmedGeoIds ?? []);
    const evidence = geo.matches.map(m => ({ tag: m.entity.id, kind: 'place', source: m.source, matched: m.matched }));
    const warnings = [];
    if (geo.ambiguities.length)
        warnings.push('同名地点有多个候选：请补充国家/行政区或明确确认，不按人口或知名度猜测。');
    if (geo.unknownParts.length)
        warnings.push('未识别文本：' + geo.unknownParts.join(' / '));
    if (dest && geo.status === 'unknown')
        warnings.push('地点未知：不从旅行名称借用地点，仅使用通用素材。');
    const travelThemes = resolveTravelThemes(input.name);
    warnings.push(...travelThemes.warnings);
    for (const tag of travelThemes.tags) {
        const found = travelThemes.evidence.find(e => e.canonicalId === tag.id && !e.negated && !e.conflict);
        if (found)
            evidence.push({ tag: tag.id, kind: 'theme', source: 'name', matched: found.literal });
    }
    return { places: geo.locations.map(e => e.id), themes: travelThemes.tags.map(t => t.id), evidence, warnings, geo, travelThemes, tags: [...geo.locations.map(e => ({ id: e.id, label: { en: e.names.en ?? e.names.primary ?? e.id, zh: e.names.zh ?? e.names.en ?? e.names.primary ?? e.id }, category: 'geo' })), ...travelThemes.tags] };
}
export function projectAssetTags(asset) {
    const projected = [];
    for (const id of asset.geoIds ?? []) {
        const e = geoIndex.byId.get(id);
        if (e)
            projected.push({ tag: { id, label: { en: e.names.en ?? e.names.primary ?? id, zh: e.names.zh ?? e.names.en ?? e.names.primary ?? id }, category: 'geo' }, evidence: 'source_linked_geography', note: 'Source-photo identity, not a claim about the Trip destination' });
    }
    for (const a of asset.tagAnnotations ?? []) {
        const tag = TRAVEL_THEMES.find(t => t.id === a.id);
        if (tag)
            projected.push({ tag, evidence: a.evidence, note: a.note });
    }
    return projected;
}
export function normalizeWeights(w = {}) {
    const out = { ...defaultWeights };
    for (const k of Object.keys(out)) {
        const n = w[k];
        if (n !== undefined) {
            if (!Number.isFinite(n) || n < 0 || n > 200)
                throw new RangeError('Weights must be finite numbers in 0..200');
            out[k] = n;
        }
    }
    return out;
}
function levelFor(asset, locations) {
    if (asset.neutral)
        return 'generic';
    if (asset.geoIds?.some(id => locations.some(e => e.id === id)))
        return 'exact';
    if (locations.some(e => e.type === 'region' && asset.adminIds?.includes(e.id) || e.adminIds?.some(id => asset.adminIds?.includes(id))))
        return 'region';
    if (locations.some(e => asset.countryCodes?.some(c => e.countryCodes.includes(c))))
        return 'country';
    return null;
}
export function rankCovers(input, catalog, weights = {}, limit = 5) {
    const w = normalizeWeights(weights);
    const tags = resolveTags(input);
    const seen = new Set();
    if (!Number.isInteger(limit) || limit < 0 || limit > 50)
        throw new RangeError('Limit must be 0..50');
    const candidates = [];
    for (const asset of catalog) {
        if (seen.has(asset.id))
            throw new Error('Duplicate asset ID');
        seen.add(asset.id);
        const manual = asset.id === input.manualAssetId;
        const level = levelFor(asset, tags.geo.locations);
        if (!manual && !level)
            continue;
        const matchLevel = level ?? 'generic';
        const location = matchLevel === 'exact' ? w.location : matchLevel === 'region' ? w.location * .6 : matchLevel === 'country' ? w.location * .3 : 0;
        const annotations = asset.tagAnnotations ?? [];
        const matchedTags = tags.travelThemes.tags.filter(t => annotations.some(a => a.id === t.id));
        const activity = matchedTags.filter(t => t.category === 'activity').length * w.activity;
        const scene = matchedTags.filter(t => t.category === 'scene').length * w.scene;
        const mood = matchedTags.filter(t => t.category === 'mood').length * w.mood;
        const preferred = tags.travelThemes.preferredScenes.filter(p => annotations.some(a => a.id === p.scene && a.evidence === 'visible_scene'));
        const preferredScene = preferred.length * w.preferredScene;
        const fallback = matchLevel === 'generic' ? w.fallback : 0;
        const reasons = [...(manual ? ['用户手动封面优先'] : []), matchLevel === 'exact' ? `准确地点素材 +${location}` : matchLevel === 'region' ? `可信同行政区素材 +${location}；非目的地照片` : matchLevel === 'country' ? `可信同国家素材 +${location}；非目的地照片` : `主题/通用兜底 +${fallback}；非目的地照片`, ...matchedTags.map(t => `显式${t.category} ${t.id} +${t.category === 'activity' ? w.activity : t.category === 'mood' ? w.mood : w.scene}`), ...preferred.map(p => `软偏好 ${p.sourceThemeIds.join('+')} → ${p.scene} +${w.preferredScene}（非地理事实）`)];
        candidates.push({ asset, score: location + activity + scene + mood + preferredScene + fallback, reasons, manual, matchLevel, destinationPhoto: matchLevel === 'exact', breakdown: { location, activity, scene, mood, preferredScene, fallback, diversity: 0 } });
    }
    const result = [];
    while (candidates.length && result.length < limit) {
        const adjusted = candidates.map(c => { const penalty = result.filter(r => r.asset.family === c.asset.family).length * w.diversity; return { ...c, score: c.score - penalty, breakdown: { ...c.breakdown, diversity: -penalty }, reasons: [...c.reasons, ...(penalty ? [`重复素材组惩罚 −${penalty}`] : [])] }; });
        adjusted.sort((a, b) => Number(b.manual) - Number(a.manual) || b.score - a.score || a.asset.id.localeCompare(b.asset.id, 'en'));
        const next = adjusted[0];
        result.push(next);
        candidates.splice(candidates.findIndex(c => c.asset.id === next.asset.id), 1);
    }
    return result;
}

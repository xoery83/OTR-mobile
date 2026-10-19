import type { TagCategory, TagSchema, ThemeEvidence, ThemeResolution } from './tags.js';
export type { TagCategory, TagSchema, ThemeTag, ThemeEvidence, ThemeResolution, PreferredScene, ThemeCombination, AssetTagAnnotation } from './tags.js';

const tag = (id: string, en: string, zh: string, category: TagCategory, aliases: string[], preferredScenes: string[] = []): TagSchema =>
  ({ id, label: { en, zh }, category, aliases: [...new Set([en, zh, ...aliases])], preferredScenes });

/** Hand-authored lexical vocabulary and soft editorial associations, version 1.
 * Associations express possible imagery, never a destination's geographic facts. */
export const TRAVEL_THEMES: readonly TagSchema[] = [
  tag('coast', 'Coast', '海岸', 'scene', ['coastal', 'seaside', '海边', '海滨', '海濱'], ['coast']),
  tag('mountain', 'Mountain', '山地', 'scene', ['mountains', '山岳', '高山'], ['mountain']),
  tag('lake', 'Lake', '湖泊', 'scene', ['lakes', '湖边', '湖畔'], ['lake']),
  tag('island', 'Island', '海岛', 'scene', ['islands', '海島', '岛屿', '島嶼'], ['coast']),
  tag('desert', 'Desert', '沙漠', 'scene', ['deserts', '荒漠'], ['desert']),
  tag('countryside', 'Countryside', '乡村', 'scene', ['rural', '田园', '鄉村'], ['countryside']),
  tag('city', 'City scene', '城市风光', 'scene', ['city', 'urban', '都市', '城市', '城市風光'], ['city']),
  tag('night', 'Night', '夜景', 'scene', ['nightlife', 'night view', '夜游', '夜遊'], ['night', 'city']),
  tag('forest', 'Forest', '森林', 'scene', ['woodland', 'woods', '林间', '林間'], ['forest']),
  tag('trail', 'Trail', '步道', 'scene', ['trails', '山径', '山徑'], ['trail']),
  tag('beach', 'Beach', '沙滩', 'scene', ['beaches', '沙灘'], ['beach', 'coast']),
  tag('architecture', 'Architecture', '建筑', 'scene', ['buildings', '建筑摄影', '建築', '建築攝影'], ['architecture']),
  tag('garden', 'Garden', '花园', 'scene', ['gardens', '花園', '园林', '園林'], ['garden']),
  tag('landscape', 'Landscape', '风景', 'scene', ['scenery', '风光', '風景', '風光'], ['landscape']),
  tag('culture', 'Culture', '人文', 'scene', ['cultural', '文化', '民俗'], ['culture', 'architecture']),
  tag('snow', 'Snow', '雪景', 'scene', ['snowy', '冰雪'], ['snow', 'mountain']),
  tag('sunset', 'Sunset', '日落', 'scene', ['sunsets', '夕阳', '夕陽'], ['sunset', 'landscape']),
  tag('wildlife', 'Wildlife', '野生动物', 'scene', ['wild animals', '野生動物'], ['wildlife']),
  tag('hiking', 'Hiking', '徒步', 'activity', ['hike', 'hikes', 'trekking', 'trek', '爬山', '登山', '健行'], ['trail', 'mountain', 'forest', 'coast']),
  tag('photography', 'Photography', '摄影', 'activity', ['photo trip', 'photo walk', 'photographing', '攝影', '拍照', '旅拍'], ['landscape', 'city', 'coast']),
  tag('road_trip', 'Road trip', '自驾', 'activity', ['roadtrip', 'road-trip', 'self drive', '自駕', '自驾游', '自駕遊', '公路旅行'], ['landscape', 'coast', 'mountain']),
  tag('shopping', 'Shopping', '购物', 'activity', ['shop', '逛街', '購物', '买买买'], ['city']),
  tag('camping', 'Camping', '露营', 'activity', ['tent camping', '露營', '野营', '野營'], ['forest', 'lake', 'mountain']),
  tag('skiing', 'Skiing', '滑雪', 'activity', ['ski', 'snowboarding', '单板滑雪', '單板滑雪'], ['snow', 'mountain']),
  tag('cycling', 'Cycling', '骑行', 'activity', ['biking', 'bike trip', '騎行', '骑车', '騎車'], ['trail', 'countryside']),
  tag('surfing', 'Surfing', '冲浪', 'activity', ['surf trip', '衝浪'], ['beach', 'coast']),
  tag('diving', 'Diving', '潜水', 'activity', ['scuba', 'scuba diving', '潛水', '浮潜', '浮潛', 'snorkeling', 'snorkelling'], ['coast']),
  tag('food', 'Food tour', '美食', 'activity', ['foodie', 'food trip', 'culinary', '吃货', '吃貨', '美食之旅'], ['city', 'culture']),
  tag('museum', 'Museum visit', '逛博物馆', 'activity', ['museum', 'museums', '博物馆', '博物館'], ['culture', 'architecture']),
  tag('wellness', 'Wellness', '康养', 'activity', ['spa', '温泉', '溫泉', '康養'], ['garden', 'landscape']),
  tag('sailing', 'Sailing', '帆船', 'activity', ['sail trip', 'boat trip', '游船', '遊船'], ['coast', 'lake']),
  tag('fishing', 'Fishing', '钓鱼', 'activity', ['angling', '釣魚'], ['lake', 'coast']),
  tag('running', 'Running', '跑步', 'activity', ['marathon', '马拉松', '馬拉松'], ['trail', 'city']),
  tag('stargazing', 'Stargazing', '观星', 'activity', ['star gazing', '觀星'], ['night']),
  tag('calm', 'Calm', '宁静', 'mood', ['peaceful', 'tranquil', '寧靜', '安静', '安靜'], []),
  tag('adventure', 'Adventure', '冒险', 'mood', ['adventurous', '冒險', '探险', '探險'], []),
  tag('relaxation', 'Relaxation', '放松', 'mood', ['relax', 'relaxing', '放鬆', '休闲', '休閒'], []),
  tag('romantic', 'Romantic', '浪漫', 'mood', ['romance', '蜜月', 'honeymoon'], []),
  tag('family', 'Family time', '亲子', 'mood', ['family', 'family trip', '親子', '家庭旅行'], []),
  tag('celebration', 'Celebration', '庆祝', 'mood', ['birthday', 'anniversary', '慶祝', '生日', '纪念日', '紀念日'], []),
  tag('nostalgia', 'Nostalgia', '怀旧', 'mood', ['nostalgic', '懷舊'], []),
  tag('slow_travel', 'Slow travel', '慢旅行', 'mood', ['slow trip', '慢游', '慢遊'], []),
];

const AMBIGUOUS = ['shooting', 'camp'];
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordChar = (value: string) => /[\p{L}\p{N}_]/u.test(value);

function occurrences(name: string, alias: string): { start: number; end: number }[] {
  const result: { start: number; end: number }[] = [];
  for (const match of name.matchAll(new RegExp(escapeRegex(alias), 'giu'))) {
    const start = match.index!;
    const end = start + match[0].length;
    // English aliases require word boundaries; Chinese aliases use literal substrings.
    if (/^[A-Za-z]/.test(alias) && start > 0 && wordChar(name[start - 1])) continue;
    if (/[A-Za-z]$/.test(alias) && end < name.length && wordChar(name[end])) continue;
    result.push({ start, end });
  }
  return result;
}

function negated(name: string, start: number, end: number): boolean {
  const prefix = name.slice(Math.max(0, start - 32), start);
  const suffix = name.slice(end, end + 12);
  // shortcut: direct local negation only; broaden with an explicit grammar if future fixtures need clause scope.
  return /(?:\b(?:no|not|without)\s+(?:(?:any|more|a|the)\s+)?|(?:不要|不想|没有|沒有|不是|不去|不|非)\s*)$/iu.test(prefix)
    || /^(?:\s*[-–]?free\b|\s*(?:不要|不想|没有|沒有)(?=[，,。.!！?？\s]|$))/iu.test(suffix);
}

/** Reads only the supplied Trip name. Never call with a location string. */
export function resolveTravelThemes(name: string): ThemeResolution {
  if (name.length > 1000) return { tags: [], evidence: [], preferredScenes: [], combinations: [], warnings: ['Trip name exceeds the 1000-character lexical analysis limit'], status: 'unknown' };
  // Per-code-point compatibility normalization preserves evidence offsets, including fullwidth Latin.
  let searchName = '';
  const originalStarts: number[] = [];
  const originalEnds: number[] = [];
  let offset = 0;
  for (const character of name) {
    const normalized = character.normalize('NFKC');
    for (let i = 0; i < normalized.length; i++) {
      originalStarts.push(offset);
      originalEnds.push(offset + character.length);
    }
    searchName += normalized;
    offset += character.length;
  }
  const candidates: ThemeEvidence[] = [];
  for (const theme of TRAVEL_THEMES) {
    for (const alias of theme.aliases) {
      for (const span of occurrences(searchName, alias.normalize('NFKC'))) {
        candidates.push({ literal: name.slice(originalStarts[span.start], originalEnds[span.end - 1]), canonicalId: theme.id, source: 'name', start: originalStarts[span.start], end: originalEnds[span.end - 1],
          negated: negated(searchName, span.start, span.end), conflict: false, ambiguous: false });
      }
    }
  }
  for (const alias of AMBIGUOUS) {
    for (const span of occurrences(searchName, alias.normalize('NFKC'))) {
      candidates.push({ literal: name.slice(originalStarts[span.start], originalEnds[span.end - 1]), canonicalId: null, source: 'name', start: originalStarts[span.start], end: originalEnds[span.end - 1],
        negated: negated(searchName, span.start, span.end), conflict: false, ambiguous: true });
    }
  }
  // Prefer longer literal aliases globally, then keep distinct non-overlapping evidence.
  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start || (a.canonicalId ?? '').localeCompare(b.canonicalId ?? ''));
  const evidence: ThemeEvidence[] = [];
  for (const candidate of candidates) {
    if (!evidence.some(kept => candidate.start < kept.end && candidate.end > kept.start)) evidence.push(candidate);
  }
  evidence.sort((a, b) => a.start - b.start);
  const scopeWarnings: string[] = [];
  for (let i = 1; i < evidence.length; i++) {
    const previous = evidence[i - 1];
    const current = evidence[i];
    const between = name.slice(previous.end, current.start).normalize('NFKC');
    if (previous.negated && !current.negated && /^\s*(?:(?:,\s*)?(?:and|or)|[或和及与與、])\s*$/iu.test(between)) {
      current.negated = true;
      scopeWarnings.push(`Coordinated negation conservatively suppresses: ${current.literal}`);
    }
  }
  const conflicts = new Set<string>();
  for (const theme of TRAVEL_THEMES) {
    const matches = evidence.filter(item => item.canonicalId === theme.id);
    if (matches.some(item => item.negated) && matches.some(item => !item.negated)) conflicts.add(theme.id);
  }
  for (const item of evidence) item.conflict = item.canonicalId !== null && conflicts.has(item.canonicalId);
  const active = new Set(evidence.filter(item => !item.negated && !item.conflict && !item.ambiguous).map(item => item.canonicalId));
  const tags = TRAVEL_THEMES.filter(theme => active.has(theme.id)).map(({ id, label, category }) => ({ id, label, category }));
  const excludedScenes = new Set(evidence.filter(item => item.negated || item.conflict).map(item => item.canonicalId));
  const preferredScenes: ThemeResolution['preferredScenes'] = [];
  for (const theme of TRAVEL_THEMES.filter(theme => active.has(theme.id))) {
    for (const scene of theme.preferredScenes) {
      if (excludedScenes.has(scene)) continue;
      const existing = preferredScenes.find(item => item.scene === scene);
      if (existing) existing.sourceThemeIds.push(theme.id);
      else preferredScenes.push({ scene, sourceThemeIds: [theme.id], source: 'hand_authored_soft_association', strength: 'soft' });
    }
  }
  const combinations: ThemeResolution['combinations'] = [];
  for (const [id, themeIds] of [['hiking_photography', ['hiking', 'photography']], ['road_trip_coast', ['road_trip', 'coast']]] as const) {
    if (themeIds.every(id => active.has(id))) combinations.push({ id, themeIds: [...themeIds], evidence: evidence.filter(item => themeIds.some(id => id === item.canonicalId) && !item.negated && !item.conflict).map(item => item.literal) });
  }
  const warnings = [...scopeWarnings, ...[...conflicts].map(id => `Conflicting positive and negative name evidence: ${id}`)];
  for (const item of evidence.filter(item => item.ambiguous)) warnings.push(`Ambiguous name term requires clarification: ${item.literal}`);
  return { tags, evidence, preferredScenes, combinations, warnings, status: conflicts.size ? 'conflict' : tags.length ? 'matched' : 'unknown' };
}

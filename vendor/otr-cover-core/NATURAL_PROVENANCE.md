# Natural travel destination snapshot

Retrieved from the official Wikidata Query Service (`https://query.wikidata.org/sparql`) on 2026-10-19. This is a bounded, reproducible offline laboratory reference catalog; it is not an exhaustive gazetteer, an editorial destination recommendation list, or a new OTR persistence model.

## Actual delivered coverage

`natural.json` contains **2,529 unique Wikidata entities**: 450 parks, 446 mountains/volcanoes, 445 islands, 450 lakes, 288 coasts/beaches, and 450 natural landmarks. Every record has an English source label. 2,180 have a Wikidata `zh` label (349 do not); 854 have explicit native-name statements. There are 4,395 distinct-per-record English/Chinese aliases. No missing translation was generated. Chinese labels may be simplified or traditional, exactly as supplied by Wikidata.

2,450 records have at least one source country code, spanning 186 distinct Wikidata P297 values; 79 have none and retain empty arrays. P297 is the source's alpha-2 country-code property, including exceptional/user-assigned `XK`; this catalog makes no sovereignty determination. 2,514 records have coordinates; 2,066 have a sourced GeoNames ID. Multi-country geographic features retain all source countries. Administrative context consists of direct P131 entity IDs, not a fabricated complete administrative hierarchy.

Final JSON: 969,478 UTF-8 bytes; gzip at Python default level with fixed mtime: 197,181 bytes. These are catalog-file sizes, not whole-Lab bundle measurements. `natural-stats.json` records counts and the required example records; `NATURAL_SHA256.json` hashes the used source responses and final JSON.

## Selection and transformation

Selection uses direct instance-of P31 membership, at least eight Wikidata sitelinks, and a maximum of 450 selected entities per category. Sort is descending sitelink count then entity URI. It does not traverse every subclass. Exact class allowlist, verified by `raw/class-labels.json`:

| Output type | Wikidata source classes |
| --- | --- |
| park | Q46169 national park |
| mountain | Q8502 mountain; Q8072 volcano |
| island | Q23442 island |
| lake | Q23397 lake |
| coast | Q93352 coast; Q40080 beach |
| landmark | Q34038 waterfall; Q191992 headland; Q35509 cave |

The selection snapshots contain 450 entities each except coast (289). Detail extraction requires an English label. IDs selected in several categories become one record, with deterministic type precedence park → mountain → island → lake → coast → landmark. Thus output category counts can be below selection caps. This lightweight classification is a Lab lookup classification, not a claim that all selected objects are popular tourist attractions. Sitelink count favors Wikimedia coverage and is only a bounded notability proxy.

Properties: English/Chinese rdfs:label → `names.en/zh`; P1705 native name → `names.local`; English/Chinese skos:altLabel → `aliases`; P17/P297 → `countryIds/countryCodes`; P131 → `adminIds`; P625 → `lat/lon`; P1566 → `geonamesId`. Stable identity is `wd:Q…`; sourceId is the original Q ID. Arrays are deduplicated and sorted. Native labels are sourced native-name statements, not inferred from country. For multiple coordinate/GeoNames statements, the last returned statement is retained; this snapshot is deterministic once frozen, but regeneration may select a different value if source/order changes. The source statement multiplicity remains inspectable in raw responses.

**Every `visualContexts` array is empty.** Being an island, park or mountain does not prove a beach, forest, snow, or other depicted visual context. Cover-specific visual context requires independently justified asset tags.

## Required identity checks

- Yellowstone National Park: `wd:Q351`, park, US; Chinese 黃石國家公園.
- Bali Island: **`wd:Q4648`**, island, ID; Chinese 巴厘岛, native Bali. Bali province is a separate entity, `wd:Q3125978` (source administrative context only). `wd:Q31288` is Verkhnyaya Toyma and must not be used for Bali.
- Mount Fuji: `wd:Q39231`, mountain (source allowlist includes volcanoes), JP; Chinese/native 富士山.

The Bali identity distinction was checked against live official label/type results in `raw/bali-verification.json`, the island selection snapshot, and its detailed source record. Local names such as “Bali” should participate in lookup without replacing stable identity or the distinct province semantics.

## Source snapshots, reproduction and license

- `raw/*-selection.sparql` and `.json`: bounded source selections.
- `raw/*-detail-N.sparql` and `.json`: exact batches of up to 100 IDs and raw official responses.
- `raw/extract_natural_v2.py`: downloads the bounded source snapshots (network required only for ingestion, never at runtime).
- `raw/build_natural.py`: builds `natural.json` and `natural-stats.json` from frozen detail responses using Python standard library only.
- `raw/class-labels.json`, `raw/bali-verification.json`: extra identity/type verification responses.
- `raw/wikidata-licensing.html`: official policy evidence, page text licensed separately as described below.

Wikidata structured entity data is released under **CC0 1.0**, per [Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing) and [CC0](https://creativecommons.org/publicdomain/zero/1.0/). The catalog contains structured facts, labels and aliases, not Wikipedia article prose or images. The archived licensing policy page itself is explanatory page text under its stated CC BY-SA 4.0 terms, and is evidence rather than catalog content. No image rights are conveyed by this catalog. Source credit is retained for traceability even though CC0 does not require attribution.

Known limitations: finite direct-class coverage, uneven global/language coverage, source community-data errors, incomplete admin/country data, potentially ambiguous short aliases and lack of visual claims. Missing data stays missing. Unknown locations must remain unresolved; identical labels require contextual disambiguation. The 186-country-code breadth demonstrates global source distribution, not equal regional coverage or complete worldwide recognition.

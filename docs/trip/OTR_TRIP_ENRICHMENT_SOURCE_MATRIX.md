# OTR Trip — Data Enrichment & External Source Matrix

**Status:** Working architecture note for later batch integration  
**Snapshot date:** 2026-10-03  
**Purpose:** Consolidate the external data that OTR may use to enrich user-entered/imported Trip content, and classify each capability by likely cost/source before we integrate providers in one coordinated pass.

## 1. Working principles

1. **User input/import is evidence; enrichment is a separate layer.** Never silently overwrite the original value extracted from email/PDF/photo/manual input. Keep provenance and `last_refreshed_at`.
2. **Do not make users type data we can deterministically derive.** Example: `NZ5069 + 2026-12-14` should be enough to enrich route and scheduled times.
3. **Refresh by volatility, not uniformly.** Airport metadata can be cached for months; flight schedules should refresh occasionally; live status only needs aggressive refresh near departure.
4. **Local SDK first where it is good enough.** OCR, barcode scanning, location, calendar/date parsing and some map/search functions should avoid paid cloud calls when possible.
5. **Paid API spend should map to user value.** Basic structured itinerary enrichment can be a base-product cost; expensive live monitoring/alerts can sit behind a paid tier later.
6. **Provider-neutral adapters.** Domain code should consume normalized OTR objects (`FlightEnrichment`, `PlaceEnrichment`, `WeatherSnapshot`, etc.), not provider-specific payloads.

## 2. Enrichment source matrix

| Domain / trigger from user input | What OTR should auto-fill or refresh | Best source class | Cost expectation | Apple / Android local or platform SDK | Free / open alternative | Refresh policy | OTR recommendation |
|---|---|---|---|---|---|---|---|
| **Flight number + date** | Airline, origin/destination, scheduled departure/arrival, duration, terminal/gate if supplied, aircraft type, status | Commercial aviation data API | **Paid for commercial production**; low-to-moderate for schedules, higher for live/status | No universal OS flight-schedule database | Some providers have dev/free tiers; unsuitable as long-term commercial dependency | At creation; then ~30d / 7d / 48h; live window close to departure | **Must-have base infrastructure.** Buy one provider, cache aggressively, keep imported vs provider values separate |
| **Live flight monitoring** | Delay, cancellation, estimated/actual times, gate/terminal changes | Commercial aviation API / push feed | **Paid, higher-cost** | Notifications are local once OTR has the data | No reliable global free source | Start only near departure; back off after arrival | Later paid/pro capability unless cost proves trivial |
| **Airport code/name** | Airport name, city, country, coordinates, timezone, basic metadata | Static/open dataset + flight provider | Mostly **free** | MapKit / Android maps can resolve place data, but not a canonical aviation database | **OurAirports** public-domain airport dataset | Cache for months; periodic dataset refresh | Ship locally / server-cache OurAirports; cross-check provider data for active flight records |
| **Airline code/name** | Airline display name, ICAO/IATA codes; optional logo | Flight provider + curated metadata | Usually included in paid flight API; logos may have separate licensing | None | Curated/open metadata exists but branding/licensing must be reviewed | Very infrequent | Store normalized airline metadata; do not make logos a blocker |
| **Aircraft type** | ATR 72 / A320 etc., generic equipment info | Flight provider | Usually included with aviation API | None | Public aircraft code tables exist | Per flight record; no frequent refresh | Nice-to-have enrichment, not core user input |
| **Uploaded photo / screenshot / PDF** | Text, flight numbers, dates, addresses, booking refs, QR/barcodes | **On-device OCR first**, then semantic parser | Local OCR = **no per-call fee**; optional LLM semantic extraction may cost | **Apple Vision/VisionKit**; **Google ML Kit** on Android | Both platform approaches avoid cloud OCR cost | One-time on import; re-run only on user request/new asset | **Must-have.** Treat file upload as an ingestion source, not just an attachment |
| **QR / boarding pass barcode** | Booking/barcode payload, flight identifiers where encoded | On-device barcode SDK | **Free/local** | Apple Vision/VisionKit; Google ML Kit | Same | One-time scan | Add after basic import; extremely cheap and privacy-friendly |
| **Hotel / lodging name or address** | Canonical place, coordinates, formatted address, phone/website, POI identity | Maps/Places provider | Apple native can be low marginal cost; Google Places is usage billed after free caps | **MapKit local search / place search** on iOS; Google Maps/Places SDK on Android | OSM/Nominatim for geocoding, but public endpoints have usage policies and weaker commercial guarantees | On creation; refresh rarely | Use platform map search for UX; normalize to OTR place identity. Do not depend on hotel booking API for already-booked stays |
| **Hotel live availability / rates** | Current room availability/prices, rebooking | OTA / hotel inventory API | **Paid / affiliate / contractual** | None | No global production-grade free source | Only on explicit user request | **Not base itinerary scope.** Consider later booking/affiliate feature |
| **Restaurant / attraction / POI name** | Address, coordinates, opening hours, phone, website, place category, photos | Places API | Often **paid/usage billed** for rich details; basic Apple native search may be enough | MapKit search/places on Apple; Google Places on Android | OSM can cover location/category but not consistently rich business data | On add; opening hours only refresh near visit if needed | Basic place identity in base; rich business details only when useful |
| **Address / destination text** | Geocode to coordinates, normalized address | Map geocoder | Apple native: no normal per-call billing beyond membership but throttled; Google billed after free cap | MapKit geocoding/search; Android Geocoder/Google Maps | Nominatim/self-hosted geocoder | On creation/edit | Platform SDK first; provider abstraction for cross-platform consistency |
| **Route between itinerary items** | Distance, travel time, walking/driving/transit route | Maps routing API | Apple native usable without normal per-request billing; Google Routes usage billed after free cap | MapKit Directions; Android/Google Maps Routes | OSRM/Valhalla/OpenRouteService can be self-hosted/open | Compute on demand; refresh ETA near departure if traffic-sensitive | Base: deep-link/open system maps + lightweight ETA. Full routing can wait |
| **Public transit stop/route** | Scheduled departures, service alerts, realtime vehicle/arrival | Agency GTFS / GTFS-Realtime where available | Often **free/open**, but fragmented | Native map apps can provide directions but not a normalized OTR feed | **GTFS / GTFS-Realtime** official agency feeds | Schedule cached; realtime only around travel | Build regional adapters later; no universal global assumption |
| **Rail journey** | Timetable, station codes, platform/status where available | Operator / aggregator APIs; sometimes GTFS | **Mixed, often paid/contractual** globally | Maps may route, but not authoritative ticket/train status | Some national/open feeds | Creation + pre-trip refresh where provider exists | Do not promise universal rail status in v1; support manual/import + regional enrichment |
| **Ferry / water taxi / cruise** | Operator, ports, schedule/status | Operator-specific / aggregator / GTFS in some regions | **Fragmented; often no universal API** | Maps can resolve ports/places | Some agency/operator feeds | Near-trip only | Start from imported/manual facts; enrich only where a provider is available |
| **Weather for destination/day** | Forecast, temperature, rain/wind, alerts | Weather API | Apple WeatherKit includes substantial monthly quota; extra calls paid. Commercial alternatives also paid | **WeatherKit** on Apple; REST usable cross-platform | Open-Meteo free endpoint is non-commercial; commercial service requires paid plan | Start ~10–14 days before date; increase near trip | Strong candidate for shared service. WeatherKit is attractive for early scale |
| **Timezone from place** | IANA timezone, UTC offset on event date incl. DST | Local timezone boundary dataset or map provider | Can be **free/local**; Google Time Zone usage billed after cap | OS timezone libraries handle offsets once zone ID is known | Embed open timezone-boundary dataset / library | Resolve once when place changes; recompute offset by date locally | Prefer local/offline lat/lon→timezone mapping to avoid per-item API cost |
| **Currency by destination** | Likely local currency, currency metadata | Static ISO data + place country | **Free/local** | Local locale/currency data | ISO 4217 curated dataset | Resolve once | No paid API needed |
| **FX conversion / journey valuation** | Daily reference FX, historical rate, fallback valuation | Reference FX API | **Free is viable for reference rates** | No OS FX source | **Frankfurter** is free/open and commercially usable; source terms still apply | Daily cache; historical immutable once captured | Continue current OTR reference-rate strategy; cache/server project as already designed |
| **Visa / passport / entry requirements** | Visa required, passport validity, transit rules, health/document requirements | Timatic-class travel rules provider / official government sources | **Paid/enterprise** for reliable global normalized rules | None | Government sites are free but fragmented and hard to normalize | Refresh close to trip and on user request | **Do not build from scraped government pages in v1.** If offered as product feature later, budget for a licensed source |
| **Travel advisories / destination safety notices** | Government advisory level/text | Official government feeds/pages | Usually **free public information**, but country coverage is fragmented | None | NZ MFAT SafeTravel, US State Dept, UK FCDO, etc. | Daily or on trip open | Later feature; aggregate carefully with source attribution, avoid inventing a single universal “risk score” |
| **Local public holidays** | Holiday names/dates affecting closures | Country calendars / public datasets | Usually **free/open or cheap** | OS calendar does not provide a globally reliable holiday database to apps | Public holiday datasets/APIs | Cache yearly | Nice-to-have; can be bundled/static for major countries |
| **Events / concerts / attractions** | Event time, venue, ticket URL | Event provider APIs | Mixed; usually free developer tier then paid/partner | Maps resolves venue only | Ticketmaster-style APIs / public feeds vary | On user search only | Not core itinerary enrichment; defer |
| **Car rental booking** | Depot address, opening hours, booking metadata | Booking email/import + place API; inventory API if searching | Place enrichment low/medium; live inventory commercial | Maps place lookup | None universal for inventory | Imported booking mostly static | Base product should enrich booked rental location, not become rental search engine |
| **Local transport to/from airport** | ETA, directions, taxi/public transport options | Maps routing / local mobility providers | Maps cost as above; ride-hail APIs often partnership-based | Deep links into Apple Maps/Google Maps/Uber/etc. | GTFS where available | On demand | Start with map/deep-link actions; no need to buy a “global ground transport API” initially |
| **Airport indoor maps** | Terminal map / navigation | Airport/operator/indoor-map provider | Often proprietary/partner data | Apple Maps may expose airport place/indoor map in supported locations | No reliable universal open source | On demand | Do not build custom global airport-map dataset; deep-link to system maps first |
| **Carbon footprint** | Estimated CO2 for flight/drive | Calculation model or commercial emissions API | Can be **free/local calculation** or paid for audited methodology | None | DEFRA/ICAO-style public factors can support an internal estimator | Recompute if route/equipment changes | Nice-to-have; internal estimate sufficient unless claims need certification |
| **Phone / website / contact action** | Tap-to-call, open website, email operator | Place provider + imported booking content | Usually included with place detail tier | Native OS handles call/mail/web action | Imported data | Rare refresh | Use existing source first, query place details only when missing |
| **Calendar export / reminders** | Add itinerary item to calendar, alarms | Local device framework | **Free/local** | EventKit on Apple; Calendar Provider / intents on Android | — | User-triggered | Local integration only; no external API |
| **Current location / geofence context** | Distance to next item, leave-now calculation | Local location SDK + routing | Local location free; route/traffic may incur provider cost | Core Location / Android Location | — | Only when user enables it | Opt-in; do not poll location continuously by default |

## 3. Recommended cost buckets

### A. Budget as core infrastructure from the start

These are capabilities where relying on users to maintain the truth would make OTR feel materially weaker than mature competitors:

- **Commercial flight schedule/status provider** — at minimum schedule lookup + later refresh.
- **A cross-platform place/geocoding strategy** — may use Apple MapKit on iOS and Google/another provider on Android behind one OTR abstraction.
- **Weather source** — WeatherKit is economically attractive at early scale because Apple Developer membership includes a large monthly quota.

### B. Use local / included platform capability first

- OCR / text recognition from screenshots, photos and PDFs.
- Barcode / QR recognition.
- Current location.
- Calendar/reminders handoff.
- Basic map display, local place search and directions on Apple platforms.
- Timezone/date arithmetic once a timezone ID is known.

### C. Free/open data is good enough for the base product

- Airport static metadata: OurAirports.
- FX reference rates: Frankfurter / central-bank reference feeds.
- GTFS/GTFS-Realtime where transport agencies publish it.
- ISO currency/country metadata.
- Timezone boundary dataset if we embed it locally.

### D. Defer until product demand justifies a licensed/commercial provider

- Global visa/entry rules (Timatic-class data).
- Global rail/ferry realtime aggregation.
- Hotel/airfare inventory shopping.
- Alternate flights and seat inventory.
- Rich global airport indoor navigation.

## 4. Provider integration shape (for the later one-time integration phase)

Create provider-neutral interfaces before wiring vendors:

```ts
interface FlightDataProvider {
  resolveSchedule(input: { flightNumber: string; date: string }): Promise<FlightScheduleResult>;
  refreshStatus(input: { providerFlightId?: string; flightNumber: string; date: string }): Promise<FlightStatusResult>;
}

interface PlaceDataProvider {
  search(query: string, near?: LatLng): Promise<PlaceCandidate[]>;
  details(id: string): Promise<PlaceDetails>;
  route?(input: RouteRequest): Promise<RouteResult>;
}

interface WeatherProvider {
  forecast(input: { lat: number; lon: number; dateRange: DateRange }): Promise<WeatherForecast>;
}
```

Every normalized result should carry:

- `source_provider`
- `source_record_id`
- `fetched_at`
- `valid_for` / `expires_at` where appropriate
- `confidence` where the result comes from inference rather than an authoritative record
- raw imported/user value retained separately from the enriched/current value

## 5. Refresh tiers

| Volatility | Examples | Suggested policy |
|---|---|---|
| **Static / near-static** | airport coordinates, airline name, currency | cache months / bundle locally |
| **Slow-changing** | place contact details, hotel address, flight schedule months out | refresh on edit/open or milestone intervals |
| **Trip-sensitive** | weather, public transport timetable | only when trip enters relevant horizon |
| **Live** | flight status, gate, delay, realtime transit | activate close to travel; short TTL/backoff |

## 6. Current provider notes verified on 2026-10-03

- **Aviationstack:** commercial plans include flight schedules/future flight and realtime data; current public pricing page shows commercial tiers starting at 10,000 requests/month, while the free plan is personal/non-commercial.  
  Source: https://aviationstack.com/pricing
- **FlightAware AeroAPI:** usage-based commercial aviation API with endpoints for current/historical flight status and alerts; pricing varies by endpoint/result set.  
  Source: https://www.flightaware.com/commercial/aeroapi/
- **Apple MapKit:** native MapKit provides search, geocoding, places, directions and ETA. Apple documentation notes server-backed routing and throttling; Apple staff guidance has historically stated no native per-call charge beyond Developer Program membership for normal app usage.  
  Sources: https://developer.apple.com/maps/ ; https://developer.apple.com/documentation/mapkit/mkdirections
- **Google Maps Platform:** Places, Geocoding, Time Zone and Routes are usage-billed after product-specific free usage caps.  
  Source: https://developers.google.com/maps/billing-and-pricing/pricing
- **WeatherKit:** Apple Developer Program membership currently includes **500,000 calls/month**, with paid tiers above that.  
  Source: https://developer.apple.com/weatherkit/
- **Open-Meteo:** public free API is for non-commercial use; commercial use goes through paid customer API plans.  
  Source: https://open-meteo.com/en/pricing
- **OurAirports:** downloadable airport datasets are released to the **Public Domain**.  
  Source: https://ourairports.com/data/
- **GTFS / GTFS-Realtime:** open standards for published schedule and realtime transit data; availability depends on each agency.  
  Source: https://gtfs.org/documentation/overview/
- **Frankfurter:** free/open exchange-rate API; its FAQ states commercial use is allowed and there are no monthly/daily quotas, with fair-use rate limiting.  
  Source: https://frankfurter.dev/
- **Apple Vision/VisionKit:** on-device OCR/text recognition; VisionKit can identify text, URLs, addresses, phone numbers, flight numbers, dates, times and barcodes.  
  Sources: https://developer.apple.com/documentation/vision/recognizing-text-in-images ; https://developer.apple.com/documentation/visionkit
- **Google ML Kit:** free on-device SDK; text recognition and barcode scanning can run locally/offline.  
  Source: https://developers.google.com/ml-kit/guides

## 7. Decision to carry into Trip implementation

**Do not integrate these vendors piecemeal while the Trip domain is still moving.** During current Trip work, only define stable enrichment contracts, provenance fields, cache/TTL semantics and refresh triggers. Once the Trip entity model and ingestion pipeline stabilize, perform a dedicated provider-selection and integration phase so flight/maps/weather/transit/visa dependencies are reviewed together for cost, licensing, privacy, caching and fallback behavior.

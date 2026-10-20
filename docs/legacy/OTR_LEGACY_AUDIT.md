# OTR Legacy Audit

Legacy repository audited: `/Users/xoery/Project/otr`.

This audit is for domain and backend understanding only. Do not modify the legacy repository and do not migrate Web UI assumptions into OTR Mobile 2.0.

## Executive Summary

OTR Web contains useful domain knowledge for trips, journey members, itinerary events/reservations, ledger entries, currencies, capture routing, media assets, storage providers, and background jobs. Most feature data access is implemented directly against Supabase from Web-oriented modules. Mobile should reuse concepts and algorithms, not the UI or the direct database access pattern.

## Reusable Data Models

Trip:

- Legacy `Trip` maps to a journey container with name, destination, dates, cover image, creator, and photo storage status.
- Creation currently also creates a default journey ledger.

Journey Member:

- Useful model for linked/unlinked/invite-pending travellers.
- Roles include owner, group member, guest.
- Invite and email-claim flows are useful backend concepts.

Itinerary:

- Legacy separates itinerary events and reservations.
- Events include event type, location, planned start/end, booking reference, URL, order, source text, confidence, review state, participant status, and item status.
- Reservations cover flight, train, hotel, car, ferry, tour, restaurant, and other.

Ledger:

- Strong reusable concept set: journey ledger, exchange rates, ledger entries, participants, split method, balances, settlement suggestions.
- Existing category/accounting/status enums are a good baseline.

Media:

- `MediaAsset` already captures provider paths, thumbnails, previews, originals, EXIF, OCR, AI status, duplicate/blur metadata, and storage tier.
- Useful for future Photo Drop and document/ticket thinking, but mobile needs a cleaner TravelDocument domain.

Capture:

- Capture AI types include intent detection, routing, action graph, parser confidence, missing information, and proposed action.
- Capture2 safe classifier has practical local routing for question/navigation/expense/planner/deferred.

## Reusable API And Backend Concepts

Useful existing Next API areas:

- Capture transcription, config, detect, events.
- Media direct upload create/complete/status.
- Media ingest and cleanup.
- Background jobs and batches.
- Google Drive connect/upload/health.
- Geocode, route, location resolve/manual pin.
- AI parse itinerary/read image/recommend day route.

These are not a complete mobile contract. Most trip, itinerary, member, and ledger operations currently appear as Supabase client calls rather than stable backend API endpoints.

## Reusable Auth

Legacy uses Supabase Auth with Google OAuth and email OTP. It also has session persistence fallback logic and Google Drive connect scopes.

Mobile can reuse the identity-provider concept, but should wrap it behind an OTR auth/API boundary. Feature code should not call Supabase Auth directly.

## Reusable Parser / Capture Logic

Reusable:

- Intent vocabulary.
- Local pre-parse ideas for amount, currency, dates, times, keywords, and input types.
- Complexity routing between local and LLM parsing.
- Action graph with missing mandatory/optional fields.
- Safe local classifier for Chinese/English travel commands and expense recording.

Needs redesign:

- Mobile local-first capture records.
- Offline capture queue.
- Document/ticket routing.
- Confirmation UX.

## Reusable Ledger Logic

Reusable:

- Ledger categories and shared/statistics-only accounting mode.
- Equal/custom amount/custom percentage splits.
- Original currency plus base settlement currency.
- Exchange rate date/source.
- Summary concepts: paid total, owed total, stats-only total, balance, settlement suggestions.

Needs redesign:

- Offline mutation model.
- Edit history.
- Conflict resolution for amount/payer/split changes.
- Household/group split.
- Export API.

## Reusable Journey / Itinerary Logic

Reusable:

- Trip day, event, reservation, participant, rating, status, confidence, and review fields.
- Floating date/time formatting helpers should be reviewed for timezone behavior.
- Permission checks around owner/member/item creator are useful backend policy references.

Needs redesign:

- Today-first mobile IA.
- Offline event ordering.
- Travel document linking.
- Navigation metadata.

## Reusable Media Infrastructure

Reusable:

- Storage provider abstraction.
- Google Drive folder/file concepts.
- Thumbnail/preview/original separation.
- Background job and batch concepts.
- Direct upload staging and server-side processing.
- EXIF GPS parsing and media variant generation.

Needs redesign:

- Mobile local asset references.
- Persistent upload queue.
- Ticket/document offline cache.
- Photo Drop delayed original upload.
- Native PhotoKit/MediaStore integration.

## Web-Only Content To Discard

Do not migrate:

- Next.js pages and layouts.
- Sidebar and desktop navigation.
- CSS and Web component hierarchy.
- Chat UI.
- Story UI.
- Poster and memory-shot UI.
- Highlights UI.
- Independent map homepage.
- Desktop-oriented capture modal patterns.

## Potential Technical Debt

- Direct Supabase calls are spread through feature modules, making it easy to bypass a backend contract.
- Trip/Journey naming is mixed.
- Media, memory, chat, and document concepts are intertwined.
- Upload lifecycle has runtime/browser-only paths that are not durable enough for mobile.
- Several backend routes are specialized for Web content-generation workflows rather than mobile operations.
- Ledger edit history and conflict semantics are not yet explicit.
- TravelDocument is not a clean first-class model.
- Offline-first assumptions are not present in the legacy Web architecture.

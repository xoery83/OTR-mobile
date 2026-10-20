# My Trips large-text follow-up — 2026-10-14

Base: qualified My Trips Push21 `d336614c219517d10681fc734dbbf692f30206db`.

Independent A1A review at the iOS `accessibility-large` content size found three visible layout defects after a hot content-size change: the native Trip title collapsed to `T`, the Shell My Trips label clipped against its destination tile, and the cover picker broke Mountain midword. After a true app close and reopen at the same size, the native title and Shell label rendered fully, while Mountain still broke midword. Dark appearance, long-name card navigation, full accessibility labels, and manual City cover persistence through the real cold reopen passed. The first two defects are therefore hot-resize issues; the picker defect persists on fresh launch.

This narrow follow-up keeps the native Tabs header and existing routes. At large text only, the Trip title uses a left-aligned native header title slot with enough intrinsic width; the Shell destination gains vertical room; the three embedded cover choices become full-width rows with readable labels. Ordinary text geometry, account data, cover selection, and all other tabs retain their existing behavior. No font scaling is disabled.

Author checks: focused Shell/navigation tests, typecheck, UI guard, scoped lint and format. Independent functional review and exact-candidate A1A hot-resize and fresh-launch picker retest remain required before main intake. The network was on during the cover cold reopen, so offline behavior remains unverified. No accepted Day or remote-inventory claim follows from this layout change.

# ER02 native header and Home right-swipe candidate

Base15b4e64/product75fa6a6; new isolated source keeps proven preview immutable. Day scrolling under native title caused actual text-on-text. Duplicate Frame experiment was rejected/removed before commit; opaque surface experiment was likewise rejected/removed before commit. Final candidate reuses existing translucent `floatingSurface` (both themes alpha0.68) behind native systemMaterial. Same underlap, inset, title, Menu/Search and no custom chrome.

DS09 Native75fa6a6: two Home left-edge rightward drags did not return; Global Menu→All Trips correctly returned My Trips. The installed iOS26+ native screen implementation gates interactiveContentPopGestureRecognizer on effective full-screen-swipe, while root Trip Home explicitly set false. Candidate enables the existing native gesture only for immersive Home; Day explicitly remains false, retaining Focus/Flexible gesture ownership. No custom responder, routing, permission or data mutation.

Forty-five targeted caller tests, typecheck, scoped ESLint, UI guard, Prettier/diff PASS. Independent incremental review PASS after both rejected alternatives were removed. Native material readability/translucency, Home edge/rightward return, Widget horizontal swipe and My Trips position preservation remain NATIVE_PENDING; no inferred Runtime PASS.

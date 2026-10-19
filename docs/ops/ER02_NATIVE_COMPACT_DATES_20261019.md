# ER02 DS03 Chinese native range correction

Product23f8c78, isolated `/private/tmp/otr-er02-compact-dates-20261019`, branch `codex/er02-compact-dates-20261019`, base3c31934/product87de81e. Coordinator confirmed no DayFeedShell writer and assigned formatter/direct tests only. Original87de preview source was frozen.

Actual87de normal Menu → Language → 简体中文 retained the same Japan reading position (Feb3–4) but native title repeated year/month and truncated as `2027年2月3日–2027…`. Before-fix screenshot/AX `er02-native-20261019/87de81e-zh-range-truncated.png/.ax.txt`. Locale was restored normally to English before reload. No business data saved.

Root cause: when present, Intl.formatRange bypassed the existing locale-parts compressor. Node reproduced a full repeated Chinese year/month range; a regression test failed before the change. Removed only that shortcut, reusing existing locale-part sharing for EN/ZH and preserving explicit cross-year endpoints, single-date output and UTC-noon civil-date formatting. No Reader/TIME/query/zone/navigation change.

54 directed tests (2 suites), typecheck, UI guard, scoped ESLint/diff and independent Review PASS. Current-source Native correction remains pending until actual post-reload evidence is added; tests/build alone are not Runtime PASS. Existing four owning interface blockers, Release/offline gate and Owner acceptance remain open.

## Actual Native / remaining gate

AD5 original Host/account/database remained unchanged. Loaded product23f8c78 via localhost8083 PID96947/session86865, verified cwd, private cache `/private/tmp/otr-er02-metro-cache-20261019/23f8c78`. Normal icon → My Trips → Japan Home → Day restored actual Day3; Chinese single-date title rendered completely. No business Save, auth change or new data.

A post-fix multi-date Chinese title was not captured. Dense Japan scrolling landed inside single-day content; those screenshots do not prove range PASS. Existing Nelson summer Home metadata remained visible but Home→Day returned the real repository-unavailable state, including after Home→Day retry and normal restoration to English. Evidence `23f8c78-nelson-unavailable.ax.txt` and `23f8c78-nelson-en-unavailable.ax.txt`. Do not attribute this to locale/formatter or override Reader validity to obtain a preview. Coordinator received the exact normal UI path for Reader/Trip Context handoff. Earlier75fa/3278 Nelson results are historical and do not qualify23f8. Chinese range Runtime remains UNVERIFIED; no wholeDS03 PASS.

English original preference restored. No physical offline, Release installation or wider matrix performed. Four owning interface blockers remain. Rollback loaded JS to frozen87de81e source `/private/tmp/otr-er02-edit-tint-20261019` and its existing private cache, using normal App close/reopen and only8083 Metro; never reinstall/reset or copy Session. Original3278460 and043 sources remain too. Coordinator owns unified Tracker/CURRENT_STATE updates.

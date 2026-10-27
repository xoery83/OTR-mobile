# Activity Progress DEV paging

Owner requested autonomous operation after Device Hub drag repeatedly flung the long Progress view between its ends. Manual scrolling was possible, so a native scroll failure has not been proven. This patch supplies deterministic DEV-only scrolling; it does not claim to repair all physical gesture behavior.

Source30f9c51e / Host2465e444: fixed canonical Scroll up/down buttons above the existing ScrollView; each click moves80% of measured viewport, clamps0…contentHeight-height and uses scrollTo(animated:false). onScroll also tracks manual movement. English/Chinese catalogs supplied. NonDEV has no buttons; no Source Review/Confirm, identity, Backend or authority changes. Ordinary read-original/review/NEW/confirm remains required.

CaptureProgress+Composer23tests PASS (prior DEV-controls-absent RED); P4 existing chooser49tests PASS (prior P4 HOME_ITEM_DATE_UNAVAILABLE RED), four combined suites72PASS in actual Metro source. Types/scopedlint/UIguard PASS; both focused independent reviews NO_BLOCKER. AD5 click paging/layout and P4 Day/cold are pending current Native Mirror foreground handback.

P4 view fix Source1fe65e7f / Hostf78ade78 only addsP4 to the existing explicit-date/viewing-zone fallback after fresh scope/epoch/Item/revision validation; no persisted missing zone is inferred. Native uniqueWriter approved this exact handoff and was sent the fixed SHA for later intake.

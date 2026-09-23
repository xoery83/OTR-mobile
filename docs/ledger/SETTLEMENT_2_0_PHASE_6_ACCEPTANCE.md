# Settlement 2.0 Phase 6 Acceptance

Date: 2026-09-23

Status: **READY WITH NON-BLOCKING LIMITATIONS**

Phase 6 performed release validation only. It added no product feature, changed no financial semantics, and did not access Production.

## Automated validation

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run backend:build`: pass; `dist/server.mjs` built successfully.
- `npm run test`: pass, **92 files / 390 tests**.
- `npm run supabase:validate`: pass; two clean resets and two complete **21-file / 455-assertion** pgTAP runs.
- Schema diff: empty. Baseline: 103 tables, 1,434 columns, 788 constraints, 339 indexes, 114 functions, 106 triggers, 103 RLS tables, 178 policies, and 3 storage buckets.
- Baseline lineage checksum: `d5d5ce846e4b731bb0d6b3af3ccb1575d28f02e8dbb7a888c267ad4b898f645b`.
- Baseline schema checksum: `c85f4cad34cbdc8ec5bc4c10872db3b4cb0eb73474cd226c66a2974b370fce79`.
- `git diff --check`: pass.
- `npm run format`: the same five documented pre-existing files fail; no Phase 6 file introduced a formatting regression.
- Expo Doctor: **20/21**. The only failure is the existing SDK 57 patch-version mismatch across 13 Expo packages.

## Hosted Dev

- `https://api-dev.xoery.art/health`: `ok`, environment `development`.
- Linked migration dry-run: current, no pending migrations.
- Local and running `/app/server.mjs` SHA-256: `1ef956364baffcff7a5ba964ab8dab3a19bf79adae12bd4f4e093a556cff9e84`.
- Running image: `sha256:e11d4b4a48e95ea00c3f74bf30b58b2f6f0faf43df93cfcb4f584f40126a2a77`.
- Existing Phase 1B, 1C, 2, 3A, 3B and 4 acceptance scripts passed sequentially: **34 + 14 + 18 + 19 + 34 + 25 = 144 assertions**.
- Evidence includes owner/counterparty/organizer visibility, unrelated-user denial, historical-member reads, independent two-sided Personal Payments, no-FX save, private multi-attachment access, exact checkpoint/delta behavior, stale rejection, finalized-Expense protection, immutable correction successor/history, replay idempotency, and canonical/legacy isolation.
- No Production connection or access occurred.

## Simulator

- Device: booted iPhone 17 Pro, iOS 26.5.
- Clean workspace Release build: pass; 116 targets.
- Bundle SHA-256: `ce58060256edc8f4e2c374e5300513da6d942781c5cf3b382f1843b4d6c3e1a2`.
- Installed over the existing app without uninstalling or clearing data; launch and cold launch passed without forced login.
- Preserved SQLite evidence: migration v30, 549 Expenses, 14 Journeys, 17 actor-context rows, and five nonterminal durable operations.
- The cached Settlement rendered the final balance, paid/share explanation, needs-attention state, organizer `Make corrections`, large values, long member names and Ledger navigation.
- No Simulator defect was found or fixed.

## Physical iPhone

- Device: iPhone 16 Pro (`iPhone17,1`), iOS 26.6.
- Clean workspace Release build: pass. The first installed build's development provisioning profile expired during the run; a fresh Xcode-managed profile was generated with `-allowProvisioningUpdates`, trusted on-device, and installed over `com.xoery.otrmobile` without uninstalling or clearing data.
- The refreshed install retained the same app data container UUID, both remembered accounts, the active login, populated My Ledger history and the first pending Personal Payment. This was a signing/tooling incident, not a product-code defect.
- Existing login remained valid. Populated My Ledger history remained available, and the cached `Europe 2026 UI Polish` Journey opened after selection.
- Online UI smoke passed for Ledger Spending, Settlement Summary, final balance, Review attention list, member/category data, large values, long names, and organizer `Make corrections`.
- With OTR-only cellular data disabled, Account A cold-started without forced login, rendered cached Settlement data and showed the explicit offline state.
- Account A created a CNY 3.00 Personal Payment (`P6 offline 20260923`) locally. It survived an offline force restart as `Saved here · waiting to sync`; reconnect produced exactly one `Synced` record and left canonical Settlement unchanged.
- Account A then created a separate CNY 4.00 record (`P6 isolation 20260923`) offline. Offline A→B→A switching passed: Account B entered `AUTHENTICATED_OFFLINE`, had zero pending operations and showed only its own `Synthetic Baseline Journey`; Account A's Journey and record did not leak.
- Returning to Account A offline restored `Europe 2026 UI Polish`, the waiting-change indicator and exactly two Personal Payment records. The final balance remained `¥8,549,355.41`.
- Final reconnect showed both CNY 3.00 and CNY 4.00 records exactly once as `Synced`. The CNY 4.00 record's canonical transfer remained Received with Paid `¥1,452,930.40` and Remaining `¥0.00`; Personal Payment did not alter canonical transfer math.

## Security and isolation

- Hosted Dev proves owner/counterparty/organizer access, unrelated-member denial, cross-Journey rejection, historical-member read boundaries, and account/Journey-scoped durable operations.
- Journey A/B isolation is covered by repository and Hosted Dev assertions; no cross-Journey mutation was observed.
- Physical offline A→B→A switching proved account-local auth, Journey cache and pending-write isolation. Account B could not see Account A's Journey or Personal Payments, and Account A recovered its pending record after switching back.

## Financial integrity

- Personal Payment did not change canonical Settlement in any Hosted acceptance run.
- Independent payer/receiver records remained separate; neither overwrote or disputed the other.
- Old final versions, balances, transfers and root digest remained immutable after correction.
- Correction created a new successor and current version without rewriting the predecessor.
- Legacy Payment remained separate and unchanged.
- Review checkpoints and Human Findings did not alter Settlement math.
- Phase 0.5 ordinary update/delete/restore protection remained active; only the approved correction-successor path changed current economics.

## Defects and limitations

- No new product defect was found; no product code changed.
- The expired development provisioning profile interrupted one device launch. Re-signing and an over-install restored launchability without data loss; this is resolved release-tooling evidence, not a product blocker.
- Non-blocking existing limitations: embedded Ledger section strip is tap-driven rather than free-scroll-tracked; Expo Doctor has the documented patch-version warning; repository-wide Prettier reports the same five pre-existing files.

## Release gate

**READY WITH NON-BLOCKING LIMITATIONS**

Phase 6 acceptance does not authorize Production rollout. Production still requires separate explicit authorization.

**SETTLEMENT 2.0 PHASE 6 COMPLETE**

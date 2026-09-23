# Settlement Final-version revision acceptance

Date: 2026-09-23  
Environment: Hosted Dev only (`tuqigdxrvrerfewsxqgm`, `api-dev.xoery.art`)  
Result: **Automated end-to-end and signed Simulator presentation PASS; physical launch pending unlock**

## Fixture

- Journey: `Settlement Final Versions Acceptance e6e0955d`
- Journey ID: `e6e0955d-7f3c-4919-8801-8e6b4e05ce9f`
- Organizer member: `be45aed1-c6f5-4095-a39f-229d02989321`
- Regular member: `37991c3a-534c-4d99-bf54-a8853b45d1f4`
- Script: `scripts/supabase/validate-settlement-final-versions-hosted.ts`

## Version evidence

| Version | ID                                     | Kind / sequence | Expected A/B balance | Digest                                                             |
| ------- | -------------------------------------- | --------------- | -------------------- | ------------------------------------------------------------------ |
| V1      | `caf23384-1c13-4719-9281-67cd54ac9bae` | ROOT / 0        | +NZ$30 / -NZ$30      | `0f3d925e35f41117bbf8c32ef6345ec10de057976d31b64dcf485b69156707cf` |
| V2      | `42484eaf-d5db-4d5d-8852-fb300c49e0cd` | ADJUSTMENT / 1  | +NZ$45 / -NZ$45      | `b59dad7a04c3ec6e25b8a5b671902f78519ae82ee9d322f55e83e18823ba6167` |
| V3      | `8cac816d-38ed-41ff-bcbf-f2258732ad85` | ADJUSTMENT / 2  | +NZ$55 / -NZ$55      | `e4f5148ca78eeb59d88e98bec638d3d9a776d7b61374bcde1f8e0eeb62634fe4` |

## Passed checks

- 49 Hosted Dev assertions passed against a fresh two-role Journey, including Mobile
  bootstrap contract parsing and the post-correction personal statement +NZ$55 check.
- V1 included E1/E2 and excluded E3; member authorization and protected-edit rejection passed.
- Human Review note and author identity persisted; it did not block Organizer Final.
- Post-Final E4 appeared as one `NEW` change and V2 converged under the same root.
- Protected E1 correction created successor `4a387478-38ea-4972-a676-b0c2f880429a`; V3 retained V1/V2 unchanged.
- Post-V3 EXCLUDED E5 and one Personal Payment left the V3 digest unchanged.
- Server lineage is exactly ROOT 0, ADJUSTMENT 1, ADJUSTMENT 2; input counts are 2, 3, 3.
- TypeScript, ESLint, Backend bundle, `git diff --check`, and 92 Vitest files / 402 tests pass.
- Production was not accessed or changed.

## Device gate

- A signed iPhone 17 Pro Simulator Release bootstrapped the retained Journey from an
  empty local cache and persisted all three immutable versions. Summary converged to
  V3 with Paid NZ$150.00, Share NZ$95.00 and balance +NZ$55.00.
- Summary rendered the required order: Current balance, `No changes since last
confirmation`, then Last confirmed version #3 with compact correction/history links.
  An exact Current personal statement match takes precedence over a stale preview
  digest, while pending local financial operations still force Current-with-changes.
- Adjustment snapshots do not duplicate member-balance rows locally, so the device
  derives the selected member's confirmed paid/share/balance from that version's
  immutable inputs. This is the same arithmetic checked by the Hosted assertions.
- The final signed Release was installed over Leon's physical iPhone 16 Pro without
  uninstalling or clearing app data. Automatic launch was denied only because the
  phone was locked; physical visual/offline interaction remains the morning manual gate.
- Production was not accessed or changed.

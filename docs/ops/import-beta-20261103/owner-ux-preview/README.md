# Import Owner UX preview — AD5 build 126.15

Status: **read-only preview ready; new Import Golden Slice blocked by expired AI Source/Provider/Actor/price authority.** This build has no new paid call or new Item. It is the accepted 126.x Native/SQLite 76 baseline plus the reviewed Import Updates and Review controls. The unified Native 144/SQLite 77 build and later main read hint are not mounted here.

## Available now

1. Open OTR on AD5. It starts at **My Trips**. Select the existing synthetic **Universal Stage II Normal QA 20261025** Journey.
2. Open **Updates** and choose `universal-photo-activity-qa.png` (submitted 1 Nov, 19:26 NZDT). Its update is later, at 19:38. Both open the same retained Batch `794b02d7`.
3. Open the Batch's Results and scroll to the P1 `Harbour Photo QA Walk / 2026-11-02`. The saved status refers to the same Item `c59d3d03`; open the retained PNG original in native Quick Look. Tap the surrounding dark area if the Quick Look Close chrome is hidden, then close it.
4. Return to the Batch. Review, NEW and final Confirm remain disabled for this already accepted Item. Close Activity Progress using its header Close; the Updates list remains available.

The [Updates screenshot](../evidence/native-readonly-12615/01-updates-source-and-submission.png), [original preview](../evidence/native-readonly-12615/03-original.png), [disabled duplicate confirmation](../evidence/native-readonly-12615/04-after-original-disabled-review.png) and [device readback](../evidence/native-readonly-12615/READBACK.json) record the actual AD5 checks. Previous 126.13/14 checks also reached Personal Inbox, Trip Documents and the accepted P1 Day Feed, but those specific paths were not repeated after installing 126.15.

## Fresh input after authority renewal

Use the synthetic [text PDF](fixtures/universal-p6-activity-qa.pdf) (1,676 bytes, SHA-256 `f58061aa535c7a5585c4c953890c5d387cf20656cca7129e36861beb82ee1758`) or [PNG](fixtures/universal-photo-activity-qa.png) (42,630 bytes, SHA-256 `078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515`). The planned path is My Trips → Capture → choose file → Processing → Results → retained original → explicit Review/NEW → one formal Save → Day Feed → Documents/Updates. **Do not run fresh Analyze until the exact QA renewal is approved and activated.** Actual Provider attempt, cost, new Save and cold recovery still require new receipts.

## Known UX limits and safe recovery

- The old retained Batch can still show an account-level intake caption before its Trip hint resolves. Its Review and accepted Item are tied to the QA Journey; the newer bounded hint adapter is in main but not in this installed build.
- The retained Photo result displayed raw `VISUAL_CANDIDATE_UNVERIFIED` reasons. A local presentation fix is under review; it does not change sealed reasons or Admission.
- Import internal Documents/Inbox works on prior 126.13/14 checks; the shared App menu Documents destination is not yet wired. Optional detail reads can keep a loading label visible; latency has not been measured.
- If Results is temporarily unavailable, return through Updates to the **same Batch** and use Check processing status. Do not submit a replacement operation or assume a 503 means the model must run again. No reset, uninstall, auth copy or manual DB write is part of this preview.

Owner review can focus on navigation, source visibility, Review wording, document access and Updates timing. This package does not assert full new-import Native E2E.

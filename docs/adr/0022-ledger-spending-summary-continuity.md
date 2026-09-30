# ADR 0022: Spending and Summary horizontal continuity

Date: 2026-09-30
Status: Ledger Pager COMPLETE

Keep the Settlement controller and its four-page PagerView as one mounted
presentation unit. An outer two-page native PagerView can connect Spending to
that unit only while the shared header exposes the mode selector. When the
selector collapses, disable the outer pager's native scrolling; the inner
Settlement page 0 must then be the horizontal boundary. Verify this ownership
on the iPhone before retaining the design. If the outer pager exposes Spending
or steals Summary→Paid, stop rather than adding gesture interceptors.

Spending gets an in-memory body anchor and participates in the shared header
collapse model. Mode taps and page selection update the existing mode state;
native page position drives the selector's visual progress. No data hooks move
into pager pages, and no Backend, schema, Supabase, or financial logic changes.

The outer PagerView stays mounted with its two pages; its native scrolling is
disabled after the mode selector collapses. The inner four-page PagerView keeps
Summary as its page 0 and remains mounted across mode switches. The Spending
card now selects the embedded Settlement mode instead of pushing the separate
standalone Settlement route. Spending and Settlement now share one header
collapse ref and Animated offset while each keeps a separate body anchor. The
Spending header overlays its ScrollView, allowing a deep Spending body to be
restored without collapsing the header when Summary is expanded. Journey
changes remount the outer pager and clear both modes' UI anchors.

The owner tested the signed iPhone build: expanded Spending⇄Summary tracks a
slow finger drag, cancels and returns correctly, and preserves Spending's
reading position at a partially scrolled location. The mode selection fades
with native page progress. In collapsed Summary, an outward drag exposes no
Spending while Summary→Paid and rapid four-page swipes still work. No nested
gesture stealing, page mismatch, or visible header jump was observed. Five
Spending⇄Summary round trips left controller/pull/preview/sections/review
counts at `1/1/1/3/2` (zero delta). Deeper Spending content has the mode
selector offscreen, so the outer pager is disabled there by the approved
expanded-only interaction rule.

After that acceptance, the deep historical Spending anchor case prompted the
shared-anchor refinement above. The development provisioning profile expired
during this work; after the owner restored the Xcode account, a new signed
iPhone Release was built and installed without clearing app data. The owner
verified deep Spending body→Summary expanded→Spending restores the body while
keeping the header expanded. Slow drag cancellation, collapsed Summary's left
boundary, Summary→Paid, all four inner pages, and the Spending card entry also
passed again. Five further Spending⇄Summary round trips left all five load
counts unchanged; the owner did not transcribe the latest absolute values.
TypeScript, scoped lint, 51 relevant tests, formatting, diff check, and the
signed Release build pass. No simulator was used for Phase 2 acceptance.

## Phase 3 finalization

Anchors are UI-only refs. The Ledger route keys the native pager and embedded
Settlement shell by account generation and Journey ID. On account generation
change, focus handling cancels pending Ledger requests, clears prior projection
and UI anchor state, then mounts a fresh pager. Journey changes likewise remount
the pager and reset the shared collapse and Spending anchor. Settlement page
scroll refs clear on unmount; target-page preparation ignores a missing ref.
Unmounted screen refs are released by React. No anchor is written to SQLite or
AsyncStorage. The owner separately verified account switch, Journey switch,
offline use, and background/foreground on iPhone; these scenarios were not
repeated in finalization.

The latest signed iPhone Release measured controller/pull/preview/sections/review
at `2/2/2/6/3` before and after five Spending⇄Settlement round trips plus five
Summary→Paid→Shares→Payments→Summary rounds: increment `0/0/0/0/0`. The owner
passed one final smoke covering forward/reverse paging, cancelled slow drag,
collapsed Summary's outward edge, a deep anchor, and Search, Add Expense, and
Journey chooser entry. `settlementLoadMetrics` remains a module counter for
debug/test regression work; its UI row appears only with the existing debug
preference, and no swipe path increments it.

The tab Pressables are at least 58pt high, the indicator has
`pointerEvents="none"`, and the mode selector stacks vertically when the font
scale exceeds 1.5. The owner's large-text iPhone screenshots exposed clipped
mode/tab labels, Spending category and hero amounts, and Summary amounts. A
small presentation fix bounds navigation label scaling, gives large amounts
native single-line fitting, and stacks the affected rows at larger fonts. A
second signed iPhone screenshot check confirmed complete mode labels, readable
amounts, and aligned Summary selection; the owner then verified Mine/Group
stays on one line and the selected Summary label has no doubled text. Focused
TypeScript, lint, formatting, 52 related tests, and signed Release build pass.
A dedicated VoiceOver pass remains deferred. The Ledger screen file is large
because it contains existing Spending presentation; the pager coordination
and anchor logic remain localized, so finalization does not split routes or
feature files.

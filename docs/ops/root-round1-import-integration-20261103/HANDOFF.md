# Native + Import round1 integration rehearsal

From fixed a3cbf99b, only reviewed Import53a18c0b was cherry-picked as69800c05.
All13 Native product blobs exactly match db06bad2; both Import code/test blobs
exactly match53a18c0b. No intersection or unrelated product changes.

CURRENT_IMPLEMENTATION_STATE retains the complete a3cb/main/Native byte prefix,
then appends the truthful Import state. Actual Import27/scoped strict/lint/UIguard
pass; Native22/369 and owning reviews remain reused. No full build/device or
Owner acceptance is claimed. Root may recheck latest main for serial FF; Native/
Vision then owns the integrated full-main build and final device acceptance.

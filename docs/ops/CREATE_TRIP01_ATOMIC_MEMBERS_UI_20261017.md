# CREATE-TRIP-01 atomic Editor and read-only Members UI

Baseline: `d1709f4606ecf3d99e7f61efb863de698ac0fd3c`.
Branch: `codex/create-trip01-final-ui-20261017`.
Worktree: `/private/tmp/otr-create-trip01-final-ui-20261017`.

## Delivered

- Creator cover selection is an Editor draft. Save passes metadata and the actual
  persisted/draft cover tuple to the existing atomic repository operation. Cancel
  unmounts the draft. In-flight Save blocks dismissal and duplicate submission.
- Failed Save retains the draft and operation identity for the same retry;
  successful Save advances both baselines. Display fallback covers are not saved
  as if explicitly selected. Cover-only Save uses the existing owning contract.
- Non-Creator independent account-local cover selection retains its existing
  permission scope and immediate-save notice.
- Persistent Members entry opens a native read-only Sheet using the approved
  Setup aggregate. It shows actual names, exact current-Actor identity and only
  explicit LOCAL_PENDING status. Trip/account/generation changes remount the
  presentation scope; a hidden Sheet receives no roster.
- Existing owning implementations provide atomic writes, replay protection and
  Setup reads. No Repository, Sync, Schema or permission changes in this packet.

## Verification

- Directed Vitest run: 8 suites / 111 tests passed, including actual SQLite
  Editor atomic Save, rollback/retry identity, cover-only Save, cold reopen,
  actual four-person roster and account/context replacement checks.
- Component tests cover Cancel, saving dismissal guard, Creator drafts and the
  retained non-Creator cover path. Native primitives/hooks are mocked in these
  tests; this is not Native UX acceptance.
- Independent scoped review: PASS, no P1/P2 findings. Review covered draft
  lifecycle, stable intent, permission scope and roster privacy boundaries.
- Typecheck, scoped ESLint, Prettier and diff checks passed. UI foundation guard
  passed (124 representative UI files, 473 existing legacy occurrences).

## Remaining boundaries

No Simulator, GUI, Metro, installation, Push or main integration was performed.
Coordinator owns the serialized Native gate. Actual keyboard, native dismissal,
Sheet presentation and return navigation still require Native verification.
Members management, invitations, Hosted Person synchronization, photo cover,
Guest adoption and destination matching are not implemented by this packet.
CURRENT_IMPLEMENTATION_STATE and the delivery tracker remain Coordinator-owned.

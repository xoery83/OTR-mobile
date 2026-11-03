# Root ORIGINAL_ID_RESUME controller candidate

Base79518bbe. Only Root runtime/control-read and their tests change. Auth411ceee5
is a required owning dependency; its source is untouched. Tests compose the exact
411 qualifier bytes through an explicit private overlay, not a fabricated grant.

The first failure was UNKNOWN_EXECUTION_MODE. Add an explicit Root plan mode,
qualify-resume command and bounded SSH factory. The Backend selector remains
unchanged: no MODE env selects its existing fixed A/B QA authority. Sending the
new Root mode as Backend MODE would fail closed and is deliberately not done.

Resume retains the existing30min ceiling/10min constructor and exact identities,
adds normalD-120 plus hardD closure with existing rollback. The old RecoveryOnly
qualifier body is byte-identical, stillfalse/max15min; its SSH action is unchanged.
No SQL counts, new roles, auth issuer, invitation reset or scope platform.

27 pure controller +15 mocked SSH/actual411 qualifier tests pass; scoped strict
and Root-file lint/diff pass. This is dormant software, not authority or Hosted
PASS. New exact execution approval, current default/staged pins, real timers and
fresh A/B sessions remain Root/Auth responsibilities. No external actions here.

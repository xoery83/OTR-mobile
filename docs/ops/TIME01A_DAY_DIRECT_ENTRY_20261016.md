# TIME-01A — direct Day entry

Owner clarification (2026-10-16): a Day can have a planning date without a
resolved timezone. There is no prerequisite start-time/timezone form before Day.

- Trip Home/Day action resumes the same Trip/generation bookmark, then an explicit
  route date, Trip start, or lawful Item date. Undated without a known date enters
  an empty Day page with date selection inside that page, never a time-origin gate.
- Empty navigation `zone` means unknown context only; it is not an IANA zone or a
  new persisted Item time. Existing endpoint-local date/clock/zone facts stay intact.
- Core v2 query accepts this date-only context and preserves its own rows, source,
  ordering, renderer and permissions. Legacy v1 reads raw boundary calendar dates
  and calendar-night stay coverage without converting them to an invented instant.
- Unknown context hides precise NOW and disqualifies contextual Transition actions.
  Relative Flexible blocks are not positioned using an absolute clock in that case.
- Pending manual increments retain their separate Repository identity and normal
  local detail route; no Candidate or pending Item becomes accepted by this change.
- Today opens its lawful planning Day directly. An existing stay summary no longer
  appears alongside a contradictory no-plans message.

Code tests are not Native acceptance. Coordinator must install the reviewed combined
candidate into original AD5 and verify Day Tab, Auckland Sky City Hotel, detail
return and cold reopen without replacing the account or Item.

Native regression follow-up: the first direct-entry candidate (`b2a0cf6`) caused
an update-depth loop after Trip entry. Its non-memoized Day callback changed the
Workspace quick-action publication effect on every provider rerender. Memoized
Day handlers now retain identity for unchanged navigation/read context, while a
changed planning date updates the action. The callback-identity regression test
checks both properties. AD5 reinstall/regression remains with Coordinator.

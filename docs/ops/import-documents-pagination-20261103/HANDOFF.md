# Documents stale pagination repair

Base origin/main4c3094fa. Two captured callbacks (More and Refresh) can outlive a
new first-page inventory and issue an obsolete read. The new regressions fail on
base (expected2 reads, observed3). Reuse the existing Activity inventory fence;
reject old closures and publish the inventory before its React state update.
Current pagination/cursor/dedup remains supported. No new reader or state platform.

Two UI suites32 checks, scoped strict types, two-file lint, UI guard473/168,
formatting and diff checks pass. Existing Account/Trip/view/generation and Source
original rules are unchanged. Only the owning panel/test changed; no shared
Native files or external actions. Independent review/serial integration and
Native device acceptance remain pending; this is not AI E2E.

# P1 live draft handoff before adoption

Native confirmed no accepted complete live-draft port and temporarily delegated
P1PlanEditor/direct tests only. Keep its original repository/draft, current input,
initial dirty baseline and retry semantics. An Auth-owned in-memory registry can
freeze mounted P1 editors and return canonical text/hash/bytes for inventory.
It is a P1-only port, not a complete Guest inventory, durable journal or Sync Engine.

Freeze rejects loading, closed/stale editors, unresolved Save attempts and open
place selection. It blocks old Save/Discard/edit callbacks without writing or
clearing fields. Cancellation resumes the same original editor after checking
the Guest identity/generation and participant set. Unmount or identity change
invalidates the lease; originals remain untouched. Preview never participates.
No login/adoption consumer or publication is activated by registration. Actual
cold draft recovery and all-family/file inventory remain separate B work.

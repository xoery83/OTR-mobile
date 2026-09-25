# ADR 0021: Reuse the Settlement Summary projection in Review

The Summary and Review screens display the same financial generation. An account-generation and Journey-scoped in-memory handoff carries the coherent current or saved projection and known Expense titles into Review. Its source fingerprint or local generation identifies the value; elapsed time does not expire it. Account change, Journey change, and a changed canonical source replace it. Local pending work can replace it with a coherent saved projection, but a refresh never clears it.

Review displays the handoff immediately and verifies in the background. The existing Adjustment Preview remains necessary for its expected head, input digest, zero-transfer decision, and blockers, but its change list is not a second display source. A fresh canonical Preview and matching Adjustment Preview enable confirmation. Failed verification preserves the displayed projection and disables confirmation. The Backend's existing expected-head/input-digest check remains the final concurrency guard.

When fresh Preview is unavailable, a locally saved `RATE_REQUIRED` Expense removed from the displayed diff may still explain its known rate issue. That local hint never enables confirmation. A previously confirmed Expense opens the existing protected correction flow, since normal detail is read-only after confirmation.

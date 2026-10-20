# TH-10 Expense return integration

Native92b6a42 Home→Spending→actual Test/Groceries/NZ25 expense opens the correct detail, but its first Ledger tab route is the child Stack root: no native Back and the observed edge gesture did not return. No expense was edited or saved.

Minimal fix: root `trip-expense/[id]` re-exports the original expense route; root Stack registers the existing localized title and native Back. Only Home recent-expense entry uses this alias. Ledger screen, authorization, expense calculations and writes are unchanged. Coordinator confirmed single route writer and approved this exact assembly.

Eight expense Widget tests and typecheck PASS; independent incremental review PASS. Native return remains pending on the new fixed candidate. Original ca7875a and92b6a42 sources remain available for rollback; no reinstall/account transfer required.

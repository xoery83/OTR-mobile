# Home/Preparation sync completion refresh — focused review

Fixed `bfbc117c3f450d35d069e94aa8ae402b0e53f9aa`: **PASS LOCAL/L2**, no P0/P1/P2 finding.

Existing completion event is filtered by Account/current generation/Trip. Focus cleanup unsubscribes and invalidates pending reader tickets. Preparation resolves the new accepted Source token instead of keeping the old predicted token. No new queue/authority; event refresh does not clear editor state or change its key.

Independent82 tests PASS; reviewer opened-P1-draft completion refresh test retains same opened/draft object and does not reread the draft: **83 tests /2 files PASS**. Foreign/stale event and blur unsubscribe tests included.

No DEV/GUI operation. Root actual cold recovery and Home/Day acceptance remain separate Native evidence.

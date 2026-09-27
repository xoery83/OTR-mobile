# ADR 0049: Local receipt OCR foundation

Date: 2026-09-27
Status: Accepted for Phase A1; implemented

## Decision

Use a small, iOS-only local Expo Module to expose Apple Vision `VNRecognizeTextRequest` to a TypeScript adapter. OCR reads the verified temporary **New Expense** image draft before Save, emits transient structured text observations with top-left normalized geometry, and never depends on upload. Keep the accepted Expense and attachment transaction unchanged. An OCR failure cannot block manual entry, Save, or the user's attachment choice. Android is explicitly unavailable until a local equivalent is approved. Do not add a cloud provider, OCR persistence table, or parser in Phase A.

## Reason and follow-up

The repository uses Expo prebuild with ignored generated native folders and has no app-owned native module. A local Expo Module is the supported regeneration-safe addition with the least new infrastructure. The current draft file already gives Vision validated, local input. Source-image versus 2200 px archive accuracy, language support and correction, runtime/memory, and cancellation behavior require synthetic physical-device measurements in A1/A2 before tuning. Full audit and staged checks: `docs/ledger/RECEIPT_OCR_1_0_IMPLEMENTATION_PLAN.md`.

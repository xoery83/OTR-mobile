# Guest provisional adoption metadata transport

Preflight/status must use the verified target Account's provisional Session while
the launch principal remains Guest. The normal authenticated client expects an
adopted Account, so reuse the base API client with a token provider backed by the
existing Guest verification store instead of activating that Account early.

Pin Guest UUID/generation and adoption/target IDs; verify the committed Guest before
token resolution, actual dispatch and response application. Only send the existing
strict preflight/status DTOs. Refresh a rejected token through existing Supabase
refresh, with ordinary Session persistence disabled, then CAS into the same
provisional secure slot. Coalesce refresh for the same binding/generation. Never
write the Account index, unlock Guest source, publish data or infer identity from
names/email. Lost/cancelled refresh remains a verification/recovery failure, not
permission to activate or upload.

This client does not mount or authorize Backend adapters. Missing preflight/status
authority remains closed, and NOT_FOUND still requires server reconciliation.

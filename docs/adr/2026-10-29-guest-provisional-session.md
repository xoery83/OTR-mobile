# Guest verification credentials remain in the existing Session authority

Status: design constraint only; Session runtime code is not changed by this ADR.

AUTH requires provisional verification before adoption and restart recovery during
transfer. A verified Provider Session must not make the Guest an active Account or
start Account cache/sync. Keep the one existing Auth repository and canonical
per-Account secure credential key; never put credentials in adoption JSON/SQLite,
copy another App's Keychain or introduce a second Session store/authority.

Add a small secure metadata binding (Guest/adoption/target UUID and persistence
phase) before writing a newly verified Session into its existing per-Account key.
No Account index, legacy Session or launch marker is installed/changed. The normal
Guest installation guard remains. Existing unbound credential slots are collisions,
not credentials to reuse or overwrite. Refreshed writes need the previous refresh
token CAS; scope/generation and JWT subject must match before/after persistence.

Cancellation marks credentials for normal current-session server revocation; it
does not cancel a protected business publication. The adoption coordinator must
still query server commit status once publication was requested. Only after the
normal revocation acknowledgment may the repository clear the bound credential;
record that acknowledgment before deletion so interrupted cleanup is recoverable.
No global sign-out, Account deletion, key reset or irreversible recovery policy.

This source slice supplies secure persistence ports only, not the Provider/refresh/
revocation caller or adoption activation. It stores real normal Provider results
when wired; unit JWT fixtures certify binding logic only, never real login. No
normal Account session behavior or business permission/entitlement is changed.

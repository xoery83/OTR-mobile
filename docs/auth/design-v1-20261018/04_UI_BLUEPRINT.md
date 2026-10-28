# AUTH UI Blueprint V1.0

Use OTR native iOS sheets, Ledger-consistent typography, monochrome general icons, theme primary color, limited nested cards, accessible Dynamic Type and dark mode. Provider-branded buttons use provider requirements.

1. **Sign-in Sheet:** contextual title for invitation/paywall/backup; Apple, Google, Email OTP; Email → code → verify, resend/change address, paste/autofill. X/swipe cancels before protected adoption. Global Menu restores original screen/scroll.
2. **Account verified / adoption:** existing account confirmation `Add trips to this account` / `Cancel sign-in`; new account may auto-proceed. Quota insufficient `Upgrade & continue` / `Cancel sign-in`. Honest stages Check → Transfer → Verify → Commit, resumable recovery; no fake percentage. Once protected transfer begins no casual swipe.
3. **Account & Profile:** Display Name, document Family/Given or unsplit, AKA with source and delete, Sign-in methods and Privacy & Security. Optional contextual name prompt.
4. **Create Trip Travelers:** You default, count stepper, name rows, known co-traveler suggestion with explicit selected account and `Will invite after creation`; failure doesn't roll back Trip.
5. **Members Invite:** per-Person Invite, Trip-wide Link/QR, email, known Account, expiry/close/rotate. Honest delivery state.
6. **Recipient:** minimal Trip preview → login/adoption if needed → targeted claim or suggested existing Person / Choose another / I'm not listed. Provisional shared read-only while pending, not private data.
7. **Organizer Update:** account + claimed Person, Confirm / Choose another / Create new / Reject, optional Block and revoke token. Timer only when real server state.
8. **My Trips:** pending invitation strip above normal Trip sections; accepting moves to Trip, rejecting clears pending.
9. **Logout/recovery:** previous provider prominent after logout, warning for online unsynced logout, ordinary offline logout unavailable, adoption status and safe recovery.

Native VQA: Guest offline/online, OTP cancel, OAuth provider collision, deep links/WeChat/Safari/install, QR, multi-user token, incorrect claim, rejection, auto-confirm race, 10/50/99% adoption crashes, long strings/RTL/Unicode, accessibility.

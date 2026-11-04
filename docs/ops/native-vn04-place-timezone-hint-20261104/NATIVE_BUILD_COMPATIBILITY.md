# Transient MapKit timezone hint compatibility

This source slice is not a device acceptance. It requires a distinct full Native build containing both the changed Swift payload and matching JS strict DTO/P1 consumer. New Native plus old strict JS can reject the added payload field; do not split them during release, OTA selection or rollback. Native owns runtime/bundle compatibility qualification. Old Native plus new JS simply has no hint, which remains optional.

Do not replace the already installed QA151/source850 or Vision/source869 artifact as part of Root1 source integration. Native/Vision own a later pinned full Native+JS build, installation preserving data, real Apple result/keyboard/sheet and locale validation.

The caption is a transient reference from a current selected Apple result. It does not set picker timezone, convert dates, qualify DST, author an instant, persist a zone or provide a Trip IANA owning port. Reopening or invalidating the draft/Account/Trip/address leaves the existing floating-time behavior. No device-zone fallback or migration is included.

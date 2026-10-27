# Bounded Apple MapKit iOS diagnostic

Unique bundle `com.xoery.otr.placesprobe`; no Expo/Pods/host modification or OTR replacement. Uses the same `ApplePlaceSearchEngine.swift` as the Expo adapter. Does not certify Expo bridge or P1/P3 Form integration.

Install/launch only by Root's explicitly coordinated Device Hub GUI window on AD5. Do not use simctl install/launch, boot/reset devices, or overwrite `com.xoery.otrmobile`.

`Run Fixed Samples` starts at most eight native operations: six single searches, Sky Tower completion, optional selection-driven completion resolve. No loops to fill results; per-process maximum30 operations (relaunch resets the diagnostic counter). Address/point/title and API status are written only to this new diagnostic app's `Documents/AppleMapKitProbe.json`. No auth/account/Trip data, GPS, Google/network tokens, new entitlements or canonical writes. Cancel invalidates current generation and clears retained selection; error/manual Form behavior remains the TS/Form gate, not a diagnostic success claim.

Build in a new `/private/tmp/…/OTRPlacesProbe.app` directory with the installed iPhoneSimulator SDK, `arm64-apple-ios16.4-simulator`, Swift5 mode, UIKit+MapKit, and ad-hoc signature. Preserve source/executable/Info.plist hashes and read-only verification of the original OTR install before Root installs this separate app. No binary inside the Git source.

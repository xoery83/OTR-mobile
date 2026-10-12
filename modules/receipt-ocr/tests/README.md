# CLOSED Flight PDFKit checks

Synthetic generated PDFs only. No provider, network, UI, app installation or
real document access. Compile the same extractor directly; these checks do not
certify the Expo/Hermes bridge or an installed OTR binary.

From the repository root (use your own temporary build directory):

```sh
mkdir -p /private/tmp/otr-flight-native-check
xcrun swiftc -swift-version 5 -module-cache-path /private/tmp/otr-flight-native-check/cache modules/receipt-ocr/ios/FlightPdfExtractor.swift modules/receipt-ocr/tests/main.swift -o /private/tmp/otr-flight-native-check/pdf-check
/private/tmp/otr-flight-native-check/pdf-check
```

For an explicitly authorized booted simulator, compile with its SDK/target and
run the executable through `simctl spawn` on that exact UDID. Do not use `booted`,
install over an app, boot reserved devices, reset data or access private documents.
The CP-FLIGHT-NATIVE-01 report records the exact tested simulator and artifact.
An optional single path argument exports only the newly generated synthetic PDF
base64 plus its exact extraction packet for the TypeScript fixture seam.

Owning Source rejection and accepted text downstream regression:

```sh
python3 scripts/trip/core-v2-sql-acceptance.py --native-flight
python3 scripts/trip/core-v2-sql-acceptance.py --flight
```

Both runners create and delete their own network-none cached SQL clone. Native
PDF inputs must remain REVIEW under the current owning Source/Core contract;
text downstream success is a separate baseline regression, not PDF acceptance.

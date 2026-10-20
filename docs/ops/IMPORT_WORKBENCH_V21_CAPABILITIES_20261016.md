# Workbench V2.1 capability boundary

Owner contract: `IMPORT_WORKBENCH_V21_CONTRACT_20261016.md`. Its universal
presentation replaces the previous Flight-only visual specification. It does
not expand production interpretation or admission capabilities.

## Existing production components

| Capability                   | Actual implementation                                 | Limit                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Text PDF extraction          | PDFKit, Mac and isolated iOS runner                   | Requires text on each page; scanned/encrypted/unreadable pages can fail. No PDF OCR fallback is implemented.                                    |
| JPEG / PNG text extraction   | Apple Vision OCR                                      | Actual text and recorded regions only; no invented geometry.                                                                                    |
| UTF-8 text                   | Existing validated local extraction                   | No Email/Office/Wallet input adapter.                                                                                                           |
| Deterministic interpretation | Existing Flight parser and normalization              | Partial aviation observations; no complete Booking or canonical Segment identity is implied.                                                    |
| Apple local model            | Existing Foundation Models enrichment                 | Availability comes from the selected runner. Current suggestions are anchored flight-service observations, not a universal booking interpreter. |
| Field evidence               | Production evidence validation                        | Invalid model evidence preserves valid deterministic fields.                                                                                    |
| Typed interpretation         | Existing partial Flight read projection               | `CURRENT_PARSER_READ`, not a formal Candidate or Admission receipt.                                                                             |
| Other travel business types  | Universal presentation can represent supported output | Stay, Rental, non-air scheduled transport, Activity, Ticket and mixed-business interpreters are not implemented by this packet.                 |
| Remote / Storage / Admission | Not run by this tool                                  | Diagnostic only; no remote calls, cloud uploads or canonical writes.                                                                            |

An extracted document with no aviation observations is not proof that it contains
no travel information. The UI must retain extracted content and disclose the
current interpreter's limited coverage.

## Trace limits

- Host source manifests identify host files, not the installed Native binary or
  executing JavaScript bundle. Those execution identities remain unverified.
- Deterministic parsing, capability checking and evidence construction are not
  individually timed in the current Trace. Do not split the combined measurement.
- Rejected raw model responses and all intermediate field proposals are not
  retained. Their missing values/counts must be “Not Recorded” or N/A.
- Typed projection timing, complete admission-required-field validation and real
  Booking/Segment/Canonical identities are not recorded or not executed.
- PDF text spans identify text/page evidence, not geometric PDF coordinates.
  Image regions are usable only when the actual Trace contains them.
- Imported Trace files are unverified, read-only diagnostic views; they do not
  become authenticated runs or independent Runtime evidence.
- No label means unannotated, not incorrect. A greater field count alone does not
  establish greater accuracy. Human diagnostic labels never change OTR data.

## Minimum owner trial

Start the existing loopback server from the repository root:

```sh
node --import tsx scripts/import-workbench/server.ts
```

Open `http://127.0.0.1:49184/`. Inspect a saved real PDF or JPG, select a field,
and compare its displayed value with the original and recorded evidence. Test
reruns saved originals; Compare selects two distinct runs of the same bytes.
Ground Truth contains diagnostic annotations only. Runs retains JSON and report
exports. Native execution requires the existing explicitly armed isolated iOS
runner; an unavailable runner must never silently fall back to Mac.

Raw originals, Trace files, private gate files and screenshots containing private
documents stay outside Git. No full Native visual matrix is required for this
desktop diagnostic correction. iPhone 16 Pro and resource-cold model calibration
remain separate validation work.

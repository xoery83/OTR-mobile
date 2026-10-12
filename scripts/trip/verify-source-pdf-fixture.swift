import Foundation
import PDFKit
let p = PDFDocument(url:URL(fileURLWithPath:CommandLine.arguments[1]))!
precondition(p.pageCount == 2)
let expected = ["NZ1 AKL->CHC 2026-12-17 depInstant=2026-12-16T20:00:00.120000Z", "NZ2 CHC->AKL 2026-12-20 depInstant=2026-12-19T20:00:00.120000Z"]
for i in 0..<2 { precondition(p.page(at:i)!.string!.trimmingCharacters(in:.whitespacesAndNewlines) == expected[i]) }
print("PDFKIT_SYNTHETIC_SELECTABLE_TWO_PAGES_PASS")

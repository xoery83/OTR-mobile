import Foundation
import CoreGraphics
import CoreText
import PDFKit

func syntheticPdf(_ texts: [String?]) -> Data {
  let data = NSMutableData()
  var box = CGRect(x: 0, y: 0, width: 900, height: 400)
  let context = CGContext(consumer: CGDataConsumer(data: data)!, mediaBox: &box, nil)!
  for text in texts {
    context.beginPDFPage(nil)
    if let text = text {
      let font = CTFontCreateWithName("Helvetica" as CFString, 12, nil)
      let attributes = [kCTFontAttributeName: font] as CFDictionary
      let line = CTLineCreateWithAttributedString(CFAttributedStringCreate(nil, text as CFString, attributes)!)
      context.textPosition = CGPoint(x: 30, y: 200)
      CTLineDraw(line, context)
    }
    context.endPDFPage()
  }
  context.closePDF()
  return data as Data
}
let lines = [
  "NZ1 AKL->CHC 2026-12-17 depInstant=2026-12-16T20:00:00.120000Z",
  "NZ2 CHC->AKL 2026-12-20 depInstant=2026-12-19T20:00:00.120000Z"
]
let original = syntheticPdf(lines.map { Optional($0) })
let result = FlightPdfExtractor.extract(original)
assert(result["error"] == nil, "\(result)")
assert((result["pages"] as! [[String: Any]]).count == 2)
assert((result["text"] as! String).contains("NZ1"))
assert((result["text"] as! String).contains("NZ2"))
assert(FlightPdfExtractor.extract(original)["originalSha256"] as! String == result["originalSha256"] as! String)
assert(FlightPdfExtractor.extract(Data("not pdf".utf8))["error"] as! String == "UNSUPPORTED_PDF")
assert(FlightPdfExtractor.extract(Data(repeating: 1, count: 10485761))["error"] as! String == "UNSUPPORTED_PDF")
assert(FlightPdfExtractor.extract(syntheticPdf([nil]))["error"] as! String == "PDF_TEXT_UNAVAILABLE")
assert(FlightPdfExtractor.extract(syntheticPdf([lines[0], nil]))["error"] as! String == "PDF_TEXT_UNAVAILABLE")
assert(FlightPdfExtractor.extract(syntheticPdf(Array(repeating: lines[0], count: 33)))["error"] as! String == "PDF_LIMIT")
let unicode = FlightPdfExtractor.extract(syntheticPdf(["NZ1 Café AKL->CHC"]))
let unicodePages = unicode["pages"] as! [[String: Any]]
assert(unicodePages[0]["end"] as! Int == (unicode["text"] as! String).utf8.count)
let encrypted = PDFDocument(data: original)!
let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".pdf")
assert(encrypted.write(to: temporary, withOptions: [.userPasswordOption: "synthetic", .ownerPasswordOption: "synthetic-owner"]))
let encryptedBytes = try Data(contentsOf: temporary)
assert(FlightPdfExtractor.extract(encryptedBytes)["error"] as! String == "ENCRYPTED_PDF")
try FileManager.default.removeItem(at: temporary)
if CommandLine.arguments.count == 2 {
  let output = ["originalBase64": original.base64EncodedString(), "extraction": result] as [String: Any]
  try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
}
print("Flight PDFKit: 9 synthetic checks PASS")

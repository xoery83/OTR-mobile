import CryptoKit
import Foundation
import PDFKit

// Local extraction only. Offsets address derived UTF-8, never the PDF byte stream.
struct FlightPdfExtractor {
  static func extract(_ data: Data) -> [String: Any] {
    guard !data.isEmpty, data.count <= 10 * 1024 * 1024,
      data.starts(with: Data("%PDF-".utf8)), let document = PDFDocument(data: data)
    else { return ["error": "UNSUPPORTED_PDF"] }
    guard !document.isEncrypted else { return ["error": "ENCRYPTED_PDF"] }
    guard document.pageCount > 0, document.pageCount <= 32
    else { return ["error": "PDF_LIMIT"] }
    var text = ""
    var pages: [[String: Any]] = []
    for index in 0..<document.pageCount {
      guard let page = document.page(at: index), let content = page.string,
        !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
        !content.contains("\0")
      else { return ["error": "PDF_TEXT_UNAVAILABLE"] }
      let start = text.utf8.count
      // No OCR, punctuation replacement, inferred fields or supplier normalization.
      text += content
      let end = text.utf8.count
      guard end <= 262144 else { return ["error": "PDF_LIMIT"] }
      pages.append(["pageIndex": index, "start": start, "end": end])
      if index + 1 < document.pageCount { text += "\n" }
    }
    guard text.utf8.count <= 262144 else { return ["error": "PDF_LIMIT"] }
    let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    return ["engine": "apple-pdfkit", "version": 1,
      "originalSha256": digest, "originalByteCount": data.count,
      "text": text, "pages": pages]
  }
}

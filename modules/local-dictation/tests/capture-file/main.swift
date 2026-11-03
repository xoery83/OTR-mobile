import Foundation
import ImageIO
import UniformTypeIdentifiers

let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
defer { try? FileManager.default.removeItem(at: root) }
let url = root.appendingPathComponent("fixture.txt")
let bytes = Data((0..<140_000).map { UInt8($0 % 251) })
try bytes.write(to: url)
var starts = 0, stops = 0
let store = CaptureFileLeaseStore(startScope: { _ in starts += 1; return true }, stopScope: { _ in stops += 1 })
let staged = try store.stage([url])
let token = staged[0]["token"] as! String
precondition(staged[0]["size"] as! Int == bytes.count)
precondition(staged[0]["uri"] == nil && staged[0]["path"] == nil)
do { _ = try store.read(token, maxBytes: 1); fatalError("read before open") } catch CaptureFileFailure.notOpen {}
try store.open(token)
do { try store.open(token); fatalError("double open") } catch CaptureFileFailure.opened {}
for count in [0, -1, 65_537] {
  do { _ = try store.read(token, maxBytes: count); fatalError("unbounded read") } catch CaptureFileFailure.limit {}
}
var actual = Data()
while true {
  let part = try store.read(token, maxBytes: 65_536)
  let data = Data(base64Encoded: part["base64"] as! String)!
  precondition(data.count <= 65_536 && data.count == part["byteCount"] as! Int)
  actual.append(data)
  if part["eof"] as! Bool { break }
}
precondition(actual == bytes)
try store.release([token, token]); try store.release([token])
precondition(starts == 1 && stops == 1)
do { try store.open(token); fatalError("expired token") } catch CaptureFileFailure.expired {}
_ = try store.stage(Array(repeating: url, count: 10))
do { _ = try store.stage([url]); fatalError("lease cap") } catch CaptureFileFailure.limit {}
store.releaseAll(); store.releaseAll(); precondition(starts == 11 && stops == 11)
do { _ = try store.stage([url, root]); fatalError("directory") } catch CaptureFileFailure.invalid {}
precondition(starts == 13 && stops == 13)
let local = CaptureFileLeaseStore(startScope: { _ in false }, stopScope: { _ in fatalError("stop unowned scope") })
let localToken = try local.stage([url])[0]["token"] as! String
try local.open(localToken); local.releaseAll()
do { _ = try local.stage([URL(string: "https://invalid.example/file")!]); fatalError("remote URL") } catch CaptureFileFailure.invalid {}
let missing = try store.stage([url])[0]["token"] as! String
try FileManager.default.removeItem(at: url)
do { try store.open(missing); fatalError("missing source") } catch CaptureFileFailure.read {}
precondition(starts == stops)
print("CaptureFileLeaseStore PASS: staging, read bounds, exact bytes, token/cap, balanced scope, local scope=false, missing file cleanup (NOT iOS picker/Native PASS)")

// Preview is bounded and independent of the original stream, including corrupt files.
let imageURL = root.appendingPathComponent("preview.png")
let context = CGContext(data: nil, width: 1200, height: 600, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.setFillColor(CGColor(red: 0, green: 1, blue: 0, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: 1200, height: 600))
let destination = CGImageDestinationCreateWithURL(imageURL as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(destination, context.makeImage()!, nil); precondition(CGImageDestinationFinalize(destination))
let original = try Data(contentsOf: imageURL)
let previewToken = try store.stage([imageURL])[0]["token"] as! String
let preview = try store.preview(previewToken)!
let decoded = Data(base64Encoded: String(preview.dropFirst("data:image/jpeg;base64,".count)))!
precondition(decoded.count <= 256 * 1024)
let imageSource = CGImageSourceCreateWithData(decoded as CFData, nil)!
let image = CGImageSourceCreateImageAtIndex(imageSource, 0, nil)!
precondition(image.width == 384 && image.height == 192)
do { _ = try store.read(previewToken, maxBytes: 1); fatalError("preview opened payload") } catch CaptureFileFailure.notOpen {}
try store.open(previewToken)
let originalChunk = try store.read(previewToken, maxBytes: 65536)["base64"] as! String
precondition(Data(base64Encoded: originalChunk) == original.prefix(65536))
try store.release([previewToken])
do { _ = try store.preview(previewToken); fatalError("released preview") } catch CaptureFileFailure.expired {}
try Data("invalid image".utf8).write(to: imageURL)
let corruptToken = try store.stage([imageURL])[0]["token"] as! String
let corrupt = try store.preview(corruptToken); precondition(corrupt == nil)
store.releaseAll(); precondition(starts == stops)
print("Capture preview PASS: bounded real decode, aspect ratio, original bytes, no payload open, revoked lease, corrupt fallback")

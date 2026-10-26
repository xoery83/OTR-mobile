import Foundation

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

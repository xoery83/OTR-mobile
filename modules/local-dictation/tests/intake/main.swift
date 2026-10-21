import Foundation

func rejects(_ operation: () throws -> Void) { do { try operation(); preconditionFailure("Expected rejection") } catch {} }
let privateError = NSError(domain: "private transcript domain", code: 13, userInfo: [NSLocalizedDescriptionKey: "private words", "audio": "private audio"])
let safe = DictationDiagnostic(.recognition, error: privateError, sampleRateValid: true, channelCountValid: false).body
precondition(safe["domain"] as? String == "OTHER")
precondition(safe["code"] as? Int == 13)
precondition(safe["sampleRateValid"] as? Bool == true)
precondition(safe["channelCountValid"] as? Bool == false)
precondition(Set(safe.keys) == Set(["phase", "domain", "code", "sampleRateValid", "channelCountValid"]))
precondition(!String(describing: safe).contains("private"))
precondition(DictationDiagnostic(.audioEngine, error: NSError(domain: "NSOSStatusErrorDomain", code: -50)).domain == "NSOSStatusErrorDomain")
precondition(DictationDiagnostic(.audioEngine, error: NSError(domain: "NSOSStatusErrorDomain", code: Int.max)).code == nil)
precondition(ImagePastePolicy.validRequest("paste-1"))
precondition(!ImagePastePolicy.validRequest("paste\n1"))
precondition(!ImagePastePolicy.validRequest(String(repeating: "a", count: 81)))
let png = Data([137,80,78,71,13,10,26,10] + Array(repeating: 0, count: 32))
let pngFormat = try ImagePastePolicy.format(png); precondition(pngFormat.mime == "image/png")
rejects { _ = try ImagePastePolicy.format(Data("private text".utf8)) }
let root = FileManager.default.temporaryDirectory.appendingPathComponent("otr-intake-test-" + UUID().uuidString)
try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: root) }
let input = root.appendingPathComponent("source.png")
try png.write(to: input)
let store = ImagePasteStore(root: root.appendingPathComponent("owned"))
let cancelled = try store.batch(requestId: "cancelled")
let first = try cancelled.copyProviderFile(input)
precondition(FileManager.default.fileExists(atPath: first.url.path))
cancelled.cancelPending()
precondition(!FileManager.default.fileExists(atPath: first.url.path))
rejects { _ = try cancelled.copyProviderFile(input) }
let delivered = try store.batch(requestId: "delivered")
let item = try delivered.copyProviderFile(input)
try store.deliver([item], batch: delivered)
delivered.cancelPending() // View closed: delivered draft remains owned until explicit release.
precondition(FileManager.default.fileExists(atPath: item.url.path))
let deliveredBytes = try Data(contentsOf: item.url); precondition(deliveredBytes == png)
store.release([UUID().uuidString])
precondition(FileManager.default.fileExists(atPath: item.url.path))
store.release([item.token])
precondition(!FileManager.default.fileExists(atPath: item.url.path))
let late = try store.batch(requestId: "late")
let lateItem = try late.copyProviderFile(input)
late.cancelPending()
rejects { try store.deliver([lateItem], batch: late) }
let big = root.appendingPathComponent("large.png")
try Data(repeating: 0, count: ImagePastePolicy.maxBytes + 1).write(to: big)
let limited = try store.batch(requestId: "limited")
rejects { _ = try limited.copyProviderFile(big) }; limited.cancelPending()
let aggregate = try store.batch(requestId: "aggregate")
let twelve = root.appendingPathComponent("twelve.png")
var data = png; data.append(Data(repeating: 0, count: 12 * 1024 * 1024 - data.count)); try data.write(to: twelve)
_ = try aggregate.copyProviderFile(twelve)
rejects { _ = try aggregate.copyProviderFile(twelve) }; aggregate.cancelPending()
let tooMany = try store.batch(requestId: "too-many")
var items: [ImagePasteItem] = []
for _ in 0..<11 { items.append(try tooMany.copyProviderFile(input)) }
rejects { try store.deliver(items, batch: tooMany) }; tooMany.cancelPending()
let retained = try store.batch(requestId: "retained")
let retainedItem = try retained.copyProviderFile(twelve)
try store.deliver([retainedItem], batch: retained)
let remaining = try store.batch(requestId: "remaining-budget")
precondition(remaining.maxItems == 9)
rejects { _ = try store.batch(requestId: "concurrent") }
rejects { _ = try remaining.copyProviderFile(twelve) }
remaining.cancelPending()
store.release([retainedItem.token])
let restoredBudget = try store.batch(requestId: "restored-budget")
precondition(restoredBudget.maxItems == 10)
_ = try restoredBudget.copyProviderFile(twelve)
restoredBudget.cancelPending()
// Emitting an event does not transfer file ownership. A dropped event is cleaned
// by the view lifecycle and immediately restores the native retained-item budget.
let dropped = try store.batch(requestId: "dropped")
let droppedItems = try (0..<10).map { _ in try dropped.copyProviderFile(input) }
try store.deliver(droppedItems, batch: dropped)
rejects { _ = try store.batch(requestId: "full") }
store.releaseUnclaimed(droppedItems.map { $0.token })
precondition(droppedItems.allSatisfy { !FileManager.default.fileExists(atPath: $0.url.path) })
precondition(!store.claim(requestId: "dropped", tokens: droppedItems.map { $0.token }))
let restored = try store.batch(requestId: "claim")
precondition(restored.maxItems == 10)
let claimItems = try (0..<2).map { _ in try restored.copyProviderFile(input) }
try store.deliver(claimItems, batch: restored)
let claimTokens = claimItems.map { $0.token }
precondition(!store.claim(requestId: "wrong-request", tokens: claimTokens))
precondition(!store.claim(requestId: "claim", tokens: []))
precondition(!store.claim(requestId: "claim", tokens: [claimTokens[0], claimTokens[0]]))
precondition(!store.claim(requestId: "claim", tokens: [claimTokens[0], "invalid"]))
precondition(!store.claim(requestId: "claim", tokens: [claimTokens[0], UUID().uuidString.lowercased()]))
// All failed claims above are atomic: both still transfer successfully together.
precondition(store.claim(requestId: "claim", tokens: claimTokens))
precondition(!store.claim(requestId: "claim", tokens: claimTokens))
store.releaseUnclaimed(claimTokens) // Claim wins the race: detach must preserve.
precondition(claimItems.allSatisfy { FileManager.default.fileExists(atPath: $0.url.path) })
store.release(claimTokens)
precondition(claimItems.allSatisfy { !FileManager.default.fileExists(atPath: $0.url.path) })
let gone = try store.batch(requestId: "missing-file")
let goneItem = try gone.copyProviderFile(input)
try store.deliver([goneItem], batch: gone)
try FileManager.default.removeItem(at: goneItem.url)
precondition(!store.claim(requestId: "missing-file", tokens: [goneItem.token]))
store.releaseUnclaimed([goneItem.token])
print("Safe diagnostic metadata and bounded pending/delivered image ownership PASS; no clipboard/audio/UI access")

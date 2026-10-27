import Foundation

let fence = DictationSessionFence()
let owner = UUID(), other = UUID(), sessionId = "dictation-1761012000000-1"
func rejects(_ operation: () throws -> Void) {
  do { try operation(); preconditionFailure("Expected rejection") } catch {}
}
rejects { _ = try fence.begin(owner: owner, sessionId: "invalid\n") }
precondition(fence.active == nil)
rejects { _ = try fence.begin(owner: owner, sessionId: "") }
rejects { _ = try fence.begin(owner: owner, sessionId: String(repeating: "a", count: 81)) }
rejects { _ = try fence.begin(owner: owner, sessionId: "dictation-语音") }
let first = try fence.begin(owner: owner, sessionId: sessionId)
precondition(fence.current(first))
rejects { _ = try fence.begin(owner: other, sessionId: UUID().uuidString) }
precondition(fence.current(first))
precondition(fence.matching(owner: other, sessionId: sessionId) == nil)
precondition(fence.matching(owner: owner, sessionId: UUID().uuidString) == nil)
precondition(fence.release(first))
rejects { _ = try fence.begin(owner: owner, sessionId: sessionId) }
// Bounded recent history may rotate; epoch protection still applies if an old token is seen again.
for i in 0..<256 {
  let rotating = try fence.begin(owner: owner, sessionId: "rotation-\(i)")
  precondition(fence.release(rotating))
}
let reused = try fence.begin(owner: owner, sessionId: sessionId)
precondition(first != reused)
precondition(!fence.current(first)) // Late permission/transcript/timer callback cannot reach reused ID.
precondition(!fence.release(first))
precondition(fence.current(reused))
precondition(fence.release(reused))

let exact = String(repeating: "旅", count: 4096)
let checked = try checkedDictationTranscript(exact)
precondition(checked == exact)
rejects { _ = try checkedDictationTranscript(exact + "程") }


let cancelled = DictationSessionFence()
_ = cancelled.requestCancel(owner: owner, sessionId: "dictation-before-begin")
rejects { _ = try cancelled.begin(owner: owner, sessionId: "dictation-before-begin") }
rejects { _ = try cancelled.begin(owner: owner, sessionId: "dictation-before-begin") }
let foreign = try cancelled.begin(owner: other, sessionId: "dictation-before-begin")
precondition(cancelled.current(foreign))
_ = cancelled.requestCancel(owner: owner, sessionId: foreign.sessionId)
precondition(cancelled.current(foreign))
precondition(cancelled.release(foreign))
let retired = DictationSessionFence()
retired.retire(owner: owner)
rejects { _ = try retired.begin(owner: owner, sessionId: "queued-start-after-destroy") }
let stillValid = try retired.begin(owner: other, sessionId: "another-owner")
precondition(retired.release(stillValid))
let normal = DictationSessionFence()
for i in 0..<1024 {
  let id = "dictation-normal-\(i)"
  let lease = try normal.begin(owner: owner, sessionId: id)
  precondition(normal.release(lease))
  _ = normal.requestCancel(owner: owner, sessionId: id)
}
precondition(normal.pendingCancellationCount == 0)
let overflow = DictationSessionFence()
for i in 0..<129 { _ = overflow.requestCancel(owner: owner, sessionId: "unresolved-\(i)") }
precondition(overflow.pendingCancellationCount == 128)
rejects { _ = try overflow.begin(owner: owner, sessionId: "unresolved-128") }
rejects { _ = try overflow.begin(owner: other, sessionId: "new-but-saturated") }
let ownerOverflow = DictationSessionFence()
for _ in 0..<129 { ownerOverflow.retire(owner: UUID()) }
rejects { _ = try ownerOverflow.begin(owner: owner, sessionId: "new-after-owner-saturation") }
print("Dictation session ownership/epoch checks PASS; no permissions, audio, speech, or network invoked")

import Foundation

let fence = DictationSessionFence()
let owner = UUID(), other = UUID(), sessionId = UUID().uuidString
func rejects(_ operation: () throws -> Void) {
  do { try operation(); preconditionFailure("Expected rejection") } catch {}
}
rejects { _ = try fence.begin(owner: owner, sessionId: "not-a-uuid") }
precondition(fence.active == nil)
let first = try fence.begin(owner: owner, sessionId: sessionId)
precondition(fence.current(first))
rejects { _ = try fence.begin(owner: other, sessionId: UUID().uuidString) }
precondition(fence.current(first))
precondition(fence.matching(owner: other, sessionId: sessionId) == nil)
precondition(fence.matching(owner: owner, sessionId: UUID().uuidString) == nil)
precondition(fence.release(first))
let reused = try fence.begin(owner: owner, sessionId: sessionId)
precondition(first != reused)
precondition(!fence.current(first)) // Late permission/transcript/timer callback cannot reach reused ID.
precondition(!fence.release(first))
precondition(fence.current(reused))
precondition(fence.release(reused))
print("Dictation session ownership/epoch checks PASS; no permissions, audio, speech, or network invoked")

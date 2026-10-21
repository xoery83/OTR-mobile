import Foundation

// Used only from the engine's MainActor. UUID epochs also fence reuse of the same JS session ID.
struct DictationLease: Equatable {
  let owner: UUID
  let sessionId: String
  let epoch = UUID()
}
final class DictationSessionFence {
  private(set) var active: DictationLease?

  func begin(owner: UUID, sessionId: String) throws -> DictationLease {
    guard !sessionId.isEmpty, sessionId.utf8.count <= 80,
      sessionId.unicodeScalars.allSatisfy({ (0x21...0x7E).contains($0.value) })
    else { throw DictationFailure.failed }
    guard active == nil else { throw DictationFailure.failed }
    let lease = DictationLease(owner: owner, sessionId: sessionId)
    active = lease
    return lease
  }
  func current(_ lease: DictationLease) -> Bool { active == lease }
  func matching(owner: UUID, sessionId: String) -> DictationLease? {
    guard let lease = active, lease.owner == owner, lease.sessionId == sessionId else { return nil }
    return lease
  }
  @discardableResult func release(_ lease: DictationLease) -> Bool {
    guard current(lease) else { return false }
    active = nil
    return true
  }
}
enum DictationFailure: String, Error, LocalizedError {
  case permission, unavailable, interrupted, failed, timeout
  var errorDescription: String? { rawValue }
}

func checkedDictationTranscript(_ text: String) throws -> String {
  guard text.count <= 4096 else { throw DictationFailure.failed }
  return text
}

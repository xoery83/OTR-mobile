import Foundation

// Used only from the engine's MainActor. Epochs fence late callbacks after token reuse.
struct DictationLease: Equatable {
  let owner: UUID
  let sessionId: String
  let epoch = UUID()
}
final class DictationSessionFence {
  private struct Key: Hashable { let owner: UUID; let sessionId: String }
  private(set) var active: DictationLease?
  private var cancelledBeforeBegin = Set<Key>()
  private var retiredOwners = Set<UUID>()
  private var known: [Key] = []
  private var saturated = false
  var pendingCancellationCount: Int { cancelledBeforeBegin.count }

  private func valid(_ value: String) -> Bool {
    !value.isEmpty && value.utf8.count <= 80
      && value.unicodeScalars.allSatisfy { (0x21...0x7E).contains($0.value) }
  }
  func begin(owner: UUID, sessionId: String) throws -> DictationLease {
    guard valid(sessionId), !saturated else { throw DictationFailure.failed }
    let key = Key(owner: owner, sessionId: sessionId)
    guard !retiredOwners.contains(owner), !cancelledBeforeBegin.contains(key)
    else { throw DictationFailure.interrupted }
    guard active == nil, !known.contains(key) else { throw DictationFailure.failed }
    let lease = DictationLease(owner: owner, sessionId: sessionId)
    active = lease
    // Recent known tokens make normal post-error/final defensive cancellation a no-op.
    if !known.contains(key) {
      if known.count == 256 { known.removeFirst() }
      known.append(key)
    }
    return lease
  }
  func current(_ lease: DictationLease) -> Bool { active == lease }
  func matching(owner: UUID, sessionId: String) -> DictationLease? {
    guard let lease = active, lease.owner == owner, lease.sessionId == sessionId else { return nil }
    return lease
  }
  func requestCancel(owner: UUID, sessionId: String) -> DictationLease? {
    guard valid(sessionId), !retiredOwners.contains(owner) else { return nil }
    if let lease = matching(owner: owner, sessionId: sessionId) { return lease }
    let key = Key(owner: owner, sessionId: sessionId)
    guard !known.contains(key), !cancelledBeforeBegin.contains(key) else { return nil }
    // Never evict or expire a pre-begin cancellation and accidentally revive a late start.
    guard cancelledBeforeBegin.count < 128 else { saturated = true; return nil }
    cancelledBeforeBegin.insert(key)
    return nil
  }
  func retire(owner: UUID) {
    if retiredOwners.contains(owner) { return }
    if retiredOwners.count < 128 { retiredOwners.insert(owner) } else { saturated = true }
    if active?.owner == owner { active = nil }
    cancelledBeforeBegin = cancelledBeforeBegin.filter { $0.owner != owner }
    known.removeAll { $0.owner == owner }
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

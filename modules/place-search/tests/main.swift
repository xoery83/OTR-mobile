import Foundation

@main struct StateChecks {
  static func main() async {
    let engine = ApplePlaceSearchEngine()
    let session = UUID().uuidString.lowercased()
    func input(_ generation: Int, _ text: String = "") -> [String: Any] {
      ["sessionId": session, "requestId": UUID().uuidString.lowercased(), "generation": generation, "text": text]
    }
    engine.cancel(session, 1)
    let cancelled = await engine.perform("search", input(1))
    precondition(cancelled["status"] as? String == "CANCELLED")
    precondition(cancelled["sessionId"] as? String == session)
    let newer = await engine.perform("search", input(2))
    precondition(newer["status"] as? String == "NO_RESULTS")
    engine.cancel(session, 1)
    let afterOldCancel = await engine.perform("search", input(3))
    precondition(afterOldCancel["status"] as? String == "NO_RESULTS")
    let stale = await engine.perform("search", input(2))
    precondition(stale["status"] as? String == "CANCELLED")
    let tooLong = await engine.perform("search", input(4, String(repeating: "旅", count: 700)))
    precondition(tooLong["status"] as? String == "INVALID_REQUEST")
    precondition(tooLong["generation"] as? Int == 4)
    let wrongSession = await engine.perform("resolve", input(5))
    precondition(wrongSession["status"] as? String == "STALE_HANDLE")
    engine.cancelAll()
    print("Native generation/early-response state checks: 6 PASS; zero provider searches")
  }
}

import ExpoModulesCore
import Foundation

public final class PublicationCatalogReceiveModule: Module {
  private let slot = PublicationCatalogReceiveSlot()

  public func definition() -> ModuleDefinition {
    Name("PublicationCatalogReceive")
    Function("contractVersion") { 1 }

    AsyncFunction("receive") {
      (
        id: String, tripId: String, token: String, timeoutMs: Int, expiresMs: Double,
        promise: Promise
      ) in
      guard !id.isEmpty, id.utf8.count <= 80, (1...30_000).contains(timeoutMs),
        let request = PublicationCatalogReceiver.request(tripId: tripId, token: token)
      else {
        promise.resolve(["error": "INVALID_RESPONSE"])
        return
      }
      let remaining = expiresMs - Date().timeIntervalSince1970 * 1000
      guard remaining.isFinite, remaining >= 1 else {
        promise.resolve(["error": "REQUEST_TIMEOUT"])
        return
      }
      let budget = min(timeoutMs, Int(min(30_000, remaining)))
      self.slot.start(id: id, request: request, timeoutMs: budget) { outcome in
        switch outcome {
        case .complete(let status, let bytes):
          promise.resolve(["status": status, "bytes": bytes] as [String: Any])
        case .failed(let code):
          promise.resolve(["error": code])
        }
      }
    }.runOnQueue(slot.queue)

    Function("cancel") { (id: String) in self.slot.cancel(id) }
    Function("release") { (id: String) in self.slot.release(id) }
    OnDestroy { self.slot.close() }
  }
}

import ExpoModulesCore
import Foundation

public final class LocalDictationModule: Module {
  private let owner = UUID()
  public func definition() -> ModuleDefinition {
    Name("OTRLocalDictation")
    Events("transcript", "state")
    AsyncFunction("start") { [weak self] (sessionId: String, locale: String) async throws in
      guard let owner = self?.owner else { throw DictationFailure.interrupted }
      try await LocalDictationEngine.shared.start(owner: owner, sessionId: sessionId, locale: locale) { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }
    AsyncFunction("stop") { [weak self] (sessionId: String) async in
      guard let owner = self?.owner else { return }
      await LocalDictationEngine.shared.stop(owner: owner, sessionId: sessionId)
    }
    AsyncFunction("cancel") { [weak self] (sessionId: String) async in
      guard let owner = self?.owner else { return }
      await LocalDictationEngine.shared.cancel(owner: owner, sessionId: sessionId)
    }
    let owner = self.owner
    OnDestroy {
      Task { @MainActor in LocalDictationEngine.shared.destroy(owner: owner) }
    }
  }
}

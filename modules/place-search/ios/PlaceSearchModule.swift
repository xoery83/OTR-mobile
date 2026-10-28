import ExpoModulesCore

public class PlaceSearchModule: Module {
  private let engine = ApplePlaceSearchEngine()

  public func definition() -> ModuleDefinition {
    Name("OTRPlaceSearch")
    AsyncFunction("complete") { (input: [String: Any]) async -> [String: Any] in
      await self.engine.perform("complete", input)
    }
    AsyncFunction("search") { (input: [String: Any]) async -> [String: Any] in
      await self.engine.perform("search", input)
    }
    AsyncFunction("resolve") { (input: [String: Any]) async -> [String: Any] in
      await self.engine.perform("resolve", input)
    }
    Function("cancel") { (session: String, generation: Int) in self.engine.cancel(session, generation) }
    OnDestroy { self.engine.cancelAll() }
  }
}

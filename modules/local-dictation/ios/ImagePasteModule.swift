import ExpoModulesCore
import UIKit

public final class ImagePasteModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OTRImagePaste")
    Function("claim") { (requestId: String, tokens: [String]) -> Bool in
      ImagePasteStore.shared.claim(requestId: requestId, tokens: tokens)
    }
    AsyncFunction("releaseUnclaimed") { (tokens: [String]) in
      guard tokens.count <= ImagePastePolicy.maxItems else { return }
      ImagePasteStore.shared.releaseUnclaimed(tokens)
    }
    AsyncFunction("release") { (tokens: [String]) in
      guard tokens.count <= ImagePastePolicy.maxItems else { return }
      ImagePasteStore.shared.release(tokens)
    }
    View(ImagePasteView.self) {
      Events("onImages", "onFailure")
      Prop("requestId") { (view, value: String) in view.setRequest(value) }
      Prop("enabled", false) { (view, value: Bool) in view.setEnabled(value) }
    }
  }
}

@MainActor final class ImagePasteView: ExpoView {
  let onImages = EventDispatcher()
  let onFailure = EventDispatcher()
  private let control = UIPasteControl()
  private var requestId = ""
  private var enabled = false
  private var batch: ImagePasteBatch?
  private var progress: Progress?
  private var emittedTokens: [String] = []
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    pasteConfiguration = UIPasteConfiguration(acceptableTypeIdentifiers: ["public.image"])
    control.target = self
    addSubview(control)
  }
  override func layoutSubviews() { super.layoutSubviews(); control.frame = bounds }
  func setRequest(_ value: String) {
    if requestId != value { cancelPending(); requestId = value }
  }
  func setEnabled(_ value: Bool) {
    enabled = value
    if !value { cancelPending() }
    control.isUserInteractionEnabled = value
  }
  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { cancelPending() }
  }
  deinit {
    batch?.cancelPending(); progress?.cancel()
    ImagePasteStore.shared.releaseUnclaimed(emittedTokens)
  }
  override func canPaste(_ itemProviders: [NSItemProvider]) -> Bool {
    enabled && batch == nil && ImagePastePolicy.validRequest(requestId) && itemProviders.contains { identifier($0) != nil }
  }
  override func paste(itemProviders: [NSItemProvider]) {
    guard enabled, batch == nil, ImagePastePolicy.validRequest(requestId), window != nil else { return }
    let selected = itemProviders.compactMap { provider -> (NSItemProvider, String)? in
      identifier(provider).map { (provider, $0) }
    }
    guard !selected.isEmpty else { failure(.unsupported, requestId); return }
    guard selected.count <= ImagePastePolicy.maxItems else { failure(.limit, requestId); return }
    do {
      let current = try ImagePasteStore.shared.batch(requestId: requestId)
      guard selected.count <= current.maxItems else { current.cancelPending(); failure(.limit, requestId); return }
      batch = current
      load(selected, index: 0, current: current, items: [])
    } catch { failure(error as? ImagePasteFailure ?? .storage, requestId) }
  }
  private func identifier(_ provider: NSItemProvider) -> String? {
    ImagePastePolicy.identifiers.first { provider.hasItemConformingToTypeIdentifier($0) }
  }
  private func current(_ value: ImagePasteBatch) -> Bool {
    enabled && batch === value && value.requestId == requestId && value.isCurrent() && window != nil
  }
  private func load(_ providers: [(NSItemProvider, String)], index: Int, current value: ImagePasteBatch, items: [ImagePasteItem]) {
    guard current(value) else { value.cancelPending(); return }
    if index == providers.count {
      do {
        try ImagePasteStore.shared.deliver(items, batch: value)
        batch = nil; progress = nil
        emittedTokens.append(contentsOf: items.map { $0.token })
        onImages(["requestId": value.requestId, "items": items.map { $0.body }])
      } catch { fail(value, .limit) }
      return
    }
    let (provider, type) = providers[index]
    progress = provider.loadFileRepresentation(forTypeIdentifier: type) { [weak self] url, error in
      let result: Result<ImagePasteItem, ImagePasteFailure>
      if let url, error == nil {
        do { result = .success(try value.copyProviderFile(url)) }
        catch { result = .failure(error as? ImagePasteFailure ?? .storage) }
      } else { result = .failure(.loadFailed) }
      Task { @MainActor in
        guard let self, self.current(value) else { value.cancelPending(); return }
        self.progress = nil
        switch result {
        case .success(let item): self.load(providers, index: index + 1, current: value, items: items + [item])
        case .failure(let error): self.fail(value, error)
        }
      }
    }
  }
  private func fail(_ value: ImagePasteBatch, _ error: ImagePasteFailure) {
    guard batch === value else { value.cancelPending(); return }
    cancelPending()
    if error != .cancelled { failure(error, value.requestId) }
  }
  private func failure(_ error: ImagePasteFailure, _ request: String) { onFailure(["requestId": request, "code": error.rawValue]) }
  private func cancelPending() {
    let pending = batch; batch = nil
    pending?.cancelPending()
    progress?.cancel(); progress = nil
    ImagePasteStore.shared.releaseUnclaimed(emittedTokens)
    emittedTokens = []
  }
}

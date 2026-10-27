import ExpoModulesCore
import UIKit

public final class ImagePasteModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OTRImagePaste")
    Function("supportsInputPaste") { true }
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

@MainActor final class ImagePasteView: ExpoView, UITextPasteDelegate {
  private weak var input: UITextView?
  private var lastInputDiagnostic = ""
  private var originalPasteConfiguration: UIPasteConfiguration?
  private var pasteWave: ImagePasteWave<NSItemProvider>?
  let onImages = EventDispatcher()
  let onFailure = EventDispatcher()
  private var requestId = ""
  private var enabled = false
  private var batch: ImagePasteBatch?
  private var progress: Progress?
  private var emittedTokens: [String] = []
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

  }
  override func layoutSubviews() { super.layoutSubviews(); attachInput() }
  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    super.mountChildComponentView(childComponentView, index: index)
    attachInput()
  }
  override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    if let input, input.isDescendant(of: childComponentView) { cancelPending(); detachInput() }
    super.unmountChildComponentView(childComponentView, index: index)
  }
  private func findInput(_ view: UIView, depth: Int = 0) -> UITextView? {
    guard depth < 12 else { return nil }
    if let input = view as? UITextView { return input }
    for child in view.subviews {
      if let input = findInput(child, depth: depth + 1) { return input }
    }
    return nil
  }
  private func attachInput() {
    if let input, !input.isDescendant(of: self) { cancelPending(); detachInput() }
    guard window != nil else { return }
    guard let candidate = findInput(self) else { cancelPending(); detachInput(); inputDiagnostic("no_input"); return }
    guard candidate !== input else { return }
    cancelPending(); detachInput()
    // Own only this input's paste delegate; never replace another component's delegate.
    guard candidate.pasteDelegate == nil else { inputDiagnostic("delegate_busy"); return }
    input = candidate
    originalPasteConfiguration = candidate.pasteConfiguration
    let types = originalPasteConfiguration?.acceptableTypeIdentifiers ?? ["public.text"]
    candidate.pasteConfiguration = UIPasteConfiguration(acceptableTypeIdentifiers: Array(Set(types + ["public.image"])))
    candidate.pasteDelegate = self
    inputDiagnostic("attached")
  }
  private func inputDiagnostic(_ state: String) {
    #if DEBUG
    guard lastInputDiagnostic != state else { return }
    lastInputDiagnostic = state
    NSLog("OTRImagePaste input=%@", state)
    #endif
  }
  private func detachInput() {
    if let input, input.pasteDelegate === self {
      input.pasteDelegate = nil
      input.pasteConfiguration = originalPasteConfiguration
    }
    input = nil; originalPasteConfiguration = nil
  }
  func textPasteConfigurationSupporting(_ supporting: UITextPasteConfigurationSupporting, transform item: UITextPasteItem) {
    let provider = item.itemProvider
    guard provider.hasItemConformingToTypeIdentifier("public.image") else { item.setDefaultResult(); return }
    // An empty text result participates in UIKit's complete-paste boundary without inserting an attachment.
    defer { item.setResult(string: "") }
    guard supporting as? UITextView === input, input?.isDescendant(of: self) == true, enabled,
      ImagePastePolicy.validRequest(requestId), window != nil else { return }
    if batch != nil { failure(.loadFailed, requestId); return }
    let wave = pasteWave ?? ImagePasteWave<NSItemProvider>(requestId)
    pasteWave = wave
    wave.append(provider, supported: identifier(provider) != nil)
  }
  func textPasteConfigurationSupporting(_ supporting: UITextPasteConfigurationSupporting,
      combineItemAttributedStrings strings: [NSAttributedString], for textRange: UITextRange) -> NSAttributedString {
    if supporting as? UITextView === input, input?.isDescendant(of: self) == true, let wave = pasteWave {
      pasteWave = nil
      if enabled, requestId == wave.requestId, window != nil {
        do { paste(itemProviders: try wave.finish()) }
        catch { failure(error as? ImagePasteFailure ?? .loadFailed, wave.requestId) }
      }
    }
    return NSAttributedString(string: strings.map { $0.string }.joined())
  }
  func textPasteConfigurationSupporting(_ supporting: UITextPasteConfigurationSupporting,
      performPasteOf text: NSAttributedString, to range: UITextRange) -> UITextRange {
    // Image-only Paste must never delete an existing selected draft range.
    guard let input, supporting as? UITextView === input, input.isDescendant(of: self), enabled, input.isEditable,
      window != nil, text.length > 0 else { return range }
    input.selectedTextRange = range
    let start = input.offset(from: input.beginningOfDocument, to: range.start)
    input.insertText(text.string)
    guard let from = input.position(from: input.beginningOfDocument, offset: start),
      let to = input.position(from: from, offset: text.string.utf16.count),
      let result = input.textRange(from: from, to: to) else { return input.selectedTextRange ?? range }
    return result
  }
  func setRequest(_ value: String) {
    if requestId != value { cancelPending(); requestId = value }
  }
  func setEnabled(_ value: Bool) {
    enabled = value
    if !value { cancelPending() }

  }
  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { cancelPending(); detachInput() }
    else { attachInput() }
  }
  deinit {
    batch?.cancelPending(); progress?.cancel()
    ImagePasteStore.shared.releaseUnclaimed(emittedTokens)
  }
  // Plain-text UITextView can hide Paste for image-only content. Use its local responder chain.
  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    if action == #selector(paste(_:)), input?.isFirstResponder == true,
      input?.isDescendant(of: self) == true, enabled, batch == nil,
      ImagePastePolicy.validRequest(requestId), window != nil, UIPasteboard.general.hasImages { return true }
    return super.canPerformAction(action, withSender: sender)
  }
  override func paste(_ sender: Any?) {
    guard input?.isFirstResponder == true, input?.isDescendant(of: self) == true,
      enabled, batch == nil, ImagePastePolicy.validRequest(requestId), window != nil else { return }
    let providers = UIPasteboard.general.itemProviders
    #if DEBUG
    NSLog("OTRImagePaste action providers=%d images=%d", providers.count,
      providers.filter { $0.hasItemConformingToTypeIdentifier("public.image") }.count)
    #endif
    guard providers.contains(where: { $0.hasItemConformingToTypeIdentifier("public.image") }) else {
      input?.paste(sender); return
    }
    paste(itemProviders: providers)
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
        emittedTokens = ImagePasteStore.shared.unclaimedTokens(emittedTokens) + items.map { $0.token }
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
      } else {
        Self.providerFailure("file", type: type, provider: provider, error: error)
        Task { @MainActor in
          guard let self, self.current(value) else { value.cancelPending(); return }
          self.loadData(provider, type: type, providers: providers, index: index, current: value, items: items)
        }
        return
      }
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
  private func loadData(_ provider: NSItemProvider, type: String, providers: [(NSItemProvider, String)], index: Int, current value: ImagePasteBatch, items: [ImagePasteItem]) {
    progress = provider.loadDataRepresentation(forTypeIdentifier: type) { [weak self] data, error in
      let result: Result<ImagePasteItem, ImagePasteFailure>
      if let data, error == nil {
        do { result = .success(try value.copyProviderData(data)) }
        catch { result = .failure(error as? ImagePasteFailure ?? .storage) }
      } else {
        Self.providerFailure("data", type: type, provider: provider, error: error)
        Task { @MainActor in
          guard let self, self.current(value) else { value.cancelPending(); return }
          self.loadLegacy(provider, type: type, providers: providers, index: index, current: value, items: items)
        }
        return
      }
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
  private func loadLegacy(_ provider: NSItemProvider, type: String, providers: [(NSItemProvider, String)], index: Int, current value: ImagePasteBatch, items: [ImagePasteItem]) {
    provider.loadItem(forTypeIdentifier: type, options: nil) { [weak self] item, error in
      let result: Result<ImagePasteItem, ImagePasteFailure>
      do {
        if error != nil { throw ImagePasteFailure.loadFailed }
        if let data = item as? Data { result = .success(try value.copyProviderData(data)) }
        else if let url = item as? URL { result = .success(try value.copyProviderFile(url)) }
        // Never turn an opaque UIImage into new source bytes.
        else { throw ImagePasteFailure.unsupported }
      } catch let storageError {
        Self.providerFailure("legacy", type: type, provider: provider, error: error ?? storageError)
        result = .failure(storageError as? ImagePasteFailure ?? .storage)
      }
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
  nonisolated private static func providerFailure(_ phase: String, type: String, provider: NSItemProvider, error: Error?) {
    #if DEBUG
    let error = error as NSError?
    let domain = ["NSItemProviderErrorDomain", "NSCocoaErrorDomain"].contains(error?.domain ?? "") ? error!.domain : "OTHER"
    let underlying = error?.userInfo[NSUnderlyingErrorKey] as? NSError
    let underlyingDomain = ["NSItemProviderErrorDomain", "NSCocoaErrorDomain", "NSPOSIXErrorDomain"].contains(underlying?.domain ?? "") ? underlying!.domain : "OTHER"
    let registered = ImagePastePolicy.identifiers.filter { provider.registeredTypeIdentifiers.contains($0) }.joined(separator: ",")
    NSLog("OTRImagePaste phase=%@ type=%@ domain=%@ code=%ld formats=%@ underlyingDomain=%@ underlyingCode=%ld", phase, type, domain, error?.code ?? 0, registered, underlyingDomain, underlying?.code ?? 0)
    #endif
  }
  private func fail(_ value: ImagePasteBatch, _ error: ImagePasteFailure) {
    guard batch === value else { value.cancelPending(); return }
    cancelPending()
    if error != .cancelled { failure(error, value.requestId) }
  }
  private func failure(_ error: ImagePasteFailure, _ request: String) { onFailure(["requestId": request, "code": error.rawValue]) }
  private func cancelPending() {
    pasteWave?.cancel(); pasteWave = nil
    let pending = batch; batch = nil
    pending?.cancelPending()
    progress?.cancel(); progress = nil
    ImagePasteStore.shared.releaseUnclaimed(emittedTokens)
    emittedTokens = []
  }
}

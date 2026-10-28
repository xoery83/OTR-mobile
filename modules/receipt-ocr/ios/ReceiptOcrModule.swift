import ExpoModulesCore
import Foundation
import PDFKit
import ImageIO
import QuickLook
import UIKit
import UniformTypeIdentifiers
import Vision

public class ReceiptOcrModule: Module {
  private let lock = NSLock()
  private var running: [String: VNRecognizeTextRequest] = [:]
  private var cancelled: Set<String> = []
  private var previewSource: DraftPreviewSource?
  private var importPreview: (token: String, controller: ImportOriginalPreviewController)?
  private var cancelledImportPreviews: Set<String> = []

  public func definition() -> ModuleDefinition {
    Name("ReceiptOcr")
    Constant("importOriginalPreviewContractVersion") { 2 }

    OnCreate {
#if DEBUG && targetEnvironment(simulator)
      if ProcessInfo.processInfo.environment["OTR_QA_IMPORT_PREVIEW_STATE_TEST"] == "1" {
        DispatchQueue.main.async { runImportPreviewPrivateCloseChecks() }
      }
#endif
      // Remove only this preview adapter's disposable copies left by process termination.
      let directory = FileManager.default.temporaryDirectory
      for file in (try? FileManager.default.contentsOfDirectory(at: directory,
        includingPropertiesForKeys: nil)) ?? [] where file.lastPathComponent.hasPrefix("otr-import-") {
        try? FileManager.default.removeItem(at: file)
      }
    }

    AsyncFunction("recognize") { (uri: String, requestId: String) -> [String: Any] in
      return self.recognize(uri: uri, requestId: requestId)
    }

    AsyncFunction("extractFlightPdf") { (data: Data) -> [String: Any] in
      return FlightPdfExtractor.extract(data)
    }

    AsyncFunction("extractCaptureLocal") { (data: Data, mediaType: String) -> [String: Any] in
      return CaptureLocalExtractor.extract(data, mediaType: mediaType)
    }

    AsyncFunction("captureLocalModelCapability") { () -> [String: String] in
      return CaptureLocalExtractor.modelCapability()
    }

    AsyncFunction("proposeCaptureFlightAssemblyLocal") { (requestJSON: String, requestId: String, deadlineMs: Double) -> [String: Any] in
      return await CaptureLocalExtractor.assemble(requestJSON, requestId: requestId, deadlineMs: deadlineMs)
    }

    AsyncFunction("cancelCaptureFlightAssemblyLocal") { (requestId: String, deadlineMs: Double) in
      await CaptureLocalExtractor.cancelAssembly(requestId, deadlineMs: deadlineMs)
    }

    AsyncFunction("enrichCaptureFlightLocal") { (text: String) -> [String: Any] in
      return await CaptureLocalExtractor.enrich(text)
    }

    Function("cancel") { (requestId: String) in
      self.lock.lock()
      let request = self.running[requestId]
      if request != nil { self.cancelled.insert(requestId) }
      self.lock.unlock()
      request?.cancel()
    }

    AsyncFunction("capabilities") { () -> [String: Any] in
      let request = self.makeRequest()
      return [
        "engineRevision": request.revision,
        "supportedLanguages": (try? request.supportedRecognitionLanguages()) ?? []
      ]
    }

    AsyncFunction("previewImportOriginal") { (data: Data, token: String, displayName: String, promise: Promise) in
      DispatchQueue.main.async {
        if self.cancelledImportPreviews.remove(token) != nil { promise.resolve(nil); return }
        let reject: (String) -> Void = { reason in
          NSLog("import_original_preview_native %@", reason)
          promise.reject("IMPORT_PREVIEW_UNAVAILABLE", "Original preview unavailable")
        }
        guard UUID(uuidString: token) != nil else { reject("TOKEN"); return }
        guard self.importPreview == nil else { reject("BUSY"); return }
        guard !data.isEmpty, data.count <= 50 * 1024 * 1024 else { reject("PAYLOAD"); return }
        guard let presenter = self.appContext?.utilities?.currentViewController()
        else { reject("ROOT"); return }
        guard presenter.viewIfLoaded?.window != nil else { reject("PRESENTER_ATTACHED"); return }
        guard !presenter.isBeingDismissed else { reject("DISMISSING"); return }
        guard !presenter.isBeingPresented else { reject("PRESENTING"); return }
        guard presenter.transitionCoordinator == nil else { reject("TRANSITION"); return }
        let suffix: String
        if data.starts(with: Data("%PDF-".utf8)), PDFDocument(data: data) != nil {
          suffix = "pdf"
        } else if let image = CGImageSourceCreateWithData(data as CFData, nil),
          let type = CGImageSourceGetType(image) as String?,
          let ext = [UTType.jpeg.identifier: "jpg", UTType.png.identifier: "png",
            UTType.heic.identifier: "heic", UTType.heif.identifier: "heif"][type] {
          suffix = ext
        } else { promise.reject("IMPORT_PREVIEW_UNSUPPORTED", "Unsupported original"); return }
        let file = FileManager.default.temporaryDirectory
          .appendingPathComponent("otr-import-" + token).appendingPathExtension(suffix)
        do { try data.write(to: file, options: [.atomic, .completeFileProtection]) }
        catch { reject("WRITE"); return }
        let preview = ImportOriginalPreviewController(file: file, title: String(displayName.prefix(255))) { failed in
          try? FileManager.default.removeItem(at: file)
          if self.importPreview?.token == token { self.importPreview = nil }
          if failed { reject("PRESENTATION_REJECTED") }
          else { promise.resolve(nil) }
        }
        self.importPreview = (token, preview)
        presenter.present(preview, animated: true) { preview.didPresent() }
        // UIKit presentation completion, not the next run-loop turn, owns readiness.
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
          preview.failIfPresentationPending()
        }
      }
    }

    AsyncFunction("closeImportOriginal") { (token: String) in
      DispatchQueue.main.async {
        guard UUID(uuidString: token) != nil else { return }
        guard let preview = self.importPreview, preview.token == token else {
          self.cancelledImportPreviews.insert(token)
          return
        }
        preview.controller.closePrivateOriginal()
      }
    }

    Function("previewDraft") { (uri: String) -> Bool in
      guard let url = URL(string: uri), url.isFileURL,
        url.pathExtension.lowercased() == "pdf",
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
      else { return false }
      let file = url.resolvingSymlinksInPath().standardizedFileURL
      let root = documents.resolvingSymlinksInPath().standardizedFileURL.path
      let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
        .resolvingSymlinksInPath().standardizedFileURL.path
      let allowedRoots = [root + "/ledger-receipt-drafts/", root + "/ledger-receipts/"]
        + (cache.map { [$0 + "/ledger-receipt-previews/"] } ?? [])
      guard allowedRoots.contains(where: { file.path.hasPrefix($0) }),
        FileManager.default.fileExists(atPath: file.path)
      else { return false }
      DispatchQueue.main.async {
        guard let window = UIApplication.shared.connectedScenes
          .compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first,
          let root = window.rootViewController
        else { return }
        let source = DraftPreviewSource(file)
        let preview = DraftPreviewController()
        self.previewSource = source
        preview.dataSource = source
        var presenter = root
        while let presented = presenter.presentedViewController { presenter = presented }
        presenter.present(UINavigationController(rootViewController: preview), animated: true)
      }
      return true
    }
  }

  private func makeRequest() -> VNRecognizeTextRequest {
    let request = VNRecognizeTextRequest()
    request.revision = VNRecognizeTextRequestRevision3
    request.recognitionLevel = .accurate
    request.automaticallyDetectsLanguage = true
    request.usesLanguageCorrection = true
    return request
  }

  private func recognize(uri: String, requestId: String) -> [String: Any] {
    guard let url = URL(string: uri), url.isFileURL else {
      return ["error": "INVALID_FILE"]
    }
    let file = url.resolvingSymlinksInPath().standardizedFileURL
    guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
      return ["error": "INVALID_FILE"]
    }
    let root = documents.resolvingSymlinksInPath().standardizedFileURL.path
    let allowed = ["ledger-receipt-drafts", "ledger-receipts"].contains {
      file.path.hasPrefix(root + "/" + $0 + "/")
    }
    var isDirectory: ObjCBool = false
    guard allowed,
      FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory),
      !isDirectory.boolValue,
      let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize,
      size > 0, size <= 50 * 1024 * 1024
    else { return ["error": "INVALID_FILE"] }

    guard let source = CGImageSourceCreateWithURL(file as CFURL, nil),
      let type = CGImageSourceGetType(source) as String?,
      [UTType.jpeg.identifier, UTType.png.identifier, UTType.heic.identifier, UTType.heif.identifier].contains(type),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? Int,
      let height = properties[kCGImagePropertyPixelHeight] as? Int,
      width > 0, height > 0,
      width <= 60_000_000 / height,
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 3200
      ] as CFDictionary)
    else { return ["error": "UNSUPPORTED_IMAGE"] }

    let request = makeRequest()
    lock.lock()
    running[requestId] = request
    lock.unlock()
    defer {
      lock.lock()
      running.removeValue(forKey: requestId)
      cancelled.remove(requestId)
      lock.unlock()
    }

    let started = ProcessInfo.processInfo.systemUptime
    do {
      try VNImageRequestHandler(cgImage: image, orientation: .up).perform([request])
    } catch {
      return ["error": wasCancelled(requestId) ? "CANCELLED" : "VISION_FAILURE"]
    }
    if wasCancelled(requestId) { return ["error": "CANCELLED"] }

    let observations: [[String: Any]] = (request.results ?? []).compactMap { observation in
      guard let candidate = observation.topCandidates(1).first, !candidate.string.isEmpty else {
        return nil
      }
      let box = observation.boundingBox
      let left = min(1, max(0, box.minX))
      let top = min(1, max(0, 1 - box.maxY))
      let right = min(1, max(left, box.maxX))
      let bottom = min(1, max(top, 1 - box.minY))
      // Vision is bottom-left; the app contract is normalized top-left.
      return [
        "text": candidate.string,
        "confidence": candidate.confidence,
        "boundingBox": [
          "x": left,
          "y": top,
          "width": right - left,
          "height": bottom - top
        ]
      ]
    }
    return [
      "engine": "apple-vision",
      "engineRevision": request.revision,
      "imageWidth": image.width,
      "imageHeight": image.height,
      "durationMs": Int((ProcessInfo.processInfo.systemUptime - started) * 1000),
      "supportedLanguages": (try? request.supportedRecognitionLanguages()) ?? [],
      "observations": observations
    ]
  }

  private func wasCancelled(_ requestId: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelled.contains(requestId)
  }
}

private final class DraftPreviewSource: NSObject, QLPreviewControllerDataSource {
  private let file: URL
  init(_ file: URL) { self.file = file }
  func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
  func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
    file as NSURL
  }
}

private final class DraftPreviewController: QLPreviewController {
  override func viewDidLoad() {
    super.viewDidLoad()
    navigationItem.leftBarButtonItem = UIBarButtonItem(
      title: "Close", style: .plain, target: self, action: #selector(closePreview))
  }

  @objc private func closePreview() {
    navigationController?.dismiss(animated: true)
  }
}

private final class ImportOriginalPreviewItem: NSObject, QLPreviewItem {
  let previewItemURL: URL?
  let previewItemTitle: String?
  init(file: URL, title: String?) {
    previewItemURL = file
    previewItemTitle = title
    super.init()
  }
}

// Owns only the disposable preview copy; the durable Capture original remains in its repository.
private final class ImportOriginalPreviewController: QLPreviewController, QLPreviewControllerDataSource {
  private let item: ImportOriginalPreviewItem
  private var finish: ((Bool) -> Void)?
  private var presented = false
  private var closeRequested = false
  init(file: URL, title: String? = nil, finish: @escaping (Bool) -> Void) {
    self.item = ImportOriginalPreviewItem(file: file, title: title)
    self.finish = finish
    super.init(nibName: nil, bundle: nil)
    dataSource = self
    NotificationCenter.default.addObserver(self, selector: #selector(hidePrivateOriginal),
      name: UIApplication.willResignActiveNotification, object: nil)
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
  func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
    item
  }
  func failIfPresentationPending() {
    guard !presented, finish != nil else { return }
    closePrivateOriginal()
    complete(true)
  }
  func didPresent() {
    presented = true
    if closeRequested { closePrivateOriginal() }
  }
  func closePrivateOriginal() {
    closeRequested = true
    viewIfLoaded?.isHidden = true
    guard presented else { return }
    dismiss(animated: false) { self.complete() }
  }
  private func complete(_ failed: Bool = false) {
    let cleanup = finish
    finish = nil
    cleanup?(failed)
  }
  @objc private func hidePrivateOriginal() { closePrivateOriginal() }
  override func viewDidLoad() {
    super.viewDidLoad()
    if closeRequested { view.isHidden = true }
  }
  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    guard isBeingDismissed || presentingViewController == nil else { return }
    complete()
  }
  deinit { NotificationCenter.default.removeObserver(self) }
}

#if DEBUG && targetEnvironment(simulator)
// Exercises the actual controller offscreen; no Capture bytes, file writes or public test port.
private func runImportPreviewPrivateCloseChecks() {
  for loadedBeforeTimeout in [true, false] {
    var finishes = 0
    var hiddenAtFinish = false
    weak var subject: ImportOriginalPreviewController?
    let controller = ImportOriginalPreviewController(
      file: FileManager.default.temporaryDirectory.appendingPathComponent("otr-import-qa-state-test.pdf")
    ) { _ in
      finishes += 1
      hiddenAtFinish = subject?.viewIfLoaded?.isHidden ?? true
    }
    subject = controller
    let startedUnloaded = !controller.isViewLoaded
    if loadedBeforeTimeout { controller.loadViewIfNeeded() }
    let fixtureReady = loadedBeforeTimeout ? controller.isViewLoaded : startedUnloaded
    controller.failIfPresentationPending()
    controller.loadViewIfNeeded()
    let hiddenAfterLateLoad = controller.view.isHidden
    controller.didPresent()
    controller.failIfPresentationPending()
    let passed = fixtureReady && finishes == 1 && hiddenAtFinish && hiddenAfterLateLoad
    NSLog("import_original_preview_state %@ %@",
      loadedBeforeTimeout ? "LOADED_TIMEOUT" : "TIMEOUT_LATE_LOAD", passed ? "PASS" : "FAIL")
  }
}
#endif

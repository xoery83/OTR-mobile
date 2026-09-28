import ExpoModulesCore
import Foundation
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

  public func definition() -> ModuleDefinition {
    Name("ReceiptOcr")

    AsyncFunction("recognize") { (uri: String, requestId: String) -> [String: Any] in
      return self.recognize(uri: uri, requestId: requestId)
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

    Function("previewDraft") { (uri: String) -> Bool in
      guard let url = URL(string: uri), url.isFileURL,
        url.pathExtension.lowercased() == "pdf",
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
      else { return false }
      let file = url.resolvingSymlinksInPath().standardizedFileURL
      let root = documents.resolvingSymlinksInPath().standardizedFileURL.path
      guard file.path.hasPrefix(root + "/ledger-receipt-drafts/"),
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

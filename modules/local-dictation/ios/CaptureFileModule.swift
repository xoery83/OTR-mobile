import Foundation
import UniformTypeIdentifiers

// Metadata staging never opens, copies, hashes or persists file content.
enum CaptureFileFailure: String, Error, LocalizedError {
  case limit = "CAPTURE_FILE_LIMIT", invalid = "CAPTURE_FILE_INVALID"
  case expired = "CAPTURE_FILE_LEASE_EXPIRED", opened = "CAPTURE_FILE_ALREADY_OPEN"
  case notOpen = "CAPTURE_FILE_NOT_OPEN", read = "CAPTURE_FILE_READ_FAILED"
  case busy = "CAPTURE_FILE_PICKER_BUSY", presenter = "CAPTURE_FILE_PRESENTER_UNAVAILABLE"
  var errorDescription: String? { rawValue }
}

final class CaptureFileLeaseStore {
  static let maxItems = 10
  static let maxRead = 65_536
  private final class Lease {
    let url: URL
    let scoped: Bool
    var handle: FileHandle?
    init(_ url: URL, scoped: Bool) { self.url = url; self.scoped = scoped }
  }
  private let lock = NSLock()
  private var leases: [String: Lease] = [:]
  private let startScope: (URL) -> Bool
  private let stopScope: (URL) -> Void
  init(startScope: @escaping (URL) -> Bool = { $0.startAccessingSecurityScopedResource() },
       stopScope: @escaping (URL) -> Void = { $0.stopAccessingSecurityScopedResource() }) {
    self.startScope = startScope; self.stopScope = stopScope
  }
  private func dispose(_ lease: Lease) {
    try? lease.handle?.close(); lease.handle = nil
    if lease.scoped { stopScope(lease.url) }
  }
  func stage(_ urls: [URL]) throws -> [[String: Any]] {
    lock.lock(); defer { lock.unlock() }
    guard !urls.isEmpty, urls.count <= Self.maxItems,
      leases.count + urls.count <= Self.maxItems else { throw CaptureFileFailure.limit }
    var staged: [(String, Lease)] = []
    do {
      var result: [[String: Any]] = []
      for url in urls {
        guard url.isFileURL else { throw CaptureFileFailure.invalid }
        let lease = Lease(url, scoped: startScope(url))
        let token = UUID().uuidString.lowercased()
        staged.append((token, lease))
        let metadata = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard metadata.isRegularFile == true else { throw CaptureFileFailure.invalid }
        // A false scope result can be a normal picker-provided app-local URL.
        // Only the picker supplies URLs; JS can never pass a path to this store.
        var item: [String: Any] = ["token": token, "name": url.lastPathComponent]
        if let size = metadata.fileSize { item["size"] = size }
        item["mimeType"] = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        result.append(item)
      }
      for (token, lease) in staged { leases[token] = lease }
      return result
    } catch {
      for (_, lease) in staged { dispose(lease) }
      throw CaptureFileFailure.invalid
    }
  }
  @discardableResult func open(_ token: String) throws -> Int {
    lock.lock(); defer { lock.unlock() }
    guard let lease = leases[token] else { throw CaptureFileFailure.expired }
    guard lease.handle == nil else { throw CaptureFileFailure.opened }
    do {
      let metadata = try lease.url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
      guard metadata.isRegularFile == true, let size = metadata.fileSize, size >= 0 else { throw CaptureFileFailure.invalid }
      lease.handle = try FileHandle(forReadingFrom: lease.url)
      return size
    } catch {
      leases.removeValue(forKey: token); dispose(lease)
      throw CaptureFileFailure.read
    }
  }
  func read(_ token: String, maxBytes: Int) throws -> [String: Any] {
    guard (1...Self.maxRead).contains(maxBytes) else { throw CaptureFileFailure.limit }
    lock.lock(); defer { lock.unlock() }
    guard let lease = leases[token] else { throw CaptureFileFailure.expired }
    guard let handle = lease.handle else { throw CaptureFileFailure.notOpen }
    do {
      let data = try handle.read(upToCount: maxBytes) ?? Data()
      return ["base64": data.base64EncodedString(), "byteCount": data.count, "eof": data.isEmpty]
    } catch {
      leases.removeValue(forKey: token); dispose(lease)
      throw CaptureFileFailure.read
    }
  }
  func release(_ tokens: [String]) throws {
    guard tokens.count <= Self.maxItems else { throw CaptureFileFailure.limit }
    lock.lock(); defer { lock.unlock() }
    for token in tokens { if let lease = leases.removeValue(forKey: token) { dispose(lease) } }
  }
  func releaseAll() {
    lock.lock(); defer { lock.unlock() }
    let old = leases; leases.removeAll()
    for lease in old.values { dispose(lease) }
  }
  deinit { releaseAll() }
}

#if canImport(ExpoModulesCore) && canImport(UIKit)
import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

public final class CaptureFileModule: Module {
  private let picker = CaptureFilePicker()
  public func definition() -> ModuleDefinition {
    Name("OTRCaptureFiles")
    AsyncFunction("pick") { [weak self] (promise: Promise) in
      guard let self, let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject(CaptureFileFailure.presenter); return
      }
      self.picker.pick(from: presenter, promise: promise)
    }.runOnQueue(.main)
    AsyncFunction("open") { [weak self] (token: String) -> [String: Int] in
      guard let self else { throw CaptureFileFailure.expired }
      return ["size": try self.picker.store.open(token)]
    }
    AsyncFunction("read") { [weak self] (token: String, maxBytes: Int) -> String in
      guard let self else { throw CaptureFileFailure.expired }
      return try self.picker.store.read(token, maxBytes: maxBytes)["base64"] as! String
    }
    AsyncFunction("close") { [weak self] (token: String) in
      guard let self else { return }; try self.picker.store.release([token])
    }
    AsyncFunction("release") { [weak self] (tokens: [String]) in
      guard let self else { return }; try self.picker.store.release(tokens)
    }
    AsyncFunction("releaseAll") { [weak self] in self?.picker.invalidate() }.runOnQueue(.main)
    OnDestroy { [weak self] in
      guard let picker = self?.picker else { return }
      picker.store.releaseAll()
      DispatchQueue.main.async { picker.invalidate() }
    }
  }
}

private final class CaptureFileDelegate: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  weak var owner: CaptureFilePicker?
  let request: UUID
  init(_ owner: CaptureFilePicker, request: UUID) { self.owner = owner; self.request = request }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { owner?.selected(urls, request: request) }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { owner?.cancel(request: request) }
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { owner?.cancel(request: request) }
}

private final class CaptureFilePicker {
  let store = CaptureFileLeaseStore()
  private struct Pending {
    let request: UUID
    let controller: UIDocumentPickerViewController
    let delegate: CaptureFileDelegate
    let promise: Promise
  }
  private var pending: Pending?
  private var background: NSObjectProtocol?
  init() {
    background = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.invalidate() }
  }
  func pick(from presenter: UIViewController, promise: Promise) {
    guard pending == nil else { promise.reject(CaptureFileFailure.busy); return }
    guard presenter.viewIfLoaded?.window != nil, presenter.presentedViewController == nil else { promise.reject(CaptureFileFailure.presenter); return }
    let request = UUID()
    let controller = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: false)
    let delegate = CaptureFileDelegate(self, request: request)
    controller.allowsMultipleSelection = true
    controller.delegate = delegate
    pending = Pending(request: request, controller: controller, delegate: delegate, promise: promise)
    presenter.present(controller, animated: true)
    controller.presentationController?.delegate = delegate
  }
  func selected(_ urls: [URL], request: UUID) {
    guard let value = pending, value.request == request else { return }
    pending = nil
    do { value.promise.resolve(["canceled": false, "assets": try store.stage(urls)]) }
    catch { value.promise.reject(error) }
  }
  func cancel(request: UUID) {
    guard let value = pending, value.request == request else { return }
    pending = nil; value.promise.resolve(["canceled": true, "assets": []] as [String: Any])
  }
  func invalidate() {
    store.releaseAll()
    if let value = pending {
      pending = nil
      value.promise.resolve(["canceled": true, "assets": []] as [String: Any])
      value.controller.dismiss(animated: false)
    }
  }
  deinit {
    if let background { NotificationCenter.default.removeObserver(background) }
    store.releaseAll()
  }
}
#endif

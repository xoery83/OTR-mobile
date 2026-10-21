import Foundation

enum ImagePasteFailure: String, Error {
  case unsupported, limit, loadFailed = "load_failed", invalidImage = "invalid_image", storage, cancelled
}
struct ImagePasteItem {
  let token: String
  let url: URL
  let byteSize: Int
  let mimeType: String
  var body: [String: Any] {
    ["token": token, "uri": url.absoluteString, "byteSize": byteSize, "mimeType": mimeType,
     "source": "clipboard", "representation": "item-provider"]
  }
}
enum ImagePastePolicy {
  static let maxBytes = 20 * 1024 * 1024
  static let maxItems = 10
  static let identifiers = ["public.png", "public.jpeg", "public.heic", "public.heif", "org.webmproject.webp", "public.image"]
  static func validRequest(_ id: String) -> Bool {
    !id.isEmpty && id.utf8.count <= 80 && id.unicodeScalars.allSatisfy { (0x21...0x7e).contains($0.value) }
  }
  static func format(_ bytes: Data) throws -> (mime: String, ext: String) {
    let b = [UInt8](bytes)
    if b.starts(with: [137,80,78,71,13,10,26,10]) { return ("image/png", "png") }
    if b.starts(with: [255,216,255]) { return ("image/jpeg", "jpg") }
    if b.count >= 12, String(bytes: b[0..<4], encoding: .ascii) == "RIFF",
       String(bytes: b[8..<12], encoding: .ascii) == "WEBP" { return ("image/webp", "webp") }
    if b.count >= 16, String(bytes: b[4..<8], encoding: .ascii) == "ftyp" {
      let brands = [String(bytes: b[8..<12], encoding: .ascii) ?? ""] + stride(from: 16, through: b.count - 4, by: 4).map { String(bytes: b[$0..<($0 + 4)], encoding: .ascii) ?? "" }
      if brands.contains("avif") || brands.contains("avis") { throw ImagePasteFailure.unsupported }
      if brands.contains(where: { ["heic", "heix", "hevc", "hevx", "heim", "heis"].contains($0) }) { return ("image/heic", "heic") }
      if brands.contains("mif1") || brands.contains("msf1") { return ("image/heif", "heif") }
    }
    throw ImagePasteFailure.invalidImage
  }
}

// A provider URL exists only during its callback. Copy there, then fence main-thread delivery.
final class ImagePasteBatch {
  let requestId: String
  let directory: URL
  let maxItems: Int
  private let maxBytes: Int
  private let lock = NSLock()
  private var cancelled = false
  private var delivered = false
  private var used = 0
  init(requestId: String, directory: URL, maxBytes: Int = ImagePastePolicy.maxBytes, maxItems: Int = ImagePastePolicy.maxItems) throws {
    self.requestId = requestId; self.directory = directory
    self.maxBytes = maxBytes; self.maxItems = maxItems
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
      attributes: [.posixPermissions: 0o700])
  }
  func cancelPending() {
    lock.lock(); cancelled = true; let remove = !delivered; lock.unlock()
    if remove { try? FileManager.default.removeItem(at: directory) }
  }
  func markDeliveredIfCurrent() -> Bool {
    lock.lock(); defer { lock.unlock() }
    guard !cancelled, !delivered else { return false }
    delivered = true; return true
  }
  func isCurrent() -> Bool { lock.lock(); defer { lock.unlock() }; return !cancelled }
  // Some system clipboard providers expose encoded data but no file representation.
  // NSItemProvider owns the returned allocation; reject before copying/decoding it.
  func copyProviderData(_ data: Data) throws -> ImagePasteItem {
    guard !data.isEmpty else { throw ImagePasteFailure.invalidImage }
    guard data.count <= maxBytes else { throw ImagePasteFailure.limit }
    let format = try ImagePastePolicy.format(Data(data.prefix(64)))
    lock.lock()
    let allowed = !cancelled && used <= maxBytes - data.count
    if allowed { used += data.count }
    lock.unlock()
    guard allowed else { throw ImagePasteFailure.limit }
    let token = UUID().uuidString.lowercased()
    let url = directory.appendingPathComponent(token + "." + format.ext)
    try data.write(to: url, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    #if os(iOS)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
    #endif
    guard isCurrent() else { try? FileManager.default.removeItem(at: url); throw ImagePasteFailure.cancelled }
    return ImagePasteItem(token: token, url: url, byteSize: data.count, mimeType: format.mime)
  }
  func copyProviderFile(_ source: URL) throws -> ImagePasteItem {
    guard isCurrent() else { throw ImagePasteFailure.cancelled }
    guard source.isFileURL else { throw ImagePasteFailure.invalidImage }
    let values = try source.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
    guard values.isRegularFile == true, values.isSymbolicLink != true else { throw ImagePasteFailure.invalidImage }
    if let size = values.fileSize, size > maxBytes { throw ImagePasteFailure.limit }
    let token = UUID().uuidString.lowercased()
    let temporary = directory.appendingPathComponent(token + ".tmp")
    guard FileManager.default.createFile(atPath: temporary.path, contents: nil, attributes: [.posixPermissions: 0o600]),
      let input = InputStream(url: source), let output = OutputStream(url: temporary, append: false)
    else { throw ImagePasteFailure.storage }
    input.open(); output.open(); defer { input.close(); output.close() }
    var buffer = [UInt8](repeating: 0, count: 65536), count = 0
    var header = Data()
    while true {
      guard isCurrent() else { throw ImagePasteFailure.cancelled }
      let read = input.read(&buffer, maxLength: buffer.count)
      if read < 0 { throw ImagePasteFailure.loadFailed }
      if read == 0 { break }
      lock.lock(); let allowed = !cancelled && used <= maxBytes - read
      if allowed { used += read }; lock.unlock()
      guard allowed else { throw ImagePasteFailure.limit }
      if header.count < 64 { header.append(contentsOf: buffer.prefix(min(read, 64 - header.count))) }
      var written = 0
      while written < read {
        let n = buffer.withUnsafeBufferPointer { p in output.write(p.baseAddress! + written, maxLength: read - written) }
        guard n > 0 else { throw ImagePasteFailure.storage }; written += n
      }
      count += read
    }
    guard count > 0, isCurrent() else { throw ImagePasteFailure.invalidImage }
    let format = try ImagePastePolicy.format(header)
    let destination = directory.appendingPathComponent(token + "." + format.ext)
    try FileManager.default.moveItem(at: temporary, to: destination)
    #if os(iOS)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: destination.path)
    #endif
    return ImagePasteItem(token: token, url: destination, byteSize: count, mimeType: format.mime)
  }
}

final class ImagePasteStore {
  static let shared = ImagePasteStore()
  private let lock = NSLock()
  private let root: URL
  private struct Registration {
    let item: ImagePasteItem
    let requestId: String
    var claimed = false
  }
  private var delivered: [String: Registration] = [:]
  private weak var pending: ImagePasteBatch?
  init(root: URL = FileManager.default.temporaryDirectory.appendingPathComponent("otr-image-paste-v1", isDirectory: true)) {
    self.root = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
    // Only this module's orphaned process folders; never scan another cache or user path.
    if let old = try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
      for directory in old where UUID(uuidString: directory.lastPathComponent) != nil { try? FileManager.default.removeItem(at: directory) }
    }
  }
  func batch(requestId: String) throws -> ImagePasteBatch {
    lock.lock(); defer { lock.unlock() }
    let remainingBytes = ImagePastePolicy.maxBytes - delivered.values.reduce(0, { $0 + $1.item.byteSize })
    let remainingItems = ImagePastePolicy.maxItems - delivered.count
    guard pending?.isCurrent() != true, remainingBytes > 0, remainingItems > 0 else { throw ImagePasteFailure.limit }
    let value = try ImagePasteBatch(requestId: requestId, directory: root.appendingPathComponent(UUID().uuidString, isDirectory: true), maxBytes: remainingBytes, maxItems: remainingItems)
    pending = value
    return value
  }
  func deliver(_ items: [ImagePasteItem], batch: ImagePasteBatch) throws {
    lock.lock(); defer { lock.unlock() }
    guard pending === batch, batch.isCurrent(), !items.isEmpty, items.count <= batch.maxItems, delivered.count + items.count <= ImagePastePolicy.maxItems,
      delivered.values.reduce(0, { $0 + $1.item.byteSize }) + items.reduce(0, { $0 + $1.byteSize }) <= ImagePastePolicy.maxBytes
    else { throw ImagePasteFailure.limit }
    guard batch.markDeliveredIfCurrent() else { throw ImagePasteFailure.cancelled }
    for item in items { delivered[item.token] = Registration(item: item, requestId: batch.requestId) }
    pending = nil
  }
  // The lock makes lifecycle cleanup and JS ownership transfer mutually exclusive.
  func claim(requestId: String, tokens: [String]) -> Bool {
    lock.lock(); defer { lock.unlock() }
    guard !tokens.isEmpty, tokens.count <= ImagePastePolicy.maxItems, Set(tokens).count == tokens.count,
      tokens.allSatisfy({ token in
        guard UUID(uuidString: token)?.uuidString.lowercased() == token,
          let value = delivered[token], !value.claimed,
          value.requestId == requestId else { return false }
        return FileManager.default.fileExists(atPath: value.item.url.path)
      }) else { return false }
    for token in tokens { delivered[token]?.claimed = true }
    return true
  }
  func releaseUnclaimed(_ tokens: [String]) { remove(tokens, unclaimedOnly: true) }
  func unclaimedTokens(_ tokens: [String]) -> [String] {
    lock.lock(); defer { lock.unlock() }
    return tokens.filter { delivered[$0]?.claimed == false }
  }
  func release(_ tokens: [String]) {
    remove(tokens, unclaimedOnly: false)
  }
  private func remove(_ tokens: [String], unclaimedOnly: Bool) {
    lock.lock()
    let removed = tokens.compactMap { token -> ImagePasteItem? in
      guard let value = delivered[token], !unclaimedOnly || !value.claimed else { return nil }
      return delivered.removeValue(forKey: token)?.item
    }
    lock.unlock()
    for item in removed {
      try? FileManager.default.removeItem(at: item.url)
      let parent = item.url.deletingLastPathComponent()
      if (try? FileManager.default.contentsOfDirectory(atPath: parent.path).isEmpty) == true { try? FileManager.default.removeItem(at: parent) }
    }
  }
}

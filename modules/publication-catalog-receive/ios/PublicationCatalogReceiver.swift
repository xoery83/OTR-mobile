import Foundation

// Internal request injection exists only for local fixture tests; the Expo boundary uses request().
final class PublicationCatalogReceiver: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  static let origin = "https://api-dev.xoery.art"
  static let successLimit = 4_194_304
  static let errorLimit = 8_192

  enum Outcome {
    case complete(Int, Data)
    case failed(String)
  }

  static func request(tripId: String, token: String) -> URLRequest? {
    guard UUID(uuidString: tripId)?.uuidString.lowercased() == tripId,
      !token.isEmpty, token.utf8.count <= 8192,
      token.utf8.allSatisfy({ (33...126).contains($0) })
    else { return nil }
    var request = URLRequest(
      url: URL(string: "\(origin)/v2/trips/\(tripId)/source-import-catalogs")!,
      cachePolicy: .reloadIgnoringLocalAndRemoteCacheData
    )
    request.httpMethod = "GET"
    request.httpShouldHandleCookies = false
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("1", forHTTPHeaderField: "X-OTR-Publication-Catalog-Version")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
    return request
  }

  private let queue = DispatchQueue(label: "otr.publication.receive")
  private let deadline: DispatchTime
  private var timer: DispatchSourceTimer?
  private var session: URLSession?
  private var task: URLSessionDataTask?
  private var completion: ((Outcome) -> Void)?
  private var body = Data()
  private var status: Int?
  private var finished = false
  private(set) var maximumRetained = 0
  private(set) var maximumDeliveredChunk = 0

  init(request: URLRequest, timeoutMs: Int, completion: @escaping (Outcome) -> Void) {
    deadline = .now() + .milliseconds(max(1, min(timeoutMs, 30_000)))
    self.completion = completion
    super.init()
    let configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil
    configuration.httpCookieStorage = nil
    configuration.urlCredentialStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    configuration.timeoutIntervalForRequest = Double(max(1, min(timeoutMs, 30_000))) / 1000
    configuration.timeoutIntervalForResource = configuration.timeoutIntervalForRequest
    let delegateQueue = OperationQueue()
    delegateQueue.maxConcurrentOperationCount = 1
    delegateQueue.underlyingQueue = queue
    let session = URLSession(
      configuration: configuration, delegate: self, delegateQueue: delegateQueue)
    self.session = session
    var boundedRequest = request
    boundedRequest.timeoutInterval = configuration.timeoutIntervalForRequest
    let task = session.dataTask(with: boundedRequest)
    self.task = task
    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(deadline: deadline)
    timer.setEventHandler { [weak self] in self?.finish(.failed("REQUEST_TIMEOUT")) }
    self.timer = timer
    timer.resume()
    task.resume()
  }

  func cancel() {
    queue.sync { finish(.failed("REQUEST_CANCELED")) }
  }

  private func current() -> Bool {
    if finished { return false }
    if DispatchTime.now() >= deadline {
      finish(.failed("REQUEST_TIMEOUT"))
      return false
    }
    return true
  }

  private func finish(_ outcome: Outcome) {
    guard !finished else { return }
    finished = true
    timer?.cancel()
    timer = nil
    task?.cancel()
    session?.invalidateAndCancel()
    task = nil
    session = nil
    body = Data()
    let callback = completion
    completion = nil
    callback?(outcome)
  }

  func urlSession(
    _ session: URLSession, dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    guard current() else {
      completionHandler(.cancel)
      return
    }
    guard let response = response as? HTTPURLResponse,
      (200...599).contains(response.statusCode),
      !(300...399).contains(response.statusCode),
      !(201...299).contains(response.statusCode)
    else {
      completionHandler(.cancel)
      finish(.failed("INVALID_RESPONSE"))
      return
    }
    let encoding = (response.value(forHTTPHeaderField: "Content-Encoding") ?? "identity")
      .trimmingCharacters(in: .whitespaces).lowercased()
    guard encoding == "identity" else {
      completionHandler(.cancel)
      finish(.failed("UNSUPPORTED_ENCODING"))
      return
    }
    status = response.statusCode
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard current(), let status else { return }
    maximumDeliveredChunk = max(maximumDeliveredChunk, data.count)
    let limit = status == 200 ? Self.successLimit : Self.errorLimit
    // URLSession delivers decoded bytes here; count before retaining or enqueueing any body data.
    guard data.count <= limit - body.count else {
      finish(.failed("BODY_LIMIT"))
      return
    }
    // Gzip's first byte cannot start Catalog JSON; reject it even when the signature is split.
    if body.isEmpty && data.first == 0x1f {
      finish(.failed("UNSUPPORTED_ENCODING"))
      return
    }
    body.append(data)
    maximumRetained = max(maximumRetained, body.count)
  }

  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
    if current() { finish(.failed("REDIRECT_DENIED")) }
  }

  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard current() else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }
    if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
      completionHandler(.performDefaultHandling, nil)
    } else {
      completionHandler(.cancelAuthenticationChallenge, nil)
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard current() else { return }
    if let error = error as NSError? {
      let code: String
      if error.code == NSURLErrorTimedOut {
        code = "REQUEST_TIMEOUT"
      } else if [
        NSURLErrorSecureConnectionFailed, NSURLErrorServerCertificateHasBadDate,
        NSURLErrorServerCertificateUntrusted, NSURLErrorServerCertificateHasUnknownRoot,
        NSURLErrorServerCertificateNotYetValid, NSURLErrorClientCertificateRejected,
        NSURLErrorClientCertificateRequired,
      ].contains(error.code) {
        code = "TLS_FAILURE"
      } else {
        code = "NETWORK_FAILURE"
      }
      finish(.failed(code))
    } else if let status {
      finish(.complete(status, body))
    } else {
      finish(.failed("INVALID_RESPONSE"))
    }
  }
}

// One request/result owner, held until JS acknowledgement rather than native completion.
final class PublicationCatalogReceiveSlot: @unchecked Sendable {
  let queue = DispatchQueue(label: "otr.publication.module")
  private var active: (id: String, receiver: PublicationCatalogReceiver)?
  private var closed = false

  // Called on queue by Expo's AsyncFunction or the native fixture harness.
  func start(
    id: String, request: URLRequest, timeoutMs: Int,
    completion: @escaping (PublicationCatalogReceiver.Outcome) -> Void
  ) {
    guard !closed else {
      completion(.failed("PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE"))
      return
    }
    guard active == nil else {
      completion(.failed("BUSY"))
      return
    }
    let receiver = PublicationCatalogReceiver(
      request: request, timeoutMs: timeoutMs, completion: completion)
    active = (id, receiver)
  }

  func cancel(_ id: String) {
    queue.async { if self.active?.id == id { self.active?.receiver.cancel() } }
  }

  func release(_ id: String) {
    queue.async {
      if self.active?.id == id {
        self.active?.receiver.cancel()
        self.active = nil
      }
    }
  }

  func close() {
    queue.async {
      self.closed = true
      self.active?.receiver.cancel()
      self.active = nil
    }
  }
}

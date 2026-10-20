import Foundation

// Test-only observation: allow platform decoding, retain only a two-byte prefix.
final class EncodingProbe: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  let done = DispatchSemaphore(value: 0)
  var count = 0
  var prefix = Data()
  var encoding = "ABSENT"
  var originalHeaders: [String] = []
  func urlSession(
    _ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    let http = response as! HTTPURLResponse
    encoding = http.value(forHTTPHeaderField: "Content-Encoding") ?? "ABSENT"
    originalHeaders = http.allHeaderFields.compactMap { key, value in
      String(describing: key).lowercased() == "content-encoding" ? String(describing: value) : nil
    }
    completionHandler(.allow)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    count += data.count
    prefix.append(data.prefix(2 - prefix.count))
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let result: [String: Any] = [
      "encoding": encoding, "headers": originalHeaders, "bytes": count,
      "prefix": Array(prefix), "error": error == nil ? "NONE" : "ERROR",
    ]
    let serialized = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    print(String(data: serialized, encoding: .utf8)!)
    done.signal()
  }
}

let arguments = CommandLine.arguments
if arguments[1] == "headers" {
  let probe = EncodingProbe()
  var request = URLRequest(url: URL(string: arguments[2])!)
  request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
  let session = URLSession(configuration: .ephemeral, delegate: probe, delegateQueue: nil)
  session.dataTask(with: request).resume()
  precondition(probe.done.wait(timeout: .now() + .seconds(5)) == .success)
  session.invalidateAndCancel()
  exit(0)
}
if arguments[1] == "policy" {
  let trip = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  let request = PublicationCatalogReceiver.request(tripId: trip, token: "synthetic-token")!
  precondition(
    request.url!.absoluteString
      == "https://api-dev.xoery.art/v2/trips/\(trip)/source-import-catalogs")
  precondition(
    request.httpMethod == "GET" && request.httpBody == nil && !request.httpShouldHandleCookies)
  precondition(request.value(forHTTPHeaderField: "X-OTR-Publication-Catalog-Version") == "1")
  precondition(request.value(forHTTPHeaderField: "Accept-Encoding") == "identity")
  for invalid in ["", "bad\r\nheader", "token space", String(repeating: "x", count: 8193)] {
    precondition(PublicationCatalogReceiver.request(tripId: trip, token: invalid) == nil)
  }
  precondition(PublicationCatalogReceiver.request(tripId: "../other", token: "x") == nil)
  precondition(PublicationCatalogReceiver.request(tripId: trip.uppercased(), token: "x") == nil)
  print("policy PASS")
  exit(0)
}

if arguments[1] == "slot" {
  let slot = PublicationCatalogReceiveSlot()
  var request = URLRequest(url: URL(string: arguments[2])!)
  request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
  let completed = DispatchSemaphore(value: 0)
  let callback: (PublicationCatalogReceiver.Outcome) -> Void = { outcome in
    guard case .complete = outcome else { preconditionFailure("expected complete") }
    completed.signal()
  }
  slot.queue.sync {
    slot.start(id: "first", request: request, timeoutMs: 3000, completion: callback)
  }
  precondition(completed.wait(timeout: .now() + .seconds(5)) == .success)
  // The completed result is still unacknowledged: paused JS cannot accumulate another body.
  let busy: (PublicationCatalogReceiver.Outcome) -> Void = { outcome in
    guard case .failed("BUSY") = outcome else { preconditionFailure("expected BUSY") }
  }
  slot.queue.sync { slot.start(id: "second", request: request, timeoutMs: 3000, completion: busy) }
  slot.cancel("first")
  slot.release("wrong")
  slot.queue.sync { slot.start(id: "second", request: request, timeoutMs: 3000, completion: busy) }
  slot.release("first")
  slot.queue.sync {
    slot.start(id: "second", request: request, timeoutMs: 3000, completion: callback)
  }
  slot.cancel("first")
  slot.release("first")
  precondition(completed.wait(timeout: .now() + .seconds(5)) == .success)
  slot.close()
  slot.queue.sync {
    slot.start(id: "after-destroy", request: request, timeoutMs: 3000) { outcome in
      guard case .failed("PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE") = outcome else {
        preconditionFailure("closed slot must deny new work")
      }
    }
  }
  print("slot ownership/paused JS/wrong release/stale cancellation/destroy PASS")
  exit(0)
}

let stopped = DispatchSemaphore(value: 0)
let lock = NSLock()
var result: [String: Any] = [:]
var completions = 0
var request = URLRequest(url: URL(string: arguments[1])!)
request.setValue("Bearer synthetic-token", forHTTPHeaderField: "Authorization")
request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
let receiver = PublicationCatalogReceiver(request: request, timeoutMs: Int(arguments[2])!) {
  outcome in
  lock.lock()
  completions += 1
  switch outcome {
  case .complete(let status, let bytes):
    result = [
      "status": status, "bytes": bytes.count, "utf8": String(data: bytes, encoding: .utf8) != nil,
    ]
  case .failed(let code):
    result = ["error": code]
  }
  lock.unlock()
  stopped.signal()
}
if arguments.count > 3 && arguments[3] == "cancel" {
  DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(40)) { receiver.cancel() }
}
// No JS loop services the deadline; the native timer/delegate alone must stop this request.
Thread.sleep(forTimeInterval: 0.3)
precondition(stopped.wait(timeout: .now() + .seconds(5)) == .success)
receiver.cancel()
let session = URLSession(configuration: .ephemeral)
receiver.urlSession(
  session, dataTask: session.dataTask(with: request), didReceive: Data(repeating: 1, count: 1024))
session.invalidateAndCancel()
lock.lock()
result["completions"] = completions
result["maximumRetained"] = receiver.maximumRetained
result["maximumDeliveredChunk"] = receiver.maximumDeliveredChunk
let serialized = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
lock.unlock()
print(String(data: serialized, encoding: .utf8)!)

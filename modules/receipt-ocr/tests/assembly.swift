import Foundation
import FoundationModels

@main struct AssemblyChecks {
  static func main() async throws {
    let b: [String: Any] = [
      "fields": [["f0"]], "evidence": [["e0"]], "observations": [["id": "o0"]],
      "idAllowlist": ["fields": ["f0"], "evidence": ["e0"], "observations": ["o0"]]
    ]
    let schema = try CaptureLocalExtractor.assemblySchema(["partB": b])
    let encoded = String(data: try JSONEncoder().encode(schema), encoding: .utf8)!
    assert(encoded.contains("f0") && encoded.contains("e0") && encoded.contains("o0"))
    assert(!encoded.contains("f999"))
    var invalid = b
    invalid["idAllowlist"] = ["fields": ["f999"], "evidence": ["e0"], "observations": ["o0"]]
    do { _ = try CaptureLocalExtractor.assemblySchema(["partB": invalid]); assertionFailure("ID scope drift accepted") } catch {}
    let deadline = Date().timeIntervalSince1970 * 1000 + 20000
    let task = Task {
      await CaptureAssemblyRuntime.shared.run(id: "old-input", deadline: deadline) {
        try? await Task.sleep(nanoseconds: 200_000_000)
        return #"{"json":"late-result"}"#
      }
    }
    try await Task.sleep(nanoseconds: 20_000_000)
    await CaptureLocalExtractor.cancelAssembly("other-input")
    let busy = await CaptureAssemblyRuntime.shared.run(id: "new-input", deadline: deadline) { "unexpected" }
    assert(busy.contains("LOCAL_MODEL_BUSY"))
    await CaptureLocalExtractor.cancelAssembly("old-input")
    let cancelled = await task.value
    assert(cancelled == #"{"error":"LOCAL_MODEL_CANCELLED"}"#)
    let fresh = await CaptureAssemblyRuntime.shared.run(id: "new-input", deadline: deadline) { #"{"json":"fresh"}"# }
    assert(fresh == #"{"json":"fresh"}"#)
    await CaptureLocalExtractor.cancelAssembly("cancel-before-begin", deadlineMs: deadline)
    let fenced = await CaptureAssemblyRuntime.shared.run(id: "cancel-before-begin", deadline: deadline) { assertionFailure("cancel-before-begin invoked model"); return "wrong" }
    assert(fenced.contains("LOCAL_MODEL_CANCELLED"))
    let expired = await CaptureAssemblyRuntime.shared.run(id: "expired-input", deadline: 0) { assertionFailure("expired request invoked model"); return "wrong" }
    assert(expired.contains("LOCAL_MODEL_APP_TIMEOUT"))
    let timed = await CaptureAssemblyRuntime.shared.run(id: "native-timeout", deadline: Date().timeIntervalSince1970 * 1000 + 20) {
      try? await Task.sleep(nanoseconds: 200_000_000)
      return "late-model-output"
    }
    assert(timed.contains("LOCAL_MODEL_APP_TIMEOUT"))
    print("PASS: exact dynamic ID schema, scope drift rejection, per-input cancellation, late-result fence and fresh-run isolation")
  }
}

import Foundation

// Thin single-command transport over the unchanged production Swift implementation.
@main struct ImportWorkbenchRunner {
  static func main() async {
    while let line = readLine() {
      guard line.utf8.count <= 15_000_000,
        let data = line.data(using: .utf8),
        let request = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
        let operation = request["operation"] as? String
      else { reply(["error": "DIAGNOSTIC_COMMAND_INVALID"]); continue }
      switch operation {
      case "capability": reply(CaptureLocalExtractor.modelCapability())
      case "extract":
        guard let encoded = request["bytes"] as? String,
          let bytes = Data(base64Encoded: encoded), bytes.count <= 10_485_760,
          let media = request["mediaType"] as? String
        else { reply(["error": "DIAGNOSTIC_INPUT_INVALID"]); continue }
        reply(CaptureLocalExtractor.extract(bytes, mediaType: media))
      case "assembly":
        guard let requestJSON = request["requestJSON"] as? String else {
          reply(["error": "LOCAL_MODEL_INPUT_LIMIT"]); continue
        }
        reply(await CaptureLocalExtractor.assemble(requestJSON, requestId: request["requestId"] as? String ?? UUID().uuidString, deadlineMs: request["deadlineMs"] as? Double))
      case "enrich":
        guard let text = request["text"] as? String else {
          reply(["error": "LOCAL_MODEL_INPUT_LIMIT"]); continue
        }
        reply(await CaptureLocalExtractor.enrich(text))
      default: reply(["error": "DIAGNOSTIC_COMMAND_INVALID"])
      }
    }
  }
  static func reply(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]),
      let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
  }
}

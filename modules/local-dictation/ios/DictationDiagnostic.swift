import Foundation

enum DictationDiagnosticPhase: String {
  case capability, speechPermission = "speech_permission", microphonePermission = "microphone_permission"
  case application, audioCategory = "audio_category", audioActivation = "audio_activation"
  case audioFormat = "audio_format", audioEngine = "audio_engine", recognition
  case transcriptLimit = "transcript_limit", lifecycle, deadline, finishDeadline = "finish_deadline"
}
struct DictationDiagnostic {
  let phase: DictationDiagnosticPhase
  let domain: String
  let code: Int?
  let sampleRateValid: Bool?
  let channelCountValid: Bool?
  init(_ phase: DictationDiagnosticPhase, error: Error? = nil,
       sampleRateValid: Bool? = nil, channelCountValid: Bool? = nil) {
    self.phase = phase
    let allowed = Set(["kAFAssistantErrorDomain", "kLSRErrorDomain", "SFSpeechErrorDomain",
      "AVFoundationErrorDomain", "AVAudioSessionErrorDomain", "NSOSStatusErrorDomain", "NSCocoaErrorDomain"])
    let value = error.map { $0 as NSError }
    domain = value.map { allowed.contains($0.domain) ? $0.domain : "OTHER" } ?? "NONE"
    code = value.flatMap { (-2147483648...2147483647).contains($0.code) ? $0.code : nil }
    #if DEBUG
    if let value {
      let underlying = value.userInfo[NSUnderlyingErrorKey] as? NSError
      let underlyingDomain = underlying.map { allowed.contains($0.domain) ? $0.domain : "OTHER" } ?? "NONE"
      NSLog("OTRDictation phase=%@ domain=%@ code=%ld underlyingDomain=%@ underlyingCode=%ld", phase.rawValue, domain, code ?? 0, underlyingDomain, underlying?.code ?? 0)
    }
    #endif
    self.sampleRateValid = sampleRateValid
    self.channelCountValid = channelCountValid
  }
  var body: [String: Any] {
    var value: [String: Any] = ["phase": phase.rawValue, "domain": domain]
    if let code { value["code"] = code }
    if let sampleRateValid { value["sampleRateValid"] = sampleRateValid }
    if let channelCountValid { value["channelCountValid"] = channelCountValid }
    return value
  }
}

import AVFoundation
import Foundation
import Speech
import UIKit

// AVAudioEngine delivers buffers off-main. Closing the gate precedes endAudio/cancel.
private final class DictationAudioInput {
  private let lock = NSLock()
  private var open = true
  private let request: SFSpeechAudioBufferRecognitionRequest
  init(_ request: SFSpeechAudioBufferRecognitionRequest) { self.request = request }
  func append(_ buffer: AVAudioPCMBuffer) {
    lock.lock(); defer { lock.unlock() }
    if open { request.append(buffer) }
  }
  func finish() {
    lock.lock(); defer { lock.unlock() }
    if open { open = false; request.endAudio() }
  }
}

@MainActor final class LocalDictationEngine {
  static let shared = LocalDictationEngine()
  typealias Emit = (String, [String: Any]) -> Void
  private enum Phase { case starting, listening, finishing }
  private final class Session {
    let lease: DictationLease
    let emit: Emit
    var phase = Phase.starting
    var diagnosticPhase = DictationDiagnosticPhase.capability
    var sampleRateValid: Bool?
    var channelCountValid: Bool?
    var engine: AVAudioEngine?
    var input: DictationAudioInput?
    var task: SFSpeechRecognitionTask?
    var recognizer: SFSpeechRecognizer?
    var tapped = false
    var audioActive = false
    var previousAudio: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?
    var deadline: Timer?
    var finishDeadline: Timer?
    init(_ lease: DictationLease, emit: @escaping Emit) { self.lease = lease; self.emit = emit }
  }
  private let fence = DictationSessionFence()
  private var active: Session?
  private var observers: [NSObjectProtocol] = []

  private init() {
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
      Task { @MainActor in
        // System permission dialogs may resign active before any audio resources exist.
        if let session = self?.active, session.phase != .starting {
          self?.finish(session.lease, error: .interrupted, diagnostic: DictationDiagnostic(.lifecycle))
        }
      }
    })
    observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
      Task { @MainActor in
        if let lease = self?.active?.lease { self?.finish(lease, error: .interrupted, diagnostic: DictationDiagnostic(.lifecycle)) }
      }
    })
    observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
      guard (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue else { return }
      Task { @MainActor in
        if let lease = self?.active?.lease { self?.finish(lease, error: .interrupted, diagnostic: DictationDiagnostic(.lifecycle)) }
      }
    })
    observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
      Task { @MainActor in
        if let lease = self?.active?.lease { self?.finish(lease, error: .interrupted, diagnostic: DictationDiagnostic(.lifecycle)) }
      }
    })
  }

  func start(owner: UUID, sessionId: String, locale: String, emit: @escaping Emit) async throws {
    let lease = try fence.begin(owner: owner, sessionId: sessionId)
    let session = Session(lease, emit: emit)
    active = session
    state(session, "starting")
    session.deadline = Timer(timeInterval: 60, repeats: false) { [weak self] _ in
      Task { @MainActor in self?.finish(lease, error: .timeout, diagnostic: DictationDiagnostic(.deadline)) }
    }
    if let deadline = session.deadline { RunLoop.main.add(deadline, forMode: .common) }
    do {
      guard locale.utf8.count <= 64, locale.range(of: "^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$", options: .regularExpression) != nil,
        let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)),
        recognizer.supportsOnDeviceRecognition, recognizer.isAvailable
      else { throw DictationFailure.unavailable }
      session.recognizer = recognizer
      guard Bundle.main.object(forInfoDictionaryKey: "NSSpeechRecognitionUsageDescription") is String,
        Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") is String
      else { throw DictationFailure.unavailable }
      // Authorization is requested only in response to this explicit start call.
      session.diagnosticPhase = .speechPermission
      let speech = await speechPermission()
      guard fence.current(lease) else { throw DictationFailure.interrupted }
      guard speech else { throw DictationFailure.permission }
      session.diagnosticPhase = .microphonePermission
      let microphone = await microphonePermission()
      guard fence.current(lease) else { throw DictationFailure.interrupted }
      guard microphone else { throw DictationFailure.permission }
      session.diagnosticPhase = .application
      guard UIApplication.shared.applicationState == .active else { throw DictationFailure.interrupted }
      session.diagnosticPhase = .capability
      guard recognizer.supportsOnDeviceRecognition, recognizer.isAvailable else { throw DictationFailure.unavailable }
      let request = SFSpeechAudioBufferRecognitionRequest()
      request.requiresOnDeviceRecognition = true
      request.shouldReportPartialResults = true
      request.taskHint = .dictation
      let audio = AVAudioSession.sharedInstance()
      session.previousAudio = (audio.category, audio.mode, audio.categoryOptions)
      session.diagnosticPhase = .audioCategory
      try audio.setCategory(.record, mode: .measurement)
      session.diagnosticPhase = .audioActivation
      try audio.setActive(true)
      session.audioActive = true
      let engine = AVAudioEngine()
      session.engine = engine
      session.diagnosticPhase = .audioFormat
      let format = engine.inputNode.outputFormat(forBus: 0)
      session.sampleRateValid = format.sampleRate.isFinite && format.sampleRate > 0
      session.channelCountValid = format.channelCount > 0
      guard session.sampleRateValid == true, session.channelCountValid == true else { throw DictationFailure.unavailable }
      let input = DictationAudioInput(request)
      session.input = input
      engine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in input.append(buffer) }
      session.tapped = true
      session.task = recognizer.recognitionTask(with: request) { [weak self] result, error in
        Task { @MainActor in
          guard let self, self.fence.current(lease), let current = self.active else { return }
          if let result {
            guard let text = try? checkedDictationTranscript(result.bestTranscription.formattedString)
            else { self.finish(lease, error: .failed, diagnostic: DictationDiagnostic(.transcriptLimit)); return }
            current.emit("transcript", ["sessionId": lease.sessionId,
              "text": text, "isFinal": result.isFinal])
            if result.isFinal { self.finish(lease); return }
          }
          if let error { self.finish(lease, error: .failed, diagnostic: DictationDiagnostic(.recognition, error: error, sampleRateValid: current.sampleRateValid, channelCountValid: current.channelCountValid)) }
        }
      }
      session.diagnosticPhase = .audioEngine
      engine.prepare()
      try engine.start()
      session.phase = .listening
      state(session, "listening")
    } catch {
      let failure = error as? DictationFailure ?? .failed
      finish(lease, error: failure, diagnostic: DictationDiagnostic(session.diagnosticPhase, error: error is DictationFailure ? nil : error, sampleRateValid: session.sampleRateValid, channelCountValid: session.channelCountValid))
      throw failure
    }
  }

  func stop(owner: UUID, sessionId: String) {
    guard let lease = fence.matching(owner: owner, sessionId: sessionId), let session = active else {
      _ = fence.requestCancel(owner: owner, sessionId: sessionId)
      return
    }
    if session.phase == .starting { finish(lease); return }
    guard session.phase == .listening else { return }
    session.phase = .finishing
    state(session, "finishing")
    stopAudio(session)
    session.task?.finish()
    session.finishDeadline = Timer(timeInterval: 3, repeats: false) { [weak self] _ in
      Task { @MainActor in self?.finish(lease, error: .timeout, diagnostic: DictationDiagnostic(.finishDeadline)) }
    }
    if let deadline = session.finishDeadline { RunLoop.main.add(deadline, forMode: .common) }
  }
  func cancel(owner: UUID, sessionId: String) {
    guard let lease = fence.requestCancel(owner: owner, sessionId: sessionId) else { return }
    finish(lease)
  }
  func destroy(owner: UUID) {
    if let lease = active?.lease, lease.owner == owner { finish(lease) }
    fence.retire(owner: owner)
  }
  private func state(_ session: Session, _ status: String, error: DictationFailure? = nil, diagnostic: DictationDiagnostic? = nil) {
    var body: [String: Any] = ["sessionId": session.lease.sessionId, "status": status]
    if let error { body["error"] = error.rawValue; if let diagnostic { body["diagnostic"] = diagnostic.body } }
    session.emit("state", body)
  }
  private func stopAudio(_ session: Session) {
    session.input?.finish()
    session.engine?.stop()
    if session.tapped { session.engine?.inputNode.removeTap(onBus: 0); session.tapped = false }
    let audio = AVAudioSession.sharedInstance()
    if session.audioActive {
      try? audio.setActive(false, options: .notifyOthersOnDeactivation)
      session.audioActive = false
    }
    if let previous = session.previousAudio {
      try? audio.setCategory(previous.0, mode: previous.1, options: previous.2)
      session.previousAudio = nil
    }
  }
  private func finish(_ lease: DictationLease, error: DictationFailure? = nil, diagnostic: DictationDiagnostic? = nil) {
    guard fence.release(lease), let session = active else { return }
    active = nil // Fence callbacks before cancelling tasks or releasing audio resources.
    session.deadline?.invalidate(); session.finishDeadline?.invalidate()
    stopAudio(session)
    session.task?.cancel(); session.task = nil
    state(session, error == nil ? "stopped" : "error", error: error, diagnostic: diagnostic)
  }
  private func speechPermission() async -> Bool {
    switch SFSpeechRecognizer.authorizationStatus() {
    case .authorized: return true
    case .notDetermined:
      return await withCheckedContinuation { continuation in
        SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
      }
    default: return false
    }
  }
  private func microphonePermission() async -> Bool {
    let audio = AVAudioSession.sharedInstance()
    switch audio.recordPermission {
    case .granted: return true
    case .undetermined:
      return await withCheckedContinuation { continuation in
        audio.requestRecordPermission { continuation.resume(returning: $0) }
      }
    default: return false
    }
  }
}

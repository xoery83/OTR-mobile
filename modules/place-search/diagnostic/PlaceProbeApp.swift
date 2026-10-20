import UIKit

@main final class PlaceProbeApp: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    let window = UIWindow(frame: UIScreen.main.bounds)
    window.rootViewController = UINavigationController(rootViewController: ProbeViewController())
    window.makeKeyAndVisible()
    self.window = window
    return true
  }
}

private final class ProbeViewController: UIViewController {
  private let engine = ApplePlaceSearchEngine()
  private let session = UUID().uuidString.lowercased()
  private var generation = 0
  private var operations = 0
  private var records: [[String: Any]] = []
  private var selected: [String: Any]?
  private let query = UITextField()
  private let output = UITextView()
  private let state = UILabel()
  private var running = false
  private var execution = 0
  private let maximumOperations = 30

  override func viewDidLoad() {
    super.viewDidLoad()
    title = "Apple Place Search Probe"
    view.backgroundColor = .systemBackground
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 10
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
      stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
      stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
      stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12)
    ])
    let note = UILabel()
    note.text = "Technical iOS MapKit • no Trip/data writes • max30 operations"
    note.numberOfLines = 0
    note.font = .preferredFont(forTextStyle: .footnote)
    note.adjustsFontForContentSizeCategory = true
    stack.addArrangedSubview(note)
    query.text = "Sky Tower"
    query.borderStyle = .roundedRect
    query.clearButtonMode = .whileEditing
    query.autocorrectionType = .no
    query.accessibilityIdentifier = "place-probe-query"
    stack.addArrangedSubview(query)
    let actions = UIStackView()
    actions.distribution = .fillEqually
    actions.spacing = 8
    for (label, selector) in [("Complete", #selector(complete)), ("Search", #selector(search)), ("Resolve First", #selector(resolve)), ("Cancel", #selector(cancel))] {
      let button = UIButton(type: .system)
      button.setTitle(label, for: .normal)
      button.addTarget(self, action: selector, for: .touchUpInside)
      actions.addArrangedSubview(button)
    }
    stack.addArrangedSubview(actions)
    let samples = UIButton(type: .system)
    samples.setTitle("Run Fixed Samples (max8 operations)", for: .normal)
    samples.addTarget(self, action: #selector(runSamples), for: .touchUpInside)
    stack.addArrangedSubview(samples)
    state.text = "Ready • Apple provider only • no GPS or credentials"
    state.numberOfLines = 0
    state.font = .preferredFont(forTextStyle: .subheadline)
    stack.addArrangedSubview(state)
    output.isEditable = false
    output.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
    output.adjustsFontForContentSizeCategory = true
    output.accessibilityIdentifier = "place-probe-results"
    stack.addArrangedSubview(output)
  }

  @objc private func complete() { launch("complete") }
  @objc private func search() { launch("search") }
  @objc private func resolve() { launch("resolve") }
  @objc private func cancel() {
    execution += 1
    running = false
    engine.cancel(session, generation)
    generation += 1
    selected = nil
    state.text = "Cancelled • late results cannot update selection"
  }
  private func launch(_ kind: String) {
    guard !running else { return }
    running = true
    execution += 1
    let ticket = execution
    view.endEditing(true)
    Task { @MainActor in
      _ = await perform(kind, query.text ?? "")
      if ticket == execution { running = false }
    }
  }
  private func perform(_ kind: String, _ text: String, _ region: [String: Double]? = nil) async -> [String: Any]? {
    guard operations < maximumOperations else { state.text = "Operation limit reached"; return nil }
    if kind == "resolve" && selected == nil { state.text = "Search first; no retained selection"; return nil }
    if kind != "resolve" { generation += 1; selected = nil }
    let currentGeneration = generation
    operations += 1
    state.text = "\(kind): \(text) • \(operations)/\(maximumOperations)"
    var input: [String: Any] = ["sessionId": session, "requestId": UUID().uuidString.lowercased(),
      "generation": currentGeneration, "text": text]
    if let region { input["region"] = region }
    if kind == "resolve" { input["handle"] = selected?["handle"] }
    let result = await engine.perform(kind, input)
    let rows = result["candidates"] as? [[String: Any]] ?? []
    let record: [String: Any] = ["operation": kind, "query": text,
      "explicitRegion": region as Any? ?? NSNull(), "result": result]
    records.append(record)
    if currentGeneration == generation {
      selected = rows.first
      state.text = "\(kind) • \(result["status"] ?? "ERROR") • \(rows.count) returned • \(operations)/30"
    }
    render()
    return result
  }
  private func render() {
    output.text = records.enumerated().map { index, record in
      let result = record["result"] as? [String: Any] ?? [:]
      let rows = result["candidates"] as? [[String: Any]] ?? []
      let details = rows.prefix(5).map { row -> String in
        let point = row["point"] as? [String: Double]
        return "• \(row["title"] ?? "")\n  \(row["address"] ?? row["secondary"] ?? "")\n  \(point.map { "\($0["latitude"] ?? 0), \($0["longitude"] ?? 0)" } ?? "unresolved completion")"
      }.joined(separator: "\n")
      return "\(index + 1). \(record["operation"] ?? "") | \(record["query"] ?? "")\n\(result["status"] ?? "ERROR"): \(rows.count) returned\n\(details)\n\(result["nativeError"].map { "Native error: \($0)" } ?? "")"
    }.joined(separator: "\n\n")
    if let data = try? JSONSerialization.data(withJSONObject: ["runtime":"iOS native diagnostic ONLY; not Form Save/VQA", "operationLimit": maximumOperations, "operations":operations, "records":records], options: [.prettyPrinted, .sortedKeys]),
      let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
      try? data.write(to: root.appendingPathComponent("AppleMapKitProbe.json"), options: .atomic)
    }
  }
  @objc private func runSamples() {
    guard !running, operations <= maximumOperations - 8 else { return }
    running = true
    execution += 1
    let ticket = execution
    view.endEditing(true)
    Task { @MainActor in
      for sample in ["SkyCity Auckland", "Sky Tower", "Abel Tasman Lodge", "295 Sandy Bay–Marahau Road", "Nelson"] {
        guard ticket == execution else { return }
        _ = await perform("search", sample)
      }
      guard ticket == execution else { return }
      _ = await perform("search", "Sydney Opera House", ["latitude":-36.8485,"longitude":174.7633])
      guard ticket == execution else { return }
      let completion = await perform("complete", "Sky Tower")
      guard ticket == execution else { return }
      if !(completion?["candidates"] as? [[String: Any]] ?? []).isEmpty {
        _ = await perform("resolve", "Sky Tower")
      }
      if ticket == execution { running = false }
    }
  }
}

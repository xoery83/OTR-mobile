import Foundation
import MapKit

// All MapKit objects and retained provider handles are owned by the main queue.
final class ApplePlaceSearchEngine: @unchecked Sendable {
  private struct Handle {
    let session: String
    let generation: Int
    let completion: MKLocalSearchCompletion?
    let item: MKMapItem?
  }
  private var handles: [String: Handle] = [:]
  private var requests: [String: Request] = [:]
  private var generations: [String: Int] = [:]
  private var cancelledThrough: [String: Int] = [:]
  private var sessions: [String] = []

  func perform(_ kind: String, _ input: [String: Any]) async -> [String: Any] {
    await withCheckedContinuation { continuation in
      DispatchQueue.main.async { self.begin(kind, input) { continuation.resume(returning: $0) } }
    }
  }

  func cancel(_ session: String, _ generation: Int) {
    DispatchQueue.main.async {
      self.track(session)
      self.cancelOnMain(session, generation)
    }
  }

  func cancelAll() {
    DispatchQueue.main.async {
      for session in self.sessions { self.cancelOnMain(session, Int.max) }
      self.handles.removeAll()
      self.generations.removeAll()
      self.cancelledThrough.removeAll()
      self.sessions.removeAll()
    }
  }

  private func track(_ session: String) {
    if sessions.contains(session) { return }
    if sessions.count >= 16 {
      let oldest = sessions.removeFirst()
      cancelOnMain(oldest, Int.max)
      generations.removeValue(forKey: oldest)
      cancelledThrough.removeValue(forKey: oldest)
    }
    sessions.append(session)
  }

  private func cancelOnMain(_ session: String, _ generation: Int) {
    cancelledThrough[session] = max(cancelledThrough[session] ?? 0, generation)
    let pending = requests.values.filter { $0.session == session && $0.generation <= generation }
    for request in pending { request.finish("CANCELLED", []) }
    handles = handles.filter { $0.value.session != session || $0.value.generation > generation }
  }

  private func begin(_ kind: String, _ input: [String: Any], _ finish: @escaping ([String: Any]) -> Void) {
    guard let session = input["sessionId"] as? String, UUID(uuidString: session) != nil,
      let requestId = input["requestId"] as? String, UUID(uuidString: requestId) != nil,
      let generationNumber = input["generation"] as? NSNumber,
      CFGetTypeID(generationNumber) != CFBooleanGetTypeID(),
      generationNumber.doubleValue.isFinite,
      generationNumber.doubleValue >= 1, generationNumber.doubleValue <= 9007199254740991,
      generationNumber.doubleValue.rounded() == generationNumber.doubleValue
    else { finish(["status": "INVALID_REQUEST", "candidates": []]); return }
    let generation = generationNumber.intValue
    let identity: [String: Any] = ["requestId": requestId, "sessionId": session,
      "generation": generation, "provider": "apple"]
    func early(_ status: String) {
      var response = identity; response["status"] = status; response["candidates"] = []
      finish(response)
    }
    track(session)
    guard generation >= (generations[session] ?? 0),
      generation > (cancelledThrough[session] ?? 0), requests[requestId] == nil,
      !requests.values.contains(where: { $0.session == session && $0.generation == generation }) else {
      early("CANCELLED"); return
    }
    if generation > (generations[session] ?? 0) {
      cancelOnMain(session, generation - 1)
      generations[session] = generation
    }
    let query = (input["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if kind != "resolve" && (query.isEmpty || query.utf8.count > 2048) {
      early(query.isEmpty ? "NO_RESULTS" : "INVALID_REQUEST"); return
    }
    let request = Request(session, generation, requestId) { [weak self] status, candidates, error in
      self?.requests.removeValue(forKey: requestId)
      var response: [String: Any] = ["status": status, "candidates": candidates, "requestId": requestId,
        "sessionId": session, "generation": generation, "provider": "apple"]
      if let error { response["nativeError"] = ["domain": error.domain, "code": error.code] }
      finish(response)
    }
    requests[requestId] = request
    request.timeout = DispatchWorkItem { [weak request] in request?.finish("TIMED_OUT", []) }
    DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: request.timeout!)
    let region = qualifiedRegion(input["region"])
    if kind == "complete" {
      let completer = MKLocalSearchCompleter()
      request.completer = completer
      completer.delegate = request
      completer.resultTypes = [.address, .pointOfInterest]
      if let region { completer.region = region }
      if #available(iOS 18.0, macOS 15.0, *) { completer.regionPriority = .default }
      request.completions = { [weak self, weak request] values in
        guard let self, let request, self.requests[request.id] === request,
          self.generations[session] == generation else { return }
        let rows = values.prefix(5).map { completion -> [String: Any] in
          let id = self.retain(Handle(session: session, generation: generation, completion: completion, item: nil))
          return ["handle": id, "title": completion.title, "secondary": completion.subtitle,
            "kind": "completion", "provider": "apple"]
        }
        request.finish(rows.isEmpty ? "NO_RESULTS" : "READY", rows)
      }
      completer.queryFragment = query
      return
    }
    let searchRequest: MKLocalSearch.Request
    if kind == "resolve" {
      guard let id = input["handle"] as? String, let retained = handles[id],
        retained.session == session, retained.generation == generation else {
        request.finish("STALE_HANDLE", []); return
      }
      if let item = retained.item {
        request.finish("READY", [candidate(item, id)]); return
      }
      guard let completion = retained.completion else { request.finish("STALE_HANDLE", []); return }
      searchRequest = MKLocalSearch.Request(completion: completion)
    } else {
      searchRequest = MKLocalSearch.Request()
      searchRequest.naturalLanguageQuery = query
      searchRequest.resultTypes = [.address, .pointOfInterest]
    }
    if let region { searchRequest.region = region }
    if #available(iOS 18.0, macOS 15.0, *) { searchRequest.regionPriority = .default }
    let search = MKLocalSearch(request: searchRequest)
    request.search = search
    search.start { [weak self, weak request] response, error in
      DispatchQueue.main.async {
        guard let self, let request, self.requests[request.id] === request,
          self.generations[session] == generation else { return }
        if let error { request.finish(Request.errorStatus(error), [], error as NSError); return }
        let rows = (response?.mapItems ?? []).prefix(kind == "resolve" ? 1 : 20).map { item -> [String: Any] in
          let id = self.retain(Handle(session: session, generation: generation, completion: nil, item: item))
          return self.candidate(item, id)
        }
        request.finish(rows.isEmpty ? "NO_RESULTS" : "READY", rows)
      }
    }
  }

  private func retain(_ value: Handle) -> String {
    // At most five completions/twenty search rows per generation; bound old sessions too.
    if handles.count >= 128, let key = handles.keys.first { handles.removeValue(forKey: key) }
    let id = UUID().uuidString.lowercased()
    handles[id] = value
    return id
  }

  private func qualifiedRegion(_ input: Any?) -> MKCoordinateRegion? {
    guard let value = input as? [String: Any], let lat = value["latitude"] as? Double,
      let lon = value["longitude"] as? Double, lat.isFinite, lon.isFinite,
      (-90...90).contains(lat), (-180...180).contains(lon), lat != 0 || lon != 0 else { return nil }
    return MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lon),
      span: MKCoordinateSpan(latitudeDelta: 0.8, longitudeDelta: 0.8))
  }

  private func candidate(_ item: MKMapItem, _ id: String) -> [String: Any] {
    let point: CLLocationCoordinate2D
    let address: String
    if #available(iOS 26.0, macOS 26.0, *) {
      point = item.location.coordinate
      address = item.addressRepresentations?.fullAddress(includingRegion: true, singleLine: true)
        ?? item.address?.fullAddress ?? ""
    } else {
      let placemark = item.placemark
      point = placemark.coordinate
      address = [placemark.subThoroughfare, placemark.thoroughfare, placemark.locality,
        placemark.administrativeArea, placemark.postalCode, placemark.country]
        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    }
    var result: [String: Any] = ["handle": id, "title": item.name ?? "", "secondary": address,
      "address": address, "kind": "mapItem", "provider": "apple"]
    if CLLocationCoordinate2DIsValid(point), point.latitude.isFinite, point.longitude.isFinite {
      result["point"] = ["latitude": point.latitude, "longitude": point.longitude]
    }
    if #available(iOS 18.0, macOS 15.0, *), let identifier = item.identifier {
      result["providerPlaceId"] = identifier.rawValue
    }
    if let category = item.pointOfInterestCategory { result["category"] = category.rawValue }
    return result
  }

  private final class Request: NSObject, MKLocalSearchCompleterDelegate {
    let session: String
    let generation: Int
    let id: String
    var completer: MKLocalSearchCompleter?
    var search: MKLocalSearch?
    var timeout: DispatchWorkItem?
    var completions: (([MKLocalSearchCompletion]) -> Void)?
    private var callback: ((String, [[String: Any]], NSError?) -> Void)?
    init(_ session: String, _ generation: Int, _ id: String, _ callback: @escaping (String, [[String: Any]], NSError?) -> Void) {
      self.session = session; self.generation = generation; self.id = id; self.callback = callback
    }
    func finish(_ status: String, _ rows: [[String: Any]], _ error: NSError? = nil) {
      guard let callback else { return }
      self.callback = nil
      timeout?.cancel(); timeout = nil
      completer?.delegate = nil; completer?.cancel(); search?.cancel()
      completions = nil
      callback(status, rows, error)
    }
    func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) { completions?(completer.results) }
    func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) { finish(Self.errorStatus(error), [], error as NSError) }
    static func errorStatus(_ error: Error) -> String {
      let value = error as NSError
      if value.domain == NSURLErrorDomain { return "NETWORK_ERROR" }
      if value.domain == MKErrorDomain && value.code == MKError.Code.placemarkNotFound.rawValue { return "NO_RESULTS" }
      if value.domain == MKErrorDomain && value.code == MKError.Code.loadingThrottled.rawValue { return "THROTTLED" }
      return "ERROR"
    }
  }
}

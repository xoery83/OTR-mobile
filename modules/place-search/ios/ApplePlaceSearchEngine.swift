import Foundation
import MapKit

// All MapKit objects and retained provider handles are owned by the main queue.
final class ApplePlaceSearchEngine: @unchecked Sendable {
  private struct Handle {
    let session: String
    let generation: Int
    let destinationArea: Bool
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
    guard input["intent"] == nil || input["intent"] as? String == "destinationArea" else {
      early("INVALID_REQUEST"); return
    }
    let destinationArea = input["intent"] as? String == "destinationArea"
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
      completer.resultTypes = destinationArea ? [.address] : [.address, .pointOfInterest]
      if destinationArea, #available(iOS 18.0, macOS 15.0, *) {
        completer.addressFilter = MKAddressFilter(including: [.locality, .subLocality, .administrativeArea, .subAdministrativeArea, .country])
      }
      if let region { completer.region = region }
      if #available(iOS 18.0, macOS 15.0, *) { completer.regionPriority = .default }
      request.completions = { [weak self, weak request] values in
        guard let self, let request, self.requests[request.id] === request,
          self.generations[session] == generation else { return }
        let rows = values.prefix(5).map { completion -> [String: Any] in
          let id = self.retain(Handle(session: session, generation: generation, destinationArea: destinationArea, completion: completion, item: nil))
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
        retained.session == session, retained.generation == generation,
        retained.destinationArea == destinationArea else {
        request.finish("STALE_HANDLE", []); return
      }
      if let item = retained.item {
        guard let row = candidate(item, id, destinationArea: destinationArea) else {
          request.finish("NO_RESULTS", []); return
        }
        request.finish("READY", [row]); return
      }
      guard let completion = retained.completion else { request.finish("STALE_HANDLE", []); return }
      searchRequest = MKLocalSearch.Request(completion: completion)
    } else {
      searchRequest = MKLocalSearch.Request()
      searchRequest.naturalLanguageQuery = query
      searchRequest.resultTypes = [.address, .pointOfInterest]
    }
    if destinationArea {
      searchRequest.resultTypes = [.address]
      if #available(iOS 18.0, macOS 15.0, *) {
        searchRequest.addressFilter = MKAddressFilter(including: [.locality, .subLocality, .administrativeArea, .subAdministrativeArea, .country])
      }
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
        let limit = kind == "resolve" ? 1 : kind == "complete" ? 5 : 20
        // Filter before limiting: a POI ranked first must not hide a qualified city further down.
        let items = (response?.mapItems ?? []).filter { !destinationArea || self.areaFacts($0) != nil }
        let rows = items.prefix(limit).compactMap { item -> [String: Any]? in
          let id = self.retain(Handle(session: session, generation: generation, destinationArea: destinationArea, completion: nil, item: item))
          return self.candidate(item, id, destinationArea: destinationArea)
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

  private func areaFacts(_ item: MKMapItem) -> AppleDestinationArea? {
    guard !item.isCurrentLocation else { return nil }
    // MKMapItem has no public result-type discriminator. Explicit placemark components
    // qualify an area; a missing POI category or an identifier alone never does.
    let placemark = item.placemark
    var facts = AppleDestinationAreaFacts()
    facts.name = item.name ?? ""
    facts.locality = placemark.locality ?? ""
    facts.subLocality = placemark.subLocality ?? ""
    facts.administrativeArea = placemark.administrativeArea ?? ""
    facts.subAdministrativeArea = placemark.subAdministrativeArea ?? ""
    facts.country = placemark.country ?? ""
    facts.countryCode = placemark.isoCountryCode ?? ""
    facts.inlandWater = placemark.inlandWater ?? ""
    facts.ocean = placemark.ocean ?? ""
    facts.isNationalPark = item.pointOfInterestCategory == .nationalPark
    facts.hasStreet = !(placemark.thoroughfare ?? "").isEmpty || !(placemark.subThoroughfare ?? "").isEmpty
    facts.hasBusiness = item.pointOfInterestCategory != nil || item.phoneNumber != nil || item.url != nil
    return qualifyAppleDestinationArea(facts)
  }

  private func candidate(_ item: MKMapItem, _ id: String, destinationArea: Bool) -> [String: Any]? {
    let area = destinationArea ? areaFacts(item) : nil
    if destinationArea && area == nil { return nil }
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
    let placemark = item.placemark
    let components = applePlaceAddressComponents(locality: placemark.locality,
      administrativeArea: placemark.administrativeArea, country: placemark.country,
      countryCode: placemark.isoCountryCode)
    if !components.isEmpty { result["addressComponents"] = components }
    if let area {
      result["area"] = area.payload
      result["title"] = area.label
      result["secondary"] = area.qualifier
    }
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

// Provider facts only: do not parse the formatted address or claim Canonical acceptance.
func applePlaceAddressComponents(locality: String?, administrativeArea: String?, country: String?, countryCode: String?) -> [String: String] {
  var result: [String: String] = [:]
  for (key, raw) in [("locality", locality), ("administrativeArea", administrativeArea), ("country", country), ("countryCode", countryCode)] {
    guard let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty, value.count <= 256 else { continue }
    result[key] = value
  }
  return result
}


// Raw MapKit facts only. This is conservative display qualification, never Canonical place proof.
struct AppleDestinationAreaFacts {
  var name = ""
  var locality = ""
  var subLocality = ""
  var administrativeArea = ""
  var subAdministrativeArea = ""
  var country = ""
  var countryCode = ""
  var inlandWater = ""
  var ocean = ""
  var isNationalPark = false
  var hasStreet = false
  var hasBusiness = false
}
struct AppleDestinationArea {
  let kind: String
  let label: String
  let qualifier: String
  var payload: [String: String] { ["kind": kind, "label": label, "qualifier": qualifier] }
}
func qualifyAppleDestinationArea(_ facts: AppleDestinationAreaFacts) -> AppleDestinationArea? {
  func clean(_ value: String) -> String {
    value.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
  }
  func key(_ value: String) -> String {
    clean(value).folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: Locale(identifier: "en_US_POSIX"))
  }
  let name = clean(facts.name)
  guard !name.isEmpty, name.count <= 256 else { return nil }
  if facts.isNationalPark {
    var seen = Set([key(name)])
    let qualifier = [facts.administrativeArea, facts.country].map(clean).filter { !$0.isEmpty && seen.insert(key($0)).inserted }.joined(separator: ", ")
    guard !qualifier.isEmpty, qualifier.count <= 256 else { return nil }
    return AppleDestinationArea(kind: "physicalFeature", label: name, qualifier: qualifier)
  }
  guard !facts.hasStreet, !facts.hasBusiness else { return nil }
  let levels: [(String, String, [String])] = [
    ("locality", facts.subLocality, [facts.locality, facts.administrativeArea, facts.country]),
    ("locality", facts.locality, [facts.administrativeArea, facts.country]),
    ("administrativeArea", facts.subAdministrativeArea, [facts.administrativeArea, facts.country]),
    ("administrativeArea", facts.administrativeArea, [facts.country]),
    ("country", facts.country, [facts.countryCode]),
    ("physicalFeature", facts.inlandWater, [facts.locality, facts.administrativeArea, facts.country]),
    ("physicalFeature", facts.ocean, [facts.locality, facts.administrativeArea, facts.country]),
  ]
  guard let matched = levels.first(where: { !clean($0.1).isEmpty && key(name) == key($0.1) }) else { return nil }
  var seen = Set([key(name)])
  var qualifier = matched.2.map(clean).filter { !$0.isEmpty && seen.insert(key($0)).inserted }.joined(separator: ", ")
  if qualifier.isEmpty, !clean(facts.countryCode).isEmpty, key(facts.countryCode) != key(name) {
    qualifier = clean(facts.countryCode)
  }
  guard !qualifier.isEmpty, qualifier.count <= 256 else { return nil }
  return AppleDestinationArea(kind: matched.0, label: name, qualifier: qualifier)
}

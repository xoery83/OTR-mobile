import Foundation

@main struct AreaChecks {
  static func main() {
    func area(_ facts: AppleDestinationAreaFacts, _ kind: String, _ qualifier: String) {
      let result = qualifyAppleDestinationArea(facts)
      precondition(result?.kind == kind)
      precondition(result?.label == facts.name)
      precondition(result?.qualifier == qualifier)
    }
    area(.init(name: "Nelson", locality: "Nelson", administrativeArea: "Nelson", country: "New Zealand"), "locality", "New Zealand")
    area(.init(name: "New Zealand", country: "New Zealand", countryCode: "NZ"), "country", "NZ")
    area(.init(name: "Singapore", locality: "Singapore", country: "Singapore", countryCode: "SG"), "locality", "SG")
    area(.init(name: "Illinois", administrativeArea: "Illinois", country: "United States"), "administrativeArea", "United States")
    area(.init(name: "Tokyo", locality: "Shinjuku", administrativeArea: "Tokyo", country: "Japan"), "administrativeArea", "Japan")
    area(.init(name: "Waiheke Island", administrativeArea: "Auckland", subAdministrativeArea: "Waiheke Island", country: "New Zealand"), "administrativeArea", "Auckland, New Zealand")
    area(.init(name: "Lake Tekapo", country: "New Zealand", inlandWater: "Lake Tekapo"), "physicalFeature", "New Zealand")
    area(.init(name: "Abel Tasman National Park", administrativeArea: "Tasman", country: "New Zealand", isNationalPark: true, hasStreet: true, hasBusiness: true), "physicalFeature", "Tasman, New Zealand")
    precondition(qualifyAppleDestinationArea(.init(name: "Auckland", locality: "Auckland", country: "New Zealand", hasBusiness: true)) == nil)
    precondition(qualifyAppleDestinationArea(.init(name: "Nelson Hospital", locality: "Nelson", country: "New Zealand")) == nil)
    precondition(qualifyAppleDestinationArea(.init(name: "Nelson", locality: "Nelson", country: "New Zealand", hasStreet: true)) == nil)
    precondition(qualifyAppleDestinationArea(.init(name: "Albert Park", locality: "Auckland", country: "New Zealand", hasBusiness: true)) == nil)
    precondition(qualifyAppleDestinationArea(.init(name: "Mystery Island", country: "New Zealand")) == nil)
    precondition(qualifyAppleDestinationArea(.init(name: "Springfield", locality: "Springfield")) == nil)
    let illinois = qualifyAppleDestinationArea(.init(name: "Springfield", locality: "Springfield", administrativeArea: "IL", country: "United States"))!
    let massachusetts = qualifyAppleDestinationArea(.init(name: "Springfield", locality: "Springfield", administrativeArea: "MA", country: "United States"))!
    precondition(illinois.qualifier != massachusetts.qualifier)
    print("Area raw-fact qualification checks PASS; no MapKit/provider requests invoked")
  }
}

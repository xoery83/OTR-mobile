import Foundation

@main struct AddressComponentsChecks {
  static func main() {
    let raw = applePlaceAddressComponents(locality: " Nelson ", administrativeArea: "Nelson", country: "New Zealand", countryCode: "NZ")
    precondition(raw == ["locality": "Nelson", "administrativeArea": "Nelson", "country": "New Zealand", "countryCode": "NZ"])
    precondition(applePlaceAddressComponents(locality: nil, administrativeArea: "", country: " \n", countryCode: nil).isEmpty)
    precondition(applePlaceAddressComponents(locality: String(repeating: "x", count: 257), administrativeArea: nil, country: "United States", countryCode: "US")["locality"] == nil)
    let first = applePlaceAddressComponents(locality: "Springfield", administrativeArea: "Illinois", country: "United States", countryCode: "US")
    let second = applePlaceAddressComponents(locality: "Springfield", administrativeArea: "Massachusetts", country: "United States", countryCode: "US")
    precondition(first != second)
    print("Native raw address component preservation: 4 PASS; zero provider searches")
  }
}

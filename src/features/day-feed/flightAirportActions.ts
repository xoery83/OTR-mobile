import { Alert, Linking } from "react-native";
import { localCalendarDate } from "@/domain/trip/dayReadModel";
import { t } from "@/ui/locale";
import { endpoint, type FlightPresentation } from "./presentation";
import type { FlightSegmentDraft } from "./manualFlightFormFields";
import type { BookingContext } from "./bookingReadPresentation";

type Flight = FlightPresentation | { authored: FlightSegmentDraft };
export function flightAirportContext(flight: Flight, instant: string): BookingContext {
  const departure =
    "authored" in flight
      ? {
          local_date: flight.authored.departureDate,
          zone_id: flight.authored.departureZone,
        }
      : endpoint(flight, "ORIGIN");
  if (!departure?.local_date) return "UNKNOWN";
  let today: string;
  try {
    today = localCalendarDate(
      instant,
      departure.zone_id || Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  } catch {
    return "UNKNOWN";
  }
  return departure.local_date === today
    ? "TODAY"
    : departure.local_date > today
      ? "FUTURE"
      : "PAST";
}
export function flightAirportTargets(flight: Flight) {
  const airport =
    "authored" in flight
      ? { name: flight.authored.originName, code: flight.authored.originCode }
      : flight.supplemental.endpoints.ORIGIN;
  // Search the actual departure airport; never synthesize coordinates or navigation identity.
  if (!airport.name?.trim()) return null;
  const query = encodeURIComponent(
    [airport.name.trim(), airport.code].filter(Boolean).join(" "),
  );
  return {
    map: `https://maps.apple.com/?q=${query}`,
    navigate: `https://maps.apple.com/?daddr=${query}`,
  };
}
export function openFlightAirport(url: string) {
  void Linking.openURL(url).catch(() => Alert.alert(t("bookingRead.mapUnavailable")));
}

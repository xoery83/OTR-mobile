import airports from "./data/airports.json";
export type AirportSuggestion = {
  iata: string | null;
  icao: string | null;
  name: string;
  country: string;
  zone: string | null;
};
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .trim();
const index = airports.map((airport) => ({ airport, name: normalize(airport.name) }));
export function airportSuggestions(query: string): readonly AirportSuggestion[] {
  const key = normalize(query);
  if (key.length < 2) return [];
  const words = key.split(/\s+/);
  return index
    .flatMap(({ airport, name }, order) => {
      const iata = airport.iata?.toLowerCase(),
        icao = airport.icao?.toLowerCase();
      const rank =
        iata === key
          ? 0
          : icao === key
            ? 1
            : name === key
              ? 2
              : iata?.startsWith(key) || icao?.startsWith(key)
                ? 3
                : name.startsWith(key)
                  ? 4
                  : words.every((word) => name.includes(word))
                    ? 5
                    : -1;
      return rank < 0 ? [] : [{ airport, rank, order }];
    })
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, 6)
    .map(({ airport }) => airport);
}
export function manualAirport(text: string) {
  const value = text.trim();
  return /^[a-z]{3,4}$/i.test(value)
    ? { code: value.toUpperCase(), name: "" }
    : { code: "", name: value };
}
export function airportLabel(code: string, name: string) {
  return [code, name].filter(Boolean).join(" · ");
}

export function airportTimeZone(airport: AirportSuggestion): string | null {
  if (!airport.zone) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: airport.zone });
    return airport.zone;
  } catch {
    return null;
  }
}
export function selectedAirportZone(code: string, name: string): string | null {
  if (!code || !name) return null;
  const matches = airports.filter(
    (airport) =>
      (airport.iata === code || airport.icao === code) && airport.name === name,
  );
  return matches.length === 1 ? airportTimeZone(matches[0]) : null;
}

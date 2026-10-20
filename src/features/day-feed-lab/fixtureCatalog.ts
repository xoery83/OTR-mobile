import { t } from "@/ui/locale";
import { scenario, place, flight } from "./fixtureFacts";
import { collectFixtureContributions, type FixtureContribution } from "./contribution";
import { stayContribution } from "./stayContribution";
export type LabScenario = FixtureContribution;
const first = "2027-01-15",
  second = "2027-01-16";
export function getDl1FixtureCatalog(): readonly LabScenario[] {
  return [
    scenario("day-lab-nelson", t("dayLab.fixture3"), [
      place("nelson-walk", t("dayLab.fixture4"), first, "11:00", "13:00"),
      place("nelson-lookout", t("dayLab.fixture5"), first, "15:00"),
      ...Array.from({ length: 8 }, (_, i) =>
        place(
          `nelson-stop-${i}`,
          t("dayLab.trailStop", { number: i + 1 }),
          first,
          `${16 + i}:00`,
        ),
      ),
      place("nelson-day-two", t("dayLab.fixture6"), second, "09:00"),
    ]),
    scenario("day-lab-faroe", t("dayLab.fixture7"), [
      place("faroe-harbour", t("dayLab.fixture8"), first, "09:00"),
      flight("faroe-flight", first, "11:00", "13:00"),
      place("faroe-date-only", t("dayLab.fixture9"), first),
      place("faroe-day-two", t("dayLab.fixture10"), second, "10:00"),
    ]),
    scenario("day-lab-europe", t("dayLab.fixture11"), [
      flight("europe-flight", first, "10:00", "13:00"),
      place("europe-square", t("dayLab.fixture12"), first, "15:00"),
      flight("europe-unknown-arrival", second, "10:00"),
    ]),
    scenario("day-lab-urban", t("dayLab.fixture13"), [
      place("urban-museum", t("dayLab.fixture14"), first, "11:00", "13:00"),
      {
        ...place("urban-dining", t("dayLab.fixture15"), first, "18:00"),
        event_type: "meal",
      },
      place("urban-park", t("dayLab.fixture16"), second),
    ]),
    scenario("day-lab-sparse", t("dayLab.fixture17"), [
      place("sparse-date-only", t("dayLab.fixture18"), second),
      flight("sparse-flight", second),
    ]),
  ];
}

export function getFixtureCatalog() {
  return collectFixtureContributions([...getDl1FixtureCatalog(), stayContribution()]);
}

// Trip changes reset to its first date; date changes are bounded to the catalog.
export function selectLabContext(
  tripId: string,
  date?: string,
  catalog = getFixtureCatalog(),
) {
  const trip = catalog.find((entry) => entry.id === tripId);
  if (!trip || (date !== undefined && !trip.dates.includes(date)))
    throw new Error("DAY_LAB_CONTEXT");
  return { trip, date: date ?? trip.selectedDate };
}

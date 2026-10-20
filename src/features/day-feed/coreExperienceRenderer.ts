import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import type { DayRowRenderer } from "./rendererContribution";
import { createCoreStayRenderer } from "./coreStayRenderer";
import { createCoreRentalRenderer } from "./coreRentalRenderer";
import { createCoreScheduledTransportRenderer } from "./coreScheduledTransportRenderer";
import { createCoreTicketedActivityRenderer } from "./coreTicketedActivityRenderer";

export function createCoreExperienceRenderer(
  projection: CoreFlightDayProjection,
): DayRowRenderer {
  const stay = createCoreStayRenderer(projection);
  const rental = createCoreRentalRenderer(projection);
  const transport = createCoreScheduledTransportRenderer(projection);
  const activity = createCoreTicketedActivityRenderer(projection);
  return (props) => stay(props) ?? rental(props) ?? transport(props) ?? activity(props);
}

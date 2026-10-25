import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import type { DayRowRenderer } from "./rendererContribution";
import { createCoreP1Renderer } from "./coreP1Renderer";
import { createCoreStayRenderer } from "./coreStayRenderer";
import { createCoreRentalRenderer } from "./coreRentalRenderer";
import { createCoreScheduledTransportRenderer } from "./coreScheduledTransportRenderer";
import { createCoreTicketedActivityRenderer } from "./coreTicketedActivityRenderer";

export function createCoreExperienceRenderer(
  projection: CoreFlightDayProjection,
): DayRowRenderer {
  const p1 = createCoreP1Renderer(projection);
  const stay = createCoreStayRenderer(projection);
  const rental = createCoreRentalRenderer(projection);
  const transport = createCoreScheduledTransportRenderer(projection);
  const activity = createCoreTicketedActivityRenderer(projection);
  return (props) =>
    p1(props) ?? stay(props) ?? rental(props) ?? transport(props) ?? activity(props);
}

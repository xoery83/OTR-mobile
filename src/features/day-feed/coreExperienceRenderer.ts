import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import type { DayRowRenderer } from "./rendererContribution";
import { createCoreP1Renderer, type CoreP1PresentationActions } from "./coreP1Renderer";
import {
  createCoreStayRenderer,
  type CoreStayPresentationActions,
} from "./coreStayRenderer";
import { createCoreRentalRenderer } from "./coreRentalRenderer";
import { createCoreScheduledTransportRenderer } from "./coreScheduledTransportRenderer";
import { createCoreTicketedActivityRenderer } from "./coreTicketedActivityRenderer";

export function createCoreExperienceRenderer(
  projection: CoreFlightDayProjection,
  actions?: CoreP1PresentationActions & CoreStayPresentationActions,
): DayRowRenderer {
  const p1 = createCoreP1Renderer(projection, actions);
  const stay = createCoreStayRenderer(projection, actions);
  const rental = createCoreRentalRenderer(projection);
  const transport = createCoreScheduledTransportRenderer(projection);
  const activity = createCoreTicketedActivityRenderer(projection);
  return (props) =>
    p1(props) ?? stay(props) ?? rental(props) ?? transport(props) ?? activity(props);
}

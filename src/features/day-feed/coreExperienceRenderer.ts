import {
  createCoreFlightRenderer,
  type CoreFlightPresentationActions,
} from "./coreFlightRenderer";
import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import type { DayRowRenderer } from "./rendererContribution";
import { createCoreP1Renderer, type CoreP1PresentationActions } from "./coreP1Renderer";
import {
  createCoreStayRenderer,
  type CoreStayPresentationActions,
} from "./coreStayRenderer";
import {
  createCoreRentalRenderer,
  type CoreRentalPresentationActions,
} from "./coreRentalRenderer";
import {
  type CoreScheduledTransportPresentationActions,
  createCoreScheduledTransportRenderer,
} from "./coreScheduledTransportRenderer";
import {
  createCoreTicketedActivityRenderer,
  type CoreActivityPresentationActions,
} from "./coreTicketedActivityRenderer";

export function createCoreExperienceRenderer(
  projection: CoreFlightDayProjection,
  actions?: CoreP1PresentationActions &
    CoreFlightPresentationActions &
    CoreStayPresentationActions &
    CoreRentalPresentationActions &
    CoreScheduledTransportPresentationActions &
    CoreActivityPresentationActions,
): DayRowRenderer {
  const p1 = createCoreP1Renderer(projection, actions);
  const flight = createCoreFlightRenderer(projection, actions);
  const stay = createCoreStayRenderer(projection, actions);
  const rental = createCoreRentalRenderer(projection, actions);
  const transport = createCoreScheduledTransportRenderer(projection, actions);
  const activity = createCoreTicketedActivityRenderer(projection, actions);
  return (props) =>
    p1(props) ??
    flight(props) ??
    stay(props) ??
    rental(props) ??
    transport(props) ??
    activity(props);
}

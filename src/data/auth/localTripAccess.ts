import { readCommittedLocalPrincipal } from "./authRepository";
import { readLocalTripRepository as readAccountTrips } from "../repositories/tripRepository";
import { readTripDayFeed as readAccountDays } from "../repositories/tripDayFeedRepository";
import { createDefaultManualPlanRepository as readAccountPlan } from "../repositories/manualPlanRepository";
import { createDefaultManualStayRepository as readAccountStay } from "../repositories/manualStayRepository";
import { kickNativeTripQaSync } from "../sync/nativeTripQaScope";

export type {
  ManualPlanDraft,
  ManualPlanFields,
  ManualPlanRepository,
} from "../repositories/manualPlanRepository";
export type { createTripDayFeedReader } from "../repositories/tripDayFeedRepository";

export const readLocalTripPrincipal = readCommittedLocalPrincipal;

async function guestWorkspace() {
  const principal = await readLocalTripPrincipal();
  if (principal?.kind === "GUEST")
    return (await import("./guestLocalWorkspace")).openGuestLocalWorkspace();
  if (principal?.kind === "ACCOUNT") return null;
  throw new Error("LOCAL_TRIP_PRINCIPAL_REQUIRED");
}

// Only the local capabilities shared by both principals reach Native consumers.
export async function readLocalTripRepository() {
  return (await guestWorkspace())?.trips ?? readAccountTrips();
}
export async function readTripDayFeed() {
  return (await guestWorkspace())?.days ?? readAccountDays();
}
export async function createDefaultManualPlanRepository() {
  return (await guestWorkspace())?.plan ?? readAccountPlan();
}
export async function createDefaultManualStayRepository() {
  const workspace = await guestWorkspace();
  return workspace ? workspace.stay : readAccountStay();
}
export async function confirmGuestStaySaved(tripId: string, itemId: string) {
  const workspace = await guestWorkspace();
  if (!workspace) throw Error("LOCAL_GUEST_REQUIRED");
  await workspace.stay.read(tripId, itemId);
  const census = await workspace.readCensus();
  if (!census.blockers.includes("UNSUPPORTED_CORE_FAMILY"))
    throw Error("GUEST_ADOPTION_PREFLIGHT_REQUIRED");
}
export async function kickLocalTripSync() {
  if ((await readLocalTripPrincipal())?.kind === "ACCOUNT") kickNativeTripQaSync();
}

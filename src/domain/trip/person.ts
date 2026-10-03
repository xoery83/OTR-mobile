/** Semantic aliases, consistent with the existing string UUID contracts. */
export type TripId = string;
/** Existing journey_members.id; never an Auth User ID or a name/email key. */
export type TripPersonId = string;
export type AccountUserId = string;

/**
 * A Trip-scoped person, independent of Account linkage and access permissions.
 * Future Booking/Itinerary participation references TripPersonId; an Expense
 * Participant remains an Expense-specific relationship to that same Member ID.
 * The local Member projection does not provide user_id, so it is intentionally
 * absent here rather than represented as a fabricated null or inferred identity.
 */
export type TripPerson = {
  tripId: TripId;
  personId: TripPersonId;
  displayName: string;
  /** null describes unavailable lifecycle observation, not a business state. */
  participation: { isParticipating: boolean; revision: number } | null;
};

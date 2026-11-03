import profile from "./registeredProfile.json";
import { persistenceDigest } from "../externalIntegrationPersistence";
export const registeredFlightEnrichmentProfile = Object.freeze({
  ...profile,
  accepted_returned_models: Object.freeze(profile.accepted_returned_models),
});
export const flightEnrichmentProfileSha256 = persistenceDigest(
  registeredFlightEnrichmentProfile,
);

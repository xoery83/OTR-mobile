// Local intake/integrity marker only. Host sandbox still owns PNG decode/qualification.
export const PNG_CAPTURE_ORIGINAL_PROFILE = "OTR_PNG_CAPTURE_ORIGINAL_V1" as const;

// Execution fingerprints are qualified by the owning Source registry, never by a client label.
export const PNG_ARM_EXECUTION_PROFILE_SHA256 =
  "526b66b7bd63daeed309c3d2630cdeaec759a6031a9efe7ade381c06fd04ede5";
export const PNG_DEV_X64_EXECUTION_PROFILE_SHA256 =
  "0e22d87a595129dbd9a3b2b00a771379f0e26d15d7a46781c76c7c08ed65a726";

import { defineConfig } from "vitest/config";

const approvedDevProjectRef = "tuqigdxrvrerfewsxqgm";
for (const name of ["EXPO_PUBLIC_OTR_DEV_SUPABASE_URL", "OTR_DEV_SUPABASE_URL"]) {
  const value = process.env[name];
  if (
    value &&
    !["127.0.0.1", "localhost", `${approvedDevProjectRef}.supabase.co`].includes(
      new URL(value).hostname,
    )
  )
    throw new Error(`Test configuration rejects non-Dev target in ${name}.`);
}
for (const name of ["SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_REF"]) {
  const value = process.env[name];
  if (value && value !== approvedDevProjectRef)
    throw new Error(`Test configuration rejects non-Dev target in ${name}.`);
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "backend/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});

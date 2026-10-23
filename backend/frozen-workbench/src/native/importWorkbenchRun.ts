// Compile-only type dependency of the byte-pinned Workbench store module.
// The Backend interpreter never executes the Workbench lab store.
export type DiagnosticTrace = {
  job: { sha256: string; byteCount: number; hostSourceManifest?: Record<string, string> };
  textSha256: string;
  model: unknown;
  result: {
    fields: { path: string; raw: string; normalized?: string; evidence?: unknown }[];
  };
};

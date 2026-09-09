import { useEffect, useState } from "react";

import {
  readFoundationDiagnostics,
  type FoundationDiagnostics,
} from "@/data/foundation/foundationDiagnostics";

export function useFoundationDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<FoundationDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void readFoundationDiagnostics()
      .then(setDiagnostics)
      .catch(() => setError("Diagnostics unavailable."));
  }, []);

  return { diagnostics, error };
}

import { readLocalSession } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";

import type { FoundationBootstrapDependencies } from "./bootstrapApplication";

export const defaultBootstrapDependencies: FoundationBootstrapDependencies = {
  openDatabase,
  readLocalSession,
};

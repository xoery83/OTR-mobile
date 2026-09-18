import * as SQLite from "expo-sqlite";

import {
  createMigratedDatabaseOpener,
  serializeDatabaseTransactions,
} from "./databaseConnection";
import { runMigrations, type MigrationDatabase } from "./migrationRunner";

const databaseName = "otr-mobile.db";

export const openDatabase = createMigratedDatabaseOpener(
  () => SQLite.openDatabaseAsync(databaseName),
  async (database) => {
    await runMigrations(database as unknown as MigrationDatabase);
    serializeDatabaseTransactions(database);
  },
);

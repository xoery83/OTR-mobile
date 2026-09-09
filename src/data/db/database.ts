import * as SQLite from "expo-sqlite";

import { createMigratedDatabaseOpener } from "./databaseConnection";
import { runMigrations, type MigrationDatabase } from "./migrationRunner";

const databaseName = "otr-mobile.db";

export const openDatabase = createMigratedDatabaseOpener(
  () => SQLite.openDatabaseAsync(databaseName),
  (database) => runMigrations(database as unknown as MigrationDatabase),
);

export function createMigratedDatabaseOpener<T>(
  open: () => Promise<T>,
  migrate: (database: T) => Promise<void>,
) {
  let databasePromise: Promise<T> | null = null;

  return function openMigratedDatabase() {
    if (!databasePromise) {
      databasePromise = open()
        .then(async (database) => {
          await migrate(database);
          return database;
        })
        .catch((error: unknown) => {
          databasePromise = null;
          throw error;
        });
    }

    return databasePromise;
  };
}

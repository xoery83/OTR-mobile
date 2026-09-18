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

export function serializeDatabaseTransactions<
  T extends { withTransactionAsync(task: () => Promise<void>): Promise<void> },
>(database: T): T {
  const run = database.withTransactionAsync.bind(database);
  let tail = Promise.resolve();
  database.withTransactionAsync = (task) => {
    const result = tail.then(() => run(task));
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  return database;
}

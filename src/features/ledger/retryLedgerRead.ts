export async function retrySQLiteRollbackOnce<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (!(error instanceof Error) || !/abort due to ROLLBACK/i.test(error.message))
      throw error;
    return task();
  }
}

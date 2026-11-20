// In-process only. The Gateway captures its verified Auth evidence in this callback.
export type ManagedWriteAdmission = (
  actorAccountId: string,
  operation: Readonly<{ operationId: string; tripId: string }>,
  wireBody?: unknown,
) => Promise<boolean>;

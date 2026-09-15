const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function focusedTransferParams(id: unknown, journeyId: unknown) {
  return typeof id === "string" &&
    typeof journeyId === "string" &&
    uuid.test(id) &&
    uuid.test(journeyId)
    ? { id, journeyId }
    : null;
}

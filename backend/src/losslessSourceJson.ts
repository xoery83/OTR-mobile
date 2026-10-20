// Node 24 preserves raw JSON numeric tokens; this object is only a SQL source proof.
export function losslessSourceJson(text: string): unknown {
  const rawJSON = (JSON as typeof JSON & { rawJSON(text: string): unknown }).rawJSON;
  return JSON.parse(text, (_key, value, context?: { source: string }) =>
    typeof value === "number" ? rawJSON(context!.source) : value,
  );
}

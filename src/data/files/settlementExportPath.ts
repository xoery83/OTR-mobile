const exportRoot = "settlement-exports/";

export function resolveSettlementExportUri(storedUri: string, documentDirectory: string) {
  const offset = storedUri.indexOf(exportRoot);
  return offset < 0 ? storedUri : `${documentDirectory}${storedUri.slice(offset)}`;
}

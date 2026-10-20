// Presentation return only; this is never source/Trip authority or a submission association.
export function captureOriginPath(
  origin: unknown,
  generation: unknown,
  currentGeneration: number,
): "/updates" | null {
  return origin === "UPDATES" && generation === String(currentGeneration)
    ? "/updates"
    : null;
}

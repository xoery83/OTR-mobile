// Mirrors the frozen B_PREPARED direct UTF8 text profile; never normalizes the retained original.
export function universalPreparedText(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

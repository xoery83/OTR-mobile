export type ScrollAnchor = { collapse: number; body: number };

export function advanceScrollAnchor(
  anchor: ScrollAnchor,
  delta: number,
  collapseDistance: number,
): ScrollAnchor {
  if (delta >= 0) {
    const collapse = Math.min(collapseDistance, anchor.collapse + delta);
    return { collapse, body: anchor.body + delta - (collapse - anchor.collapse) };
  }
  const body = Math.max(0, anchor.body + delta);
  return {
    collapse: Math.max(0, anchor.collapse + delta + anchor.body - body),
    body,
  };
}

export function restoredScrollY(sharedCollapse: number, savedBody: number) {
  return sharedCollapse + savedBody;
}

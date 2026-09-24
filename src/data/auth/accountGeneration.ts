let generation = 0;

export function getAccountGeneration() {
  return generation;
}

export function advanceAccountGeneration() {
  generation += 1;
  return generation;
}

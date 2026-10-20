let generation = 0;
const listeners = new Set<() => void>();

export function subscribeAccountGeneration(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAccountGeneration() {
  return generation;
}

export function advanceAccountGeneration() {
  generation += 1;
  listeners.forEach((listener) => listener());
  return generation;
}

export function createItineraryPickerHandoff<T>() {
  let sequence = 0;
  let entry: { id: string; read: () => T | null } | undefined;
  return {
    stage(read: () => T | null) {
      if (entry?.read() || !read()) return undefined;
      const id = String(++sequence);
      entry = { id, read };
      return id;
    },
    read(id: string | undefined) {
      return entry?.id === id ? entry?.read() : undefined;
    },
    release(id: string | undefined) {
      if (entry?.id === id) entry = undefined;
    },
  };
}

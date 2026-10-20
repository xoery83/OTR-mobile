export function createLatestRequest() {
  let latest = 0;
  return {
    begin: () => ++latest,
    isCurrent: (request: number) => request === latest,
    cancel: () => {
      latest += 1;
    },
  };
}

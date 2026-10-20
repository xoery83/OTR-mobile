import * as FileSystem from "expo-file-system/legacy";

export type CachedFile = {
  cacheKey: string;
  uri: string;
};

export type LocalFileCache = {
  download(cacheKey: string, sourceUrl: string): Promise<CachedFile>;
  exists(cacheKey: string): Promise<boolean>;
  remove(cacheKey: string): Promise<void>;
};

const cacheDirectory = `${FileSystem.cacheDirectory}otr-mobile/`;

function cacheUri(cacheKey: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(cacheKey)) {
    throw new Error("Local cache keys must be path-safe identifiers.");
  }

  return `${cacheDirectory}${cacheKey}`;
}

export function createLocalFileCache(): LocalFileCache {
  return {
    async download(cacheKey, sourceUrl) {
      const uri = cacheUri(cacheKey);
      await FileSystem.makeDirectoryAsync(cacheDirectory, { intermediates: true });
      await FileSystem.downloadAsync(sourceUrl, uri);
      return { cacheKey, uri };
    },

    async exists(cacheKey) {
      return (await FileSystem.getInfoAsync(cacheUri(cacheKey))).exists;
    },

    async remove(cacheKey) {
      await FileSystem.deleteAsync(cacheUri(cacheKey), { idempotent: true });
    },
  };
}

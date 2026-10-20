import { constants, closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import { z } from "zod";
import { createPublicationCatalogPgConnection } from "./tripPublicationCatalogPgConnection";

const path = "/run/otr/catalog-reader.json";
const schema = z
  .object({
    password: z.string().min(1).max(4096),
    ca: z.string().min(1).max(16384),
    expiry: z.iso.datetime({ offset: true }),
  })
  .strict();

// Only the authorized DEV host's read-only private tmpfs mount opens this seam.
export function loadDevPublicationCatalog(network: string, url: string) {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("DEV_CATALOG_CUSTODY_UNAVAILABLE");
  }
  try {
    const stat = fstatSync(fd);
    if (
      network !== "host" ||
      url !== "https://tuqigdxrvrerfewsxqgm.supabase.co" ||
      !stat.isFile() ||
      stat.uid !== 0 ||
      stat.gid !== 999 ||
      (stat.mode & 0o777) !== 0o440 ||
      stat.nlink !== 1 ||
      stat.size > 24576
    )
      throw 0;
    const config = schema.parse(JSON.parse(readFileSync(fd, "utf8")));
    const deadline = Date.parse(config.expiry);
    const remaining = deadline - Date.now();
    if (remaining <= 0 || remaining > 90 * 86400000) throw 0;
    const connection = createPublicationCatalogPgConnection({
      host: "db.tuqigdxrvrerfewsxqgm.supabase.co",
      port: 5432,
      database: "postgres",
      password: config.password,
      ca: config.ca,
    });
    let timer: ReturnType<typeof setTimeout>;
    function retireAtExpiry() {
      const remaining = deadline - Date.now();
      if (remaining <= 0) void connection.close();
      else timer = setTimeout(retireAtExpiry, Math.min(remaining, 2147483647));
    }
    retireAtExpiry();
    return {
      withLease: connection.withLease,
      close() {
        clearTimeout(timer);
        return connection.close();
      },
    };
  } catch {
    throw new Error("DEV_CATALOG_CUSTODY_UNAVAILABLE");
  } finally {
    closeSync(fd);
  }
}

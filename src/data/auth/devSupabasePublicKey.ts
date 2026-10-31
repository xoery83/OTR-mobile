// Key classification only; the issuing service still validates credentials.
export function isSupabaseDevPublicKey(key: string) {
  if (key.length <= 30 || key.length > 4096 || /[\r\n]/.test(key)) return false;
  if (key.startsWith("sb_publishable_")) return true;
  try {
    const value = JSON.parse(
      atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return value.role === "anon" && value.ref === "tuqigdxrvrerfewsxqgm";
  } catch {
    return false;
  }
}

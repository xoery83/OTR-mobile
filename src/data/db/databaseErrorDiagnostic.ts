// Only database error categories and SQL identifiers, never query parameters.
export function databaseErrorDiagnostic(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : typeof error === "string"
        ? error
        : "";
  return (
    message.match(
      /FOREIGN KEY constraint failed|UNIQUE constraint failed(?:: [a-z_][\w.]*(?:, [a-z_][\w.]*)*)?|NOT NULL constraint failed: [a-z_][\w.]*|CHECK constraint failed|no such (?:table|column): [a-z_][\w.]*|table [a-z_][\w.]* has no column named [a-z_][\w.]*|ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint|cannot start a transaction within a transaction|cannot commit - no transaction is active|database is locked|syntax error|Invalid bind parameter|Unsupported parameter type|Access to closed resource/i,
    )?.[0] ??
    (error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ERR_INTERNAL_SQLITE_ERROR"
      ? message.match(/Error code \d+: [^\n]+/)?.[0].slice(0, 240)
      : undefined) ??
    (error instanceof TypeError
      ? "TypeError"
      : error instanceof SyntaxError
        ? "SyntaxError"
        : error &&
            typeof error === "object" &&
            "code" in error &&
            /^\w{1,60}$/.test(String(error.code))
          ? String(error.code)
          : "local")
  );
}

import { expect, it } from "vitest";
import { databaseErrorDiagnostic } from "./databaseErrorDiagnostic";

it("keeps SQL failure categories without exposing parameters or financial values", () => {
  expect(
    databaseErrorDiagnostic(
      new Error("Native error: UNIQUE constraint failed: ledger_expenses.id\nJPY644"),
    ),
  ).toBe("UNIQUE constraint failed: ledger_expenses.id");
  expect(databaseErrorDiagnostic(new Error("FOREIGN KEY constraint failed"))).toBe(
    "FOREIGN KEY constraint failed",
  );
  expect(databaseErrorDiagnostic(new Error("unexpected JPY644"))).toBe("local");
  expect(databaseErrorDiagnostic({ message: "Unsupported parameter type: ABC" })).toBe(
    "Unsupported parameter type",
  );
  expect(databaseErrorDiagnostic(new TypeError("private parameters"))).toBe("TypeError");
  expect(
    databaseErrorDiagnostic({
      code: "ERR_INTERNAL_SQLITE_ERROR",
      message:
        "Native call rejected\nError code 1: cannot rollback - no transaction is active",
    }),
  ).toBe("Error code 1: cannot rollback - no transaction is active");
});

import { expect, it } from "vitest";
import { parseReferenceFlightText } from "./referenceFlightExtractor";
import { assembleFlightDocuments } from "./flightAssembly";
const row = (a: string, b: string) => `  ${a.padEnd(30)}${b}`;
const table = (
  from: string,
  to: string,
  origin: string,
  destination: string,
  date: string,
) =>
  [
    `${from} to ${to}`,
    row("Departure", "Arrival"),
    " ",
    row("8:15 AM", "9:40 AM"),
    row(date, date),
    "",
    row(from, to),
    row(origin, destination),
  ].join("\n");
const document = () =>
  `日本語\nFlight details\n${table("Boston", "Miami", "BOS", "MIA", "Mon 14 Dec 2026")}\n${table("Miami", "Boston", "MIA", "BOS", "Tue 22 Dec 2026")}`;
it("reads two explicitly aligned endpoint columns with exact UTF8 field evidence", () => {
  const text = document(),
    parsed = parseReferenceFlightText("input", text);
  expect(parsed.items).toHaveLength(2);
  expect(
    parsed.items[0].fields.find((f) => f.path === "origin.airport")?.normalized,
  ).toMatchObject({ value: "BOS" });
  expect(
    parsed.items[0].fields.find((f) => f.path === "destination.airport")?.normalized,
  ).toMatchObject({ value: "MIA" });
  const bytes = new TextEncoder().encode(text);
  for (const item of parsed.items)
    for (const field of item.fields)
      for (const id of field.fragment_ids) {
        const span = parsed.fragments.find((f) => f.id === id)!.locator;
        expect(new TextDecoder().decode(bytes.slice(span.start!, span.end!))).toBe(
          field.raw,
        );
      }
  const assembled = assembleFlightDocuments([{ inputId: "input", text, parsed }]);
  expect(assembled.segments).toHaveLength(2);
  expect(assembled.segments.every((s) => s.readiness.decision === "NEEDS_REVIEW")).toBe(
    true,
  );
  expect(assembled.grantsAdmission).toBe(false);
});
it("keeps identical date/clock cells independently anchored in their true columns", () => {
  const text = document(),
    parsed = parseReferenceFlightText("input", text);
  const origin = parsed.items[0].fields.find((f) => f.path === "origin.local_date")!;
  const destination = parsed.items[0].fields.find(
    (f) => f.path === "destination.local_date",
  )!;
  expect(origin.raw).toBe(destination.raw);
  expect(origin.fragment_ids).not.toEqual(destination.fragment_ids);
});
it.each(["unaligned", "third column", "bad date", "no Flight context"])(
  "does not infer a table from %s",
  (failure) => {
    let text = document();
    if (failure === "unaligned")
      text = text.replace(
        row("8:15 AM", "9:40 AM"),
        row("8:15 AM", "9:40 AM").replace("9:40", " 9:40"),
      );
    if (failure === "third column")
      text = text.replace(
        row("Departure", "Arrival"),
        row("Departure", "Arrival") + "     Other",
      );
    if (failure === "bad date")
      text = text.replace(
        row("Mon 14 Dec 2026", "Mon 14 Dec 2026"),
        row("not a date", "not a date"),
      );
    if (failure === "no Flight context") text = text.replace("Flight details", "Details");
    const result = parseReferenceFlightText("input", text);
    expect(
      result.items.some((item) =>
        item.fields.some(
          (f) =>
            f.path === "origin.airport" && JSON.stringify(f.normalized).includes("BOS"),
        ),
      ),
    ).toBe(false);
  },
);
it("keeps ignored header/unknown airport spans in actual document order", () => {
  const text = document().replace(row("BOS", "MIA"), row("unknown", "unknown"));
  const parsed = parseReferenceFlightText("input", text);
  expect(parsed.items).toHaveLength(2);
  for (const span of parsed.ignored) {
    expect(span.start).toBeGreaterThanOrEqual(0);
    expect(span.end).toBeGreaterThan(span.start!);
  }
  for (let index = 1; index < parsed.ignored.length; index++)
    expect(parsed.ignored[index].start).toBeGreaterThanOrEqual(
      parsed.ignored[index - 1].end!,
    );
});

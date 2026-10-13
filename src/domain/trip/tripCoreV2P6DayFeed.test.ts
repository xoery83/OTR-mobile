import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { ticketedActivityContribution } from "@/features/day-feed-lab/ticketedActivityContribution";

vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const primitive = ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children);
  return {
    Image: primitive,
    Pressable: primitive,
    Text: primitive,
    View: primitive,
    Linking: { openURL: vi.fn() },
    StyleSheet: { create: (value: unknown) => value, hairlineWidth: 0.5 },
    useWindowDimensions: () => ({ width: 375, height: 812, fontScale: 1 }),
    useColorScheme: () => "light",
  };
});

it("keeps qualified P6 start in Timeline and unresolved planned clock in Core TNS", () => {
  const future = ticketedActivityContribution("FUTURE");
  const qualified = future.query!(future.selectedDate, future.zone);
  expect(qualified.coreRows?.filter((row) => row.family === "P6")).toMatchObject([
    { position: "TIMELINE", rowKey: { projectionRole: "ENTRY" } },
  ]);
  expect(
    qualified.timed.filter((row) => row.event.id.startsWith("e1000000-")),
  ).toHaveLength(1);

  const unresolved = ticketedActivityContribution("TNS");
  const tns = unresolved.query!(unresolved.selectedDate, unresolved.zone);
  expect(tns.coreRows?.filter((row) => row.family === "P6")).toMatchObject([
    {
      position: "TNS",
      displayTime: { localTime: "09:00:00", comparable: false },
    },
  ]);
  expect(
    tns.nonComparable.filter((row) => row.event.id.startsWith("e1000000-")),
  ).toHaveLength(1);
  expect(tns.unresolved.filter((row) => row.id.startsWith("e1000000-"))).toEqual([]);
});

// Local presentation preference only; never a Trip/Day business field.
export type DayHeaderStyle = "A" | "B" | "C" | "D";
export const nextDayHeaderStyle = (style: DayHeaderStyle): DayHeaderStyle =>
  ({ A: "B", B: "C", C: "D", D: "A" })[style] as DayHeaderStyle;

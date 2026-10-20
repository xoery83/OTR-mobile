// FORM1-A: one 2+5 chooser, with only the existing lawful writers enabled.
export const manualItineraryTypes = [
  {
    id: "P1",
    labelKey: "formEntry.plan",
    hintKey: "formEntry.planHint",
    icon: "mappin.and.ellipse",
    enabled: true,
  },
  {
    id: "FLEXIBLE",
    labelKey: "formEntry.flexible",
    hintKey: "formEntry.flexibleHint",
    icon: "clock",
    enabled: false,
    reasonKey: "formEntry.flexibleUnavailable",
  },
  {
    id: "P2",
    labelKey: "formEntry.flight",
    icon: "airplane",
    enabled: true,
  },
  { id: "P3", labelKey: "formEntry.stay", icon: "bed.double", enabled: true },
  { id: "P4", labelKey: "formEntry.rental", icon: "car", enabled: true },
  { id: "P5", labelKey: "formEntry.transport", icon: "tram", enabled: true },
  {
    id: "P6",
    labelKey: "formEntry.activity",
    icon: "ticket",
    enabled: false,
    reasonKey: "formEntry.activityUnavailable",
  },
] as const;

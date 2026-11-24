import { useState, type ReactNode } from "react";
import {
  analysisDateBounds,
  analysisPresetBounds,
  type AnalysisRangePreset,
} from "@/domain/ledger/spendingAnalysis";
import { UiButton, UiText } from "@/ui/controls";
import { UiChoiceChip, UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { categoryLabel } from "@/ui/domainLabels";
import { useUiLocale } from "@/ui/useUiLocale";
import type { AnalysisPicker } from "./analysisPickerInvocation";

const rangeLabels = {
  ENTIRE: "extra.copy21",
  LAST_30: "extra.copy22",
  MONTH: "extra.copy23",
  YEAR: "extra.copy24",
  CUSTOM: "extra.copy25",
} as const satisfies Record<AnalysisRangePreset, string>;

type RenderPanel = (fields: ReactNode, confirm?: () => void) => ReactNode;

export function AnalysisPickerFields({
  picker,
  panel,
}: {
  picker: Extract<AnalysisPicker, { kind: "range" | "category" }>;
  panel?: RenderPanel;
}) {
  useUiLocale();
  const render = panel ?? ((fields) => fields);
  return picker.kind === "range" ? (
    <RangeFields picker={picker} panel={panel} />
  ) : (
    render(
      [null, ...picker.options].map((category) => (
        <UiChoiceChip
          key={category ?? "__all__"}
          label={category ? categoryLabel(category) : t("ui.allCategories")}
          selected={picker.selected === category}
          onPress={() => picker.choose(category)}
        />
      )),
    )
  );
}

function RangeFields({
  picker,
  panel,
}: {
  picker: Extract<AnalysisPicker, { kind: "range" }>;
  panel?: RenderPanel;
}) {
  const [draft, setDraft] = useState<typeof picker.initial>();
  const [invalid, setInvalid] = useState(false);

  function apply() {
    if (!draft) return;
    const range = analysisDateBounds(draft.from, draft.through);
    if (range) picker.choose(range);
    else setInvalid(true);
  }

  const fields = (
    <>
      {picker.presets.map((preset) => (
        <UiButton
          key={preset}
          variant="secondary"
          label={t(rangeLabels[preset])}
          onPress={() => {
            if (preset === "CUSTOM") {
              setDraft(picker.initial);
              setInvalid(false);
            } else picker.choose(analysisPresetBounds(preset, picker.today));
          }}
        />
      ))}
      {draft ? (
        <>
          <UiText>{t("ui.startDate")}</UiText>
          <UiTextInput
            accessibilityLabel={t("ui.analysisStartDate")}
            placeholder={t("ui.yyyymmdd")}
            value={draft.from}
            onChangeText={(from) => setDraft(current => current && { ...current, from })}
          />
          <UiText>{t("ui.endDate")}</UiText>
          <UiTextInput
            accessibilityLabel={t("ui.analysisEndDate")}
            placeholder={t("ui.yyyymmdd")}
            value={draft.through}
            onChangeText={(through) => setDraft(current => current && { ...current, through })}
          />
          {invalid ? (
            <UiText accessibilityLiveRegion="polite" accessibilityRole="alert">
              {t("ui.enterValidDatesAsYyyymmddWithTheEndOnOr")}
            </UiText>
          ) : null}
          {!panel ? <UiButton label={t("ui.applyCustomRange")} onPress={apply} /> : null}
        </>
      ) : null}
    </>
  );
  return panel ? panel(fields, draft ? apply : undefined) : fields;
}

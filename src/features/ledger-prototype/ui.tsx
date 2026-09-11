import type { PropsWithChildren, ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type ViewStyle,
} from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

import { colors } from "./theme";

export function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(minor / 100);
}

export function Icon({
  name,
  color = colors.secondaryLabel,
  size = 20,
}: {
  name: SymbolViewProps["name"];
  color?: ColorValue;
  size?: number;
}) {
  return <SymbolView name={name} size={size} tintColor={color} weight="semibold" />;
}

export function PrototypeBanner() {
  return (
    <View accessibilityRole="text" style={styles.prototypeBanner}>
      <Icon color={colors.warning} name="hammer.fill" size={15} />
      <Text style={styles.prototypeText}>Prototype · Local fixtures only</Text>
    </View>
  );
}

export function Section({ title, children }: PropsWithChildren<{ title?: string }>) {
  return (
    <View style={styles.sectionWrap}>
      {title ? <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text> : null}
      <View style={styles.section}>{children}</View>
    </View>
  );
}

export function Separator() {
  return <View style={styles.separator} />;
}

export function NavigationRow({
  icon,
  label,
  value,
  onPress,
  destructive = false,
  accessibilityHint,
}: {
  icon?: SymbolViewProps["name"];
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole={onPress ? "button" : "text"}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null]}
    >
      {icon ? (
        <Icon color={destructive ? colors.danger : colors.accent} name={icon} />
      ) : null}
      <Text style={[styles.rowLabel, destructive ? styles.destructive : null]}>
        {label}
      </Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress ? <Icon name="chevron.right" size={14} /> : null}
    </Pressable>
  );
}

export function StatusPill({ status }: { status: "SYNCED" | "PENDING" | "CONFLICT" }) {
  const config = {
    SYNCED: {
      color: colors.accent,
      icon: "checkmark.circle.fill" as const,
      label: "Synced",
    },
    PENDING: {
      color: colors.warning,
      icon: "clock.fill" as const,
      label: "Saved locally",
    },
    CONFLICT: {
      color: colors.danger,
      icon: "exclamationmark.triangle.fill" as const,
      label: "Conflict",
    },
  }[status];
  return (
    <View style={styles.statusPill}>
      <Icon color={config.color} name={config.icon} size={15} />
      <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon?: SymbolViewProps["name"];
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.primaryPressed : null,
      ]}
    >
      {icon ? <Icon color={colors.surface} name={icon} /> : null}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function ValueBlock({
  label,
  value,
  detail,
  tone = "default",
  accessory,
  style,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "positive" | "warning";
  accessory?: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.valueBlock, style]}>
      <View style={styles.valueContent}>
        <Text style={styles.valueLabel}>{label}</Text>
        <Text
          style={[
            styles.valueText,
            tone === "positive" ? styles.positive : null,
            tone === "warning" ? styles.warning : null,
          ]}
        >
          {value}
        </Text>
        {detail ? <Text style={styles.valueDetail}>{detail}</Text> : null}
      </View>
      {accessory}
    </View>
  );
}

const styles = StyleSheet.create({
  prototypeBanner: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.warningSoft,
    borderRadius: 7,
    flexDirection: "row",
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  prototypeText: { color: colors.warning, fontSize: 13, fontWeight: "600" },
  sectionWrap: { gap: 7 },
  sectionTitle: {
    color: colors.secondaryLabel,
    fontSize: 13,
    marginHorizontal: 16,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  separator: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pressed: { backgroundColor: "#E9E9ED" },
  rowLabel: { color: colors.label, flex: 1, fontSize: 17 },
  rowValue: {
    color: colors.secondaryLabel,
    flexShrink: 1,
    fontSize: 16,
    textAlign: "right",
  },
  destructive: { color: colors.danger },
  statusPill: { alignItems: "center", flexDirection: "row", gap: 5 },
  statusText: { fontSize: 13, fontWeight: "600" },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 18,
  },
  primaryPressed: { opacity: 0.78 },
  primaryButtonText: { color: colors.surface, fontSize: 17, fontWeight: "700" },
  disabled: { opacity: 0.35 },
  valueBlock: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 88,
    padding: 14,
  },
  valueContent: { flex: 1 },
  valueLabel: { color: colors.secondaryLabel, fontSize: 13, marginBottom: 3 },
  valueText: { color: colors.label, fontSize: 24, fontWeight: "700" },
  valueDetail: { color: colors.secondaryLabel, fontSize: 14, marginTop: 4 },
  positive: { color: colors.accent },
  warning: { color: colors.warning },
});

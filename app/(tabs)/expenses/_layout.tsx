import { Stack } from "expo-router";

import { LedgerPrototypeProvider } from "@/features/ledger-prototype/LedgerPrototypeProvider";
import { colors } from "@/features/ledger-prototype/theme";

export default function LedgerPrototypeLayout() {
  return (
    <LedgerPrototypeProvider>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.groupedBackground },
          headerBackButtonDisplayMode: "minimal",
          headerShadowVisible: false,
          headerTintColor: colors.accent,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="new"
          options={{
            headerTitle: "New Expense",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="split"
          options={{
            headerTitle: "Split",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="rate"
          options={{
            headerTitle: "Currency & Value",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="receipt"
          options={{
            headerTitle: "Receipt",
            presentation: "modal",
          }}
        />
        <Stack.Screen name="expense/[id]" options={{ headerTitle: "Expense" }} />
        <Stack.Screen name="balance" options={{ headerTitle: "Your Balance" }} />
        <Stack.Screen name="settlement" options={{ headerTitle: "Settlement" }} />
        <Stack.Screen name="analysis" options={{ headerTitle: "Spending Analysis" }} />
        <Stack.Screen name="search" options={{ headerTitle: "Search Expenses" }} />
        <Stack.Screen name="stage2" options={{ headerTitle: "Stage 2 Expense" }} />
        <Stack.Screen name="all-journeys" options={{ headerTitle: "My Ledger" }} />
        <Stack.Screen name="transfer/[id]" options={{ headerTitle: "Transfer" }} />
      </Stack>
    </LedgerPrototypeProvider>
  );
}

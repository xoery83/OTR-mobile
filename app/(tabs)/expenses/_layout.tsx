import { Stack } from "expo-router";

export default function LedgerLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: "#F6F7F9" },
        headerBackButtonDisplayMode: "minimal",
        headerShadowVisible: false,
        headerTintColor: "#0F766E",
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
      <Stack.Screen
        name="personal-settlement-review"
        options={{ headerTitle: "Your Settlement" }}
      />
      <Stack.Screen
        name="settlement-adjustment"
        options={{ headerTitle: "Make Corrections" }}
      />
      <Stack.Screen
        name="settlement-statement"
        options={{ headerTitle: "Statement & Export" }}
      />
      <Stack.Screen name="analysis" options={{ headerTitle: "Spending Analysis" }} />
      <Stack.Screen name="search" options={{ headerTitle: "Search Expenses" }} />
      <Stack.Screen name="stage2" options={{ headerTitle: "Developer Diagnostics" }} />
      <Stack.Screen name="all-journeys" options={{ headerTitle: "My Ledger" }} />
      <Stack.Screen name="settings" options={{ headerTitle: "Settings" }} />
      <Stack.Screen name="exchange-rates" options={{ headerTitle: "Exchange Rates" }} />
      <Stack.Screen name="review" options={{ headerTitle: "Review" }} />
      <Stack.Screen name="review/[id]" options={{ headerTitle: "Finding" }} />
      <Stack.Screen name="transfer/[id]" options={{ headerTitle: "Transfer" }} />
    </Stack>
  );
}

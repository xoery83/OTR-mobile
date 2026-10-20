import { Redirect } from "expo-router";

import { ExpenseSliceScreen } from "@/components/ExpenseSliceScreen";

export default function Stage2ExpenseRoute() {
  if (!__DEV__) return <Redirect href="/expenses/currency" />;
  return <ExpenseSliceScreen />;
}

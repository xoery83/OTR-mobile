import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";

import { bootstrapApplication } from "@/data/bootstrap/bootstrapApplication";
import {
  defaultBootstrapDependencies,
  subscribeOperationalSyncLifecycle,
} from "@/data/bootstrap/defaultBootstrapDependencies";

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  useEffect(() => {
    void bootstrapApplication(defaultBootstrapDependencies).catch(() => {
      // The shell remains available while durable operations wait for a later retry.
    });
  }, []);

  useEffect(() => {
    const subscription = subscribeOperationalSyncLifecycle();
    return () => subscription.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="foundation" options={{ headerShown: true }} />
      </Stack>
    </QueryClientProvider>
  );
}

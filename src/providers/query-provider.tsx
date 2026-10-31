import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

export function AppQueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data lives in the on-device database, so queries never wait for a network.
            networkMode: 'always',
            staleTime: 30_000,
            gcTime: 10 * 60_000,
            retry: 1,
            refetchOnReconnect: false,
          },
          mutations: { networkMode: 'always', retry: 0 },
        },
      }),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
    });
    return () => subscription.remove();
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

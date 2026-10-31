import { type PropsWithChildren, useCallback, useEffect, useState } from 'react';
import { Button, ErrorBanner, LoadingScreen, Screen } from '@/components/ui';
import { getDatabase } from '@/lib/db';
import { errorMessage } from '@/services/shared';

/** Opens and migrates the on-device SQLite database before any screen queries it. */
export function DatabaseProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<{ ready: boolean; error: unknown }>({ ready: false, error: null });

  const open = useCallback(() => {
    setState({ ready: false, error: null });
    getDatabase().then(
      () => setState({ ready: true, error: null }),
      (error: unknown) => setState({ ready: false, error }),
    );
  }, []);

  useEffect(open, [open]);

  if (state.error) {
    return (
      <Screen>
        <ErrorBanner message={errorMessage(state.error, 'Could not open the local database.')} />
        <Button title="Try again" onPress={open} />
      </Screen>
    );
  }
  if (!state.ready) return <LoadingScreen label="Opening Lixo…" />;
  return children;
}

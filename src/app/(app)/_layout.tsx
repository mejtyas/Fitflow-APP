import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '@/components/ui';
import { colors } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';

export default function AppLayout() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="active" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="workout-editor" options={{ presentation: 'modal' }} />
      <Stack.Screen name="exercise-detail" />
      <Stack.Screen name="history-detail" />
      <Stack.Screen name="stats" />
      <Stack.Screen name="feedback" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}

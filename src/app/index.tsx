import { Redirect } from 'expo-router';
import { LoadingScreen } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';

export default function IndexScreen() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen label="Opening FitFlow…" />;
  return <Redirect href={session ? '/(app)/(tabs)' : '/(auth)/sign-in'} />;
}

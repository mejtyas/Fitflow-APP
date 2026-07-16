import { Link, useRouter } from 'expo-router';
import { LockKeyhole, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Brand, Button, Card, ErrorBanner, Field, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { configurationError } from '@/lib/env';
import { useAuth } from '@/providers/auth-provider';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const { signIn, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const registering = mode === 'register';

  const submit = async () => {
    if (configurationError) {
      setError(configurationError);
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    const result = registering ? await register(email, password) : await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.requiresEmailConfirmation) {
      setMessage('Account created. Check your email to confirm it, then sign in.');
      return;
    }
    router.replace('/(app)/(tabs)');
  };

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.hero}>
        <Brand />
        <Text style={styles.kicker}>YOUR WORKOUT LOGGER</Text>
      </View>
      <Card style={styles.card}>
        <View style={styles.heading}>
          <Text style={styles.title}>{registering ? 'Create account' : 'Welcome back'}</Text>
          <Text style={styles.subtitle}>
            {registering ? 'Use the same account on web and mobile.' : 'Sign in to continue your training.'}
          </Text>
        </View>
        {configurationError ? <ErrorBanner message={configurationError} /> : null}
        {error ? <ErrorBanner message={error} /> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          placeholder="you@example.com"
          editable={!loading}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={registering ? 'new-password' : 'current-password'}
          placeholder={registering ? 'At least 6 characters' : 'Your password'}
          editable={!loading}
          onSubmitEditing={() => void submit()}
        />
        <Button
          title={registering ? 'Create account' : 'Sign in'}
          onPress={() => void submit()}
          loading={loading}
          disabled={!email.trim() || !password || Boolean(configurationError)}
          left={registering ? <Mail size={18} color={colors.primaryText} /> : <LockKeyhole size={18} color={colors.primaryText} />}
        />
        <Text style={styles.switchText}>
          {registering ? 'Already have an account? ' : 'New to FitFlow? '}
          <Link href={registering ? '/(auth)/sign-in' : '/(auth)/register'} style={styles.link}>
            {registering ? 'Sign in' : 'Register'}
          </Link>
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', gap: 30, paddingVertical: 36 },
  hero: { alignItems: 'center', gap: 14 },
  kicker: { color: colors.textMuted, fontFamily: fonts.monoSemibold, fontSize: 10, letterSpacing: 2.2 },
  card: { gap: 18 },
  heading: { gap: 6 },
  title: { color: colors.text, fontFamily: fonts.sansBold, fontSize: 25 },
  subtitle: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  success: { color: colors.success, fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 19 },
  switchText: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 14, textAlign: 'center' },
  link: { color: colors.primary, fontFamily: fonts.sansSemibold },
});

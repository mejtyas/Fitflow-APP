import { useRouter } from 'expo-router';
import { BarChart3, LogOut, Menu, MessageSquareText, Settings, User } from 'lucide-react-native';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Brand, Button, Card, PageHeader, RowLink, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';

export default function MoreScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const confirmSignOut = () => Alert.alert('Sign out?', 'Your workout data stays safely in Supabase.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
  ]);
  return (
    <Screen safeBottom={false}>
      <PageHeader title="More" subtitle="Stats, feedback and account settings." icon={<Menu color={colors.primary} size={21} />} />
      <Card style={styles.profile}>
        <View style={styles.avatar}><User color={colors.primary} size={24} /></View>
        <View style={styles.flex}>
          <Text style={styles.profileName}>{user?.email?.split('@')[0] ?? 'Athlete'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
        <Brand compact />
      </Card>
      <Card style={styles.links}>
        <RowLink title="Stats" subtitle="Workout time and your most-used exercises." icon={<BarChart3 color={colors.primary} size={19} />} onPress={() => router.push('/(app)/stats')} />
        <RowLink title="Feedback" subtitle="Share bugs and ideas with collaborators." icon={<MessageSquareText color={colors.primary} size={19} />} onPress={() => router.push('/(app)/feedback')} />
        <RowLink title="Settings" subtitle="Rest defaults and data management." icon={<Settings color={colors.primary} size={19} />} onPress={() => router.push('/(app)/settings')} />
      </Card>
      <Button title="Sign out" variant="outline" onPress={confirmSignOut} left={<LogOut color={colors.text} size={18} />} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  profileName: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 17, textTransform: 'capitalize' },
  email: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, marginTop: 2 },
  links: { paddingVertical: 2 },
});

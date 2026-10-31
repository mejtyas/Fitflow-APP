import { useRouter } from 'expo-router';
import { BarChart3, Menu, MessageSquareText, Settings, Smartphone } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { Brand, Card, PageHeader, RowLink, Screen } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';

export default function MoreScreen() {
  const router = useRouter();
  return (
    <Screen safeBottom={false}>
      <PageHeader title="More" subtitle="Stats, notes and settings." icon={<Menu color={colors.primary} size={21} />} />
      <Card style={styles.profile}>
        <View style={styles.avatar}><Smartphone color={colors.primary} size={24} /></View>
        <View style={styles.flex}>
          <Text style={styles.profileName}>On this device</Text>
          <Text style={styles.email}>Workouts are stored locally, no account needed.</Text>
        </View>
        <Brand compact />
      </Card>
      <Card style={styles.links}>
        <RowLink title="Stats" subtitle="Workout time and your most-used exercises." icon={<BarChart3 color={colors.primary} size={19} />} onPress={() => router.push('/(app)/stats')} />
        <RowLink title="Notes" subtitle="Keep track of bugs and ideas." icon={<MessageSquareText color={colors.primary} size={19} />} onPress={() => router.push('/(app)/feedback')} />
        <RowLink title="Settings" subtitle="Rest defaults and data management." icon={<Settings color={colors.primary} size={19} />} onPress={() => router.push('/(app)/settings')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  profileName: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 17 },
  email: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, marginTop: 2 },
  links: { paddingVertical: 2 },
});

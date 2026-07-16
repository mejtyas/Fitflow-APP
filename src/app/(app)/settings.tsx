import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowLeft, Mail, Save, Settings, ShieldAlert, Timer, Trash2, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ErrorBanner, Field, PageHeader, Screen } from '@/components/ui';
import { colors, fonts, radius } from '@/constants/theme';
import { formatRestMs } from '@/lib/format';
import { getDefaultRestSeconds, REST_PRESET_SECONDS, saveDefaultRestSeconds } from '@/lib/preferences';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/providers/auth-provider';
import { deleteAllUserData } from '@/services/history';
import { errorMessage } from '@/services/shared';

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [seconds, setSeconds] = useState(150);
  const [draft, setDraft] = useState('150');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void getDefaultRestSeconds().then((value) => { setSeconds(value); setDraft(String(value)); });
  }, []);
  const remove = useMutation({
    mutationFn: () => deleteAllUserData(user!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
      Alert.alert('Data deleted', 'Your workout logs, routines and exercises were deleted.');
    },
  });
  const save = async (valueRaw = draft) => {
    const value = Number.parseInt(valueRaw, 10);
    if (!Number.isFinite(value)) return;
    const next = await saveDefaultRestSeconds(value);
    setSeconds(next);
    setDraft(String(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  const confirmDelete = () => Alert.alert(
    'Delete all workout data?',
    'This permanently deletes all logs, routines, exercises and related data. Your account remains active.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () => Alert.alert('Final confirmation', 'There is no undo. Delete everything now?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete everything', style: 'destructive', onPress: () => remove.mutate() },
        ]),
      },
    ],
  );

  return (
    <Screen>
      <Button title="More" compact variant="ghost" style={styles.back} onPress={() => router.back()} left={<ArrowLeft color={colors.textMuted} size={18} />} />
      <PageHeader title="Settings" subtitle="Account preferences and workout data." icon={<Settings color={colors.primary} size={21} />} />
      {remove.error ? <ErrorBanner message={errorMessage(remove.error)} /> : null}
      <Card style={styles.cardGap}>
        <View style={styles.heading}><User color={colors.primary} size={19} /><Text style={styles.title}>Profile</Text></View>
        <View style={styles.profileRow}>
          <View style={styles.profileIcon}><Mail color={colors.primary} size={21} /></View>
          <View style={styles.flex}>
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
        </View>
      </Card>
      <Card style={styles.cardGap}>
        <View style={styles.heading}><Timer color={colors.primary} size={19} /><Text style={styles.title}>Default rest</Text></View>
        <Text style={styles.body}>Used between sets unless you override an exercise during the active workout.</Text>
        <View style={styles.presets}>
          {REST_PRESET_SECONDS.map((value) => (
            <Pressable key={value} onPress={() => void save(String(value))} style={[styles.preset, seconds === value && styles.presetActive]}>
              <Text style={[styles.presetText, seconds === value && styles.presetTextActive]}>{formatRestMs(value * 1000)}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Custom seconds (15–600)" value={draft} onChangeText={setDraft} keyboardType="number-pad" />
        <Button title={saved ? 'Saved' : 'Save default'} variant={saved ? 'secondary' : 'primary'} onPress={() => void save()} left={<Save color={saved ? colors.success : colors.primaryText} size={16} />} />
      </Card>
      <Card style={styles.dangerCard}>
        <View style={styles.heading}><ShieldAlert color={colors.destructive} size={20} /><Text style={[styles.title, { color: colors.destructive }]}>Data management</Text></View>
        <Text style={styles.body}>Delete all sessions, routines and exercises linked to this account. This action is irreversible.</Text>
        <Button title="Delete all data" variant="destructive" loading={remove.isPending} onPress={confirmDelete} left={<Trash2 color={colors.white} size={17} />} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { alignSelf: 'flex-start', marginLeft: -10 },
  cardGap: { gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 17 },
  body: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, backgroundColor: colors.surface, padding: 13 },
  profileIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.textMuted, fontFamily: fonts.monoSemibold, fontSize: 8, letterSpacing: 1 },
  email: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 14, marginTop: 3 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { minWidth: 62, minHeight: 39, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  presetActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  presetText: { color: colors.textMuted, fontFamily: fonts.monoMedium, fontSize: 11 },
  presetTextActive: { color: colors.primary },
  dangerCard: { gap: 14, borderColor: colors.destructive, backgroundColor: colors.destructiveMuted },
});

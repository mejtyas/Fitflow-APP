import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Clock, Edit3, Save, Timer } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ErrorBanner, LoadingScreen, PageHeader, Screen } from '@/components/ui';
import { colors, fonts, radius } from '@/constants/theme';
import { formatDate, formatDurationMs } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { fetchHistoryDetail, updateCompletedSessionTimes } from '@/services/history';
import { errorMessage } from '@/services/shared';

type PickerTarget = 'start' | 'end';

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = typeof id === 'string' ? id : '';
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.historyDetail(sessionId),
    queryFn: () => fetchHistoryDetail(sessionId),
    enabled: Boolean(sessionId),
  });
  const [editing, setEditing] = useState(false);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [endedAt, setEndedAt] = useState<Date | null>(null);
  const effectiveStartedAt = startedAt ?? (query.data ? new Date(query.data.startedAt) : null);
  const effectiveEndedAt = endedAt ?? (query.data ? new Date(query.data.endedAt) : null);
  const [picker, setPicker] = useState<{ target: PickerTarget; mode: 'date' | 'time' } | null>(null);
  const save = useMutation({
    mutationFn: () => updateCompletedSessionTimes(sessionId, effectiveStartedAt!, effectiveEndedAt!),
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
    },
  });

  if (query.isLoading) return <LoadingScreen label="Loading session…" />;
  const data = query.data;
  if (!data || !effectiveStartedAt || !effectiveEndedAt) {
    return <Screen><Button title="Back" compact variant="ghost" onPress={() => router.back()} left={<ArrowLeft color={colors.text} size={18} />} /><ErrorBanner message={errorMessage(query.error, 'Session not found.')} /></Screen>;
  }

  const duration = formatDurationMs(effectiveEndedAt.getTime() - effectiveStartedAt.getTime());
  const onPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === 'dismissed' || !picker || !date) {
      setPicker(null);
      return;
    }
    const current = picker.target === 'start' ? effectiveStartedAt : effectiveEndedAt;
    const next = new Date(current);
    if (picker.mode === 'date') next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    else next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    if (picker.target === 'start') setStartedAt(next);
    else setEndedAt(next);
    if (Platform.OS === 'android' && picker.mode === 'date') setPicker({ ...picker, mode: 'time' });
    else setPicker(null);
  };

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <Button title="History" compact variant="ghost" style={styles.back} onPress={() => router.back()} left={<ArrowLeft color={colors.textMuted} size={18} />} />
      <PageHeader title={data.workoutName} subtitle={`${formatDate(data.startedAt, true)} · ${duration}`} icon={<Clock color={colors.primary} size={21} />} />
      {save.error ? <ErrorBanner message={errorMessage(save.error)} /> : null}
      <Card style={styles.cardGap}>
        <View style={styles.editHeading}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>Session time</Text>
            <Text style={styles.sectionBody}>Adjust incorrect start or finish timestamps.</Text>
          </View>
          <Button title={editing ? 'Cancel' : 'Edit'} compact variant="outline" onPress={() => { if (editing) { setStartedAt(null); setEndedAt(null); } setEditing((value) => !value); }} left={<Edit3 color={colors.text} size={15} />} />
        </View>
        {editing ? (
          <>
            <View style={styles.dateRow}>
              <Pressable onPress={() => setPicker({ target: 'start', mode: 'date' })} style={styles.dateButton}>
                <Text style={styles.dateLabel}>START</Text><Text style={styles.dateValue}>{formatDate(effectiveStartedAt.toISOString(), true)}</Text>
              </Pressable>
              <Pressable onPress={() => setPicker({ target: 'end', mode: 'date' })} style={styles.dateButton}>
                <Text style={styles.dateLabel}>END</Text><Text style={styles.dateValue}>{formatDate(effectiveEndedAt.toISOString(), true)}</Text>
              </Pressable>
            </View>
            <Button title="Save session times" loading={save.isPending} onPress={() => save.mutate()} left={<Save color={colors.primaryText} size={16} />} />
          </>
        ) : null}
        {picker ? (
          <DateTimePicker
            value={picker.target === 'start' ? effectiveStartedAt : effectiveEndedAt}
            mode={Platform.OS === 'ios' ? 'datetime' : picker.mode}
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onPickerChange}
            themeVariant="dark"
          />
        ) : null}
      </Card>
      {data.restPeriods.length ? (
        <Card style={styles.cardGap}>
          <View style={styles.editHeading}><Timer color={colors.primary} size={19} /><Text style={styles.sectionTitle}>Rest timer</Text></View>
          {data.restPeriods.map((period) => {
            const actual = period.endedAt ? new Date(period.endedAt).getTime() - new Date(period.startedAt).getTime() : null;
            return (
              <View key={period.id} style={styles.restRow}>
                <Text style={styles.restTime}>{new Date(period.startedAt).toLocaleTimeString()} – {period.endedAt ? new Date(period.endedAt).toLocaleTimeString() : '—'}</Text>
                <Text style={styles.sectionBody}>{actual !== null ? `Actual ${formatDurationMs(actual, true)}` : 'Incomplete'} · Planned {formatDurationMs(period.plannedTargetMs, true)}</Text>
              </View>
            );
          })}
        </Card>
      ) : null}
      <View style={styles.cardGap}>
        {data.exercises.map((exercise) => (
          <Card key={exercise.id} style={styles.cardGap}>
            <View>
              <Text style={styles.sectionTitle}>{exercise.name}</Text>
              {exercise.loggedOrder !== null ? <Text style={styles.sectionBody}>Logged #{exercise.loggedOrder + 1}{exercise.firstLoggedAt ? ` · ${new Date(exercise.firstLoggedAt).toLocaleTimeString()}` : ''}</Text> : null}
            </View>
            {exercise.sets.length ? exercise.sets.map((set) => (
              <View key={set.setIndex} style={styles.setRow}>
                <View style={styles.setIndex}><Text style={styles.setIndexText}>{set.setIndex + 1}</Text></View>
                <Text style={styles.setValue}>{set.kg ?? 0} kg</Text>
                <Text style={styles.multiply}>×</Text>
                <Text style={styles.setValue}>{set.reps} reps</Text>
                <Text style={styles.volume}>{((set.kg ?? 0) * set.reps).toLocaleString()} kg</Text>
              </View>
            )) : <Text style={styles.sectionBody}>No logged sets.</Text>}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { alignSelf: 'flex-start', marginLeft: -10 },
  cardGap: { gap: 13 },
  editHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 17 },
  sectionBody: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, marginTop: 3 },
  dateRow: { gap: 8 },
  dateButton: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12 },
  dateLabel: { color: colors.primary, fontFamily: fonts.monoSemibold, fontSize: 8, letterSpacing: 1 },
  dateValue: { color: colors.text, fontFamily: fonts.sansMedium, fontSize: 14, marginTop: 4 },
  restRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  restTime: { color: colors.text, fontFamily: fonts.monoMedium, fontSize: 11 },
  setRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: colors.border },
  setIndex: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryMuted },
  setIndexText: { color: colors.primary, fontFamily: fonts.monoSemibold, fontSize: 9 },
  setValue: { color: colors.text, fontFamily: fonts.monoMedium, fontSize: 12 },
  multiply: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 13 },
  volume: { marginLeft: 'auto', color: colors.textMuted, fontFamily: fonts.mono, fontSize: 9 },
});

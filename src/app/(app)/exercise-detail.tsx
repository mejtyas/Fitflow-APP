import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CalendarDays, Dumbbell, Flame, Save, TrendingUp, Trophy } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProgressChart, type ProgressMetric } from '@/components/progress-chart';
import { Button, Card, ErrorBanner, Field, LoadingScreen, PageHeader, Screen, StatTile } from '@/components/ui';
import { colors, fonts, radius } from '@/constants/theme';
import { formatDate, formatNumber } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import type { WarmupSettings } from '@/lib/warmup';
import { useAuth } from '@/providers/auth-provider';
import { fetchExerciseDetail, updateWarmupSettings } from '@/services/exercises';
import { errorMessage } from '@/services/shared';

const metricLabels: Record<ProgressMetric, string> = {
  maxKg: 'Max kg',
  volume: 'Volume',
  estimatedOneRm: 'Est. 1RM',
};

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exerciseId = typeof id === 'string' ? id : '';
  const { user } = useAuth();
  const userId = user!.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.exercise(userId, exerciseId),
    queryFn: () => fetchExerciseDetail(userId, exerciseId),
    enabled: Boolean(exerciseId),
  });
  const [metric, setMetric] = useState<ProgressMetric>('estimatedOneRm');
  const [warmup, setWarmup] = useState<WarmupSettings | null>(null);
  const effectiveWarmup = warmup ?? query.data?.warmupSettings ?? null;
  const saveWarmup = useMutation({
    mutationFn: () => updateWarmupSettings(userId, exerciseId, effectiveWarmup!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.exercise(userId, exerciseId) }),
  });
  if (query.isLoading) return <LoadingScreen label="Loading exercise…" />;
  const data = query.data;
  if (!data || !effectiveWarmup) {
    return (
      <Screen>
        <Button title="Back" compact variant="ghost" onPress={() => router.back()} left={<ArrowLeft color={colors.text} size={18} />} />
        <ErrorBanner message={errorMessage(query.error, 'Exercise not found.')} />
      </Screen>
    );
  }
  const setWarmupNumber = (key: keyof WarmupSettings, raw: string) => {
    const value = Number.parseInt(raw, 10);
    if (Number.isFinite(value)) setWarmup({ ...effectiveWarmup, [key]: value });
  };

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <Button title="Exercises" compact variant="ghost" style={styles.back} onPress={() => router.back()} left={<ArrowLeft color={colors.textMuted} size={18} />} />
      <PageHeader title={data.name} subtitle={data.description ?? 'No exercise notes yet.'} icon={<Dumbbell color={colors.primary} size={21} />} />
      {saveWarmup.error ? <ErrorBanner message={errorMessage(saveWarmup.error)} /> : null}
      <View style={styles.stats}>
        <StatTile label="Sessions" value={data.sessionCount} icon={<CalendarDays color={colors.primary} size={17} />} />
        <StatTile label="Max kg" value={formatNumber(data.maxWeight, 1)} icon={<Trophy color={colors.primary} size={17} />} />
        <StatTile label="Est. 1RM" value={formatNumber(data.bestEstimatedOneRm, 1)} icon={<TrendingUp color={colors.primary} size={17} />} />
      </View>
      <Card style={styles.cardGap}>
        <View>
          <Text style={styles.sectionTitle}>Progress</Text>
          <Text style={styles.sectionBody}>{formatNumber(data.totalVolume)} kg total volume across {data.totalSets} logged sets.</Text>
        </View>
        <View style={styles.segmented}>
          {(Object.keys(metricLabels) as ProgressMetric[]).map((key) => (
            <Pressable key={key} onPress={() => setMetric(key)} style={[styles.segment, metric === key && styles.segmentActive]}>
              <Text style={[styles.segmentText, metric === key && styles.segmentTextActive]}>{metricLabels[key]}</Text>
            </Pressable>
          ))}
        </View>
        <ProgressChart points={data.progress} metric={metric} />
      </Card>
      <Card style={styles.cardGap}>
        <View style={styles.sectionHeading}>
          <Flame color={colors.primary} size={19} />
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>Warm-up formula</Text>
            <Text style={styles.sectionBody}>Calculated from the latest session with a positive top weight.</Text>
          </View>
        </View>
        <View style={styles.fieldGrid}>
          <Field label="Warm-up 1 low %" keyboardType="number-pad" value={String(effectiveWarmup.w1_pct_low)} onChangeText={(value) => setWarmupNumber('w1_pct_low', value)} containerStyle={styles.half} />
          <Field label="Warm-up 1 high %" keyboardType="number-pad" value={String(effectiveWarmup.w1_pct_high)} onChangeText={(value) => setWarmupNumber('w1_pct_high', value)} containerStyle={styles.half} />
          <Field label="Warm-up 1 reps" keyboardType="number-pad" value={String(effectiveWarmup.w1_reps)} onChangeText={(value) => setWarmupNumber('w1_reps', value)} containerStyle={styles.half} />
          <Field label="Warm-up 2 %" keyboardType="number-pad" value={String(effectiveWarmup.w2_pct)} onChangeText={(value) => setWarmupNumber('w2_pct', value)} containerStyle={styles.half} />
          <Field label="Warm-up 2 reps" keyboardType="number-pad" value={String(effectiveWarmup.w2_reps)} onChangeText={(value) => setWarmupNumber('w2_reps', value)} containerStyle={styles.half} />
        </View>
        <Button title="Save warm-up settings" onPress={() => saveWarmup.mutate()} loading={saveWarmup.isPending} left={<Save color={colors.primaryText} size={17} />} />
      </Card>
      <View style={styles.cardGap}>
        <Text style={styles.sectionTitle}>Recent sessions</Text>
        {data.recentSessions.slice(0, 8).map((session) => (
          <Pressable
            key={session.sessionId}
            onPress={() => router.push({ pathname: '/(app)/history-detail', params: { id: session.sessionId } })}
            style={({ pressed }) => [styles.sessionRow, pressed && styles.pressed]}
          >
            <View style={styles.flex}>
              <Text style={styles.sessionName}>{session.workoutName}</Text>
              <Text style={styles.sectionBody}>{formatDate(session.startedAt)}</Text>
            </View>
            <Text style={styles.setsText}>{session.sets.map((set) => `${set.kg ?? 0}×${set.reps}`).join(' · ') || '—'}</Text>
          </Pressable>
        ))}
        {!data.recentSessions.length ? <Text style={styles.sectionBody}>No completed sessions yet.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { alignSelf: 'flex-start', marginLeft: -10 },
  stats: { flexDirection: 'row', gap: 8 },
  cardGap: { gap: 14 },
  sectionTitle: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 17 },
  sectionBody: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, marginTop: 3 },
  segmented: { flexDirection: 'row', padding: 3, backgroundColor: colors.surface, borderRadius: radius.md },
  segment: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.primaryMuted },
  segmentText: { color: colors.textMuted, fontFamily: fonts.sansMedium, fontSize: 11 },
  segmentTextActive: { color: colors.primary },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  half: { width: '48%' },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radius.md, padding: 13 },
  sessionName: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 14 },
  setsText: { maxWidth: '48%', color: colors.primary, fontFamily: fonts.monoMedium, fontSize: 10, textAlign: 'right' },
  pressed: { opacity: 0.72 },
});

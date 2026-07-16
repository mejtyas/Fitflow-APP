import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Activity, BarChart3, CalendarDays, ChevronRight, Flame, Play, Trophy } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ErrorBanner, LoadingScreen, PageHeader, Screen, StatTile } from '@/components/ui';
import { colors, fonts, radius } from '@/constants/theme';
import { formatDate } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/providers/auth-provider';
import { fetchDashboard } from '@/services/dashboard';
import { errorMessage } from '@/services/shared';
import { startWorkout } from '@/services/workouts';

export default function DashboardScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user!.id;
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const query = useQuery({ queryKey: queryKeys.dashboard(userId), queryFn: () => fetchDashboard(userId) });
  const start = useMutation({
    mutationFn: (workoutId: string) => startWorkout(userId, workoutId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
      if ('activeWorkoutMismatch' in result) {
        Alert.alert('Workout already active', 'Resume your current workout before starting another one.');
      }
      router.push({ pathname: '/(app)/active', params: { session: result.sessionId } });
    },
  });

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  }, []);

  if (query.isLoading) return <LoadingScreen label="Loading dashboard…" />;
  const data = query.data;
  if (!data) {
    return (
      <Screen>
        <PageHeader title="Dashboard" />
        <ErrorBanner message={errorMessage(query.error, 'Could not load dashboard.')} />
        <Button title="Retry" onPress={() => void query.refetch()} />
      </Screen>
    );
  }

  const displayName = user?.email?.split('@')[0] ?? 'athlete';
  const activeDateSet = new Set(data.activeDates);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + index);
    return {
      label: date.toLocaleDateString(undefined, { weekday: 'narrow' }),
      active: activeDateSet.has(date.toDateString()),
    };
  });

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()} safeBottom={false}>
      <PageHeader
        title={`${greeting}, ${displayName}`}
        subtitle="Ready for the next session?"
        icon={<Flame color={colors.primary} size={21} />}
      />

      {data.activeSession ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/(app)/active', params: { session: data.activeSession!.id } })}
          style={({ pressed }) => [styles.activeBanner, pressed && styles.pressed]}
        >
          <View style={styles.activePulse} />
          <View style={styles.flex}>
            <Text style={styles.activeKicker}>WORKOUT ACTIVE</Text>
            <Text style={styles.activeName} numberOfLines={1}>{data.activeSession.workoutName}</Text>
          </View>
          <View style={styles.resumeButton}>
            <Text style={styles.resumeText}>Resume</Text>
            <Activity color={colors.primaryText} size={17} />
          </View>
        </Pressable>
      ) : null}

      <Card style={styles.startCard}>
        <View style={styles.startHeading}>
          <View>
            <Text style={styles.cardKicker}>START TRAINING</Text>
            <Text style={styles.cardTitle}>Choose a routine</Text>
          </View>
          <Play color={colors.primary} size={22} />
        </View>
        {data.workouts.length ? (
          <View style={styles.routineList}>
            {data.workouts.map((workout) => {
              const selected = workout.id === selectedWorkoutId;
              return (
                <Pressable
                  key={workout.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedWorkoutId(workout.id)}
                  style={({ pressed }) => [styles.routine, selected && styles.routineSelected, pressed && styles.pressed]}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]} />
                  <Text style={[styles.routineText, selected && styles.routineTextSelected]}>{workout.name}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.muted}>Create a routine from the Workouts tab first.</Text>
        )}
        <Button
          title="Start workout"
          onPress={() => selectedWorkoutId && start.mutate(selectedWorkoutId)}
          disabled={!selectedWorkoutId}
          loading={start.isPending}
          right={<ChevronRight color={colors.primaryText} size={18} />}
        />
        {start.error ? <ErrorBanner message={errorMessage(start.error)} /> : null}
      </Card>

      <View style={styles.statsRow}>
        <StatTile label="This week" value={data.weeklyWorkouts} icon={<CalendarDays color={colors.primary} size={18} />} />
        <StatTile label="Consistency" value={`${data.consistency}%`} icon={<Trophy color={colors.primary} size={18} />} />
        <StatTile label="Movements" value={data.exercisedMovements} icon={<BarChart3 color={colors.primary} size={18} />} />
      </View>

      <Card>
        <View style={styles.weekHeader}>
          <View>
            <Text style={styles.cardKicker}>LAST 7 DAYS</Text>
            <Text style={styles.cardTitle}>Training rhythm</Text>
          </View>
          <Text style={styles.weekCount}>{data.weeklyWorkouts}/7</Text>
        </View>
        <View style={styles.weekBars}>
          {week.map((day, index) => (
            <View key={`${day.label}-${index}`} style={styles.day}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: day.active ? `${55 + ((index * 17) % 40)}%` : '10%' }, day.active && styles.barActive]} />
              </View>
              <Text style={[styles.dayLabel, day.active && styles.dayActive]}>{day.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      {data.lastSession ? (
        <Pressable
          onPress={() => router.push({ pathname: '/(app)/history-detail', params: { id: data.lastSession!.id } })}
          style={({ pressed }) => [styles.lastSession, pressed && styles.pressed]}
        >
          <View style={styles.lastIcon}><Activity color={colors.primary} size={19} /></View>
          <View style={styles.flex}>
            <Text style={styles.cardKicker}>LAST WORKOUT</Text>
            <Text style={styles.activeName}>{data.lastSession.workoutName}</Text>
            <Text style={styles.muted}>{formatDate(data.lastSession.startedAt)}</Text>
          </View>
          <ChevronRight color={colors.textMuted} size={20} />
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  activeBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  activePulse: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  activeKicker: { color: colors.primary, fontFamily: fonts.monoSemibold, fontSize: 9, letterSpacing: 1.3 },
  activeName: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 15, marginTop: 2 },
  resumeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 9, paddingHorizontal: 12 },
  resumeText: { color: colors.primaryText, fontFamily: fonts.sansSemibold, fontSize: 13 },
  startCard: { gap: 15 },
  startHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardKicker: { color: colors.textMuted, fontFamily: fonts.monoSemibold, fontSize: 9, letterSpacing: 1.2 },
  cardTitle: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 18, marginTop: 4 },
  routineList: { gap: 8 },
  routine: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 13, backgroundColor: colors.surface },
  routineSelected: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  radio: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.textMuted },
  radioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  routineText: { color: colors.textMuted, fontFamily: fonts.sansMedium, fontSize: 14 },
  routineTextSelected: { color: colors.text },
  muted: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
  statsRow: { flexDirection: 'row', gap: 8 },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekCount: { color: colors.primary, fontFamily: fonts.monoSemibold, fontSize: 17 },
  weekBars: { height: 125, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 18 },
  day: { flex: 1, alignItems: 'center', gap: 8 },
  barTrack: { height: 94, width: 12, justifyContent: 'flex-end', borderRadius: 6, backgroundColor: colors.surface },
  bar: { width: 12, borderRadius: 6, backgroundColor: colors.border },
  barActive: { backgroundColor: colors.primary },
  dayLabel: { color: colors.textMuted, fontFamily: fonts.monoMedium, fontSize: 9 },
  dayActive: { color: colors.primary },
  lastSession: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  lastIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
});

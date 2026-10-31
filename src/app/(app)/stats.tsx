import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ArrowLeft, BarChart3, Clock, Dumbbell, Trophy } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, EmptyState, ErrorBanner, LoadingScreen, PageHeader, Screen, StatTile } from '@/components/ui';
import { colors, fonts, radius } from '@/constants/theme';
import { formatDurationMs } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { fetchStats } from '@/services/history';
import { errorMessage } from '@/services/shared';

export default function StatsScreen() {
  const router = useRouter();
  const query = useQuery({ queryKey: queryKeys.stats(), queryFn: () => fetchStats() });
  if (query.isLoading) return <LoadingScreen label="Loading stats…" />;
  const data = query.data;
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <Button title="More" compact variant="ghost" style={styles.back} onPress={() => router.back()} left={<ArrowLeft color={colors.textMuted} size={18} />} />
      <PageHeader title="Stats" subtitle="Summary of your completed workout activity." icon={<BarChart3 color={colors.primary} size={21} />} />
      {query.error ? <ErrorBanner message={errorMessage(query.error)} /> : null}
      {data ? (
        <>
          <View style={styles.stats}>
            <StatTile label="Workouts" value={data.totalWorkouts} icon={<Trophy color={colors.primary} size={18} />} />
            <StatTile label="Total time" value={formatDurationMs(data.totalMinutes * 60_000)} icon={<Clock color={colors.primary} size={18} />} />
          </View>
          <Card style={styles.cardGap}>
            <View style={styles.heading}><Dumbbell color={colors.primary} size={19} /><Text style={styles.title}>Most used exercises</Text></View>
            {data.topExercises.length ? data.topExercises.map((exercise, index) => (
              <View key={exercise.id} style={styles.exerciseRow}>
                <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                <Text style={styles.count}>{exercise.count} sessions</Text>
              </View>
            )) : <EmptyState title="No stats yet" body="Complete some workouts to see your top exercises." />}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', marginLeft: -10 },
  stats: { flexDirection: 'row', gap: 9 },
  cardGap: { gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 17 },
  exerciseRow: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: 1, borderTopColor: colors.border },
  rank: { width: 26, height: 26, borderRadius: radius.pill, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: colors.primary, fontFamily: fonts.monoSemibold, fontSize: 9 },
  exerciseName: { flex: 1, color: colors.text, fontFamily: fonts.sansMedium, fontSize: 14 },
  count: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 9 },
});

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Dumbbell, Edit3, ListOrdered, Play, Plus, Trash2 } from 'lucide-react-native';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, EmptyState, ErrorBanner, LoadingScreen, PageHeader, Screen } from '@/components/ui';
import { colors, fonts, radius } from '@/constants/theme';
import { formatDate } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { errorMessage } from '@/services/shared';
import { deleteWorkout, fetchWorkouts, startWorkout } from '@/services/workouts';

export default function WorkoutsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.workouts(), queryFn: () => fetchWorkouts() });
  const remove = useMutation({
    mutationFn: (id: string) => deleteWorkout(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.all }),
  });
  const start = useMutation({
    mutationFn: (id: string) => startWorkout(id),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
      if ('activeWorkoutMismatch' in result) Alert.alert('Workout already active', 'Resuming your current workout.');
      router.push({ pathname: '/(app)/active', params: { session: result.sessionId } });
    },
  });

  const confirmDelete = (id: string, name: string) => {
    Alert.alert('Delete workout?', `${name} will be removed. Your completed history stays intact.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(id) },
    ]);
  };

  if (query.isLoading) return <LoadingScreen label="Loading workouts…" />;
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()} safeBottom={false}>
      <PageHeader
        title="Workouts"
        subtitle="Reusable routines with exercise order and default set counts."
        icon={<ListOrdered color={colors.primary} size={21} />}
        action={<Button title="New" compact onPress={() => router.push('/(app)/workout-editor')} left={<Plus color={colors.primaryText} size={16} />} />}
      />
      {query.error ? <ErrorBanner message={errorMessage(query.error)} /> : null}
      {remove.error ? <ErrorBanner message={errorMessage(remove.error)} /> : null}
      {start.error ? <ErrorBanner message={errorMessage(start.error)} /> : null}
      {query.data?.length ? (
        <View style={styles.list}>
          {query.data.map((workout) => (
            <Card key={workout.id} style={styles.workoutCard}>
              <View style={styles.workoutTop}>
                <View style={styles.workoutIcon}><Dumbbell color={colors.primary} size={20} /></View>
                <View style={styles.flex}>
                  <Text style={styles.workoutName}>{workout.name}</Text>
                  <Text style={styles.preview} numberOfLines={2}>
                    {workout.exerciseNames.length ? workout.exerciseNames.join(' · ') : 'No exercises yet'}
                  </Text>
                </View>
                <View style={styles.countBadge}><Text style={styles.countText}>{workout.exerciseCount} EX</Text></View>
              </View>
              <Text style={styles.lastRun}>{workout.lastRunAt ? `Last run ${formatDate(workout.lastRunAt)}` : 'Never run'}</Text>
              <View style={styles.actions}>
                <Button
                  title="Edit"
                  variant="outline"
                  compact
                  style={styles.action}
                  left={<Edit3 color={colors.text} size={15} />}
                  onPress={() => router.push({ pathname: '/(app)/workout-editor', params: { id: workout.id } })}
                />
                <Button
                  title="Start"
                  compact
                  style={styles.action}
                  loading={start.isPending && start.variables === workout.id}
                  left={<Play color={colors.primaryText} size={15} />}
                  onPress={() => start.mutate(workout.id)}
                />
                <Button
                  title=""
                  accessibilityLabel={`Delete ${workout.name}`}
                  variant="ghost"
                  compact
                  left={<Trash2 color={colors.destructive} size={17} />}
                  onPress={() => confirmDelete(workout.id, workout.name)}
                />
              </View>
            </Card>
          ))}
        </View>
      ) : (
        <EmptyState
          title="No routines yet"
          body="Build your first workout from the exercises in your library."
          action={<Button title="Create workout" compact onPress={() => router.push('/(app)/workout-editor')} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: 12 },
  workoutCard: { gap: 13 },
  workoutTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  workoutIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  workoutName: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 17 },
  preview: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, marginTop: 3 },
  countBadge: { borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 5 },
  countText: { color: colors.textMuted, fontFamily: fonts.monoSemibold, fontSize: 8, letterSpacing: 0.8 },
  lastRun: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 10 },
  actions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  action: { flex: 1 },
});

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, Minus, Plus, Save, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ErrorBanner, Field, LoadingScreen, PageHeader, Screen } from '@/components/ui';
import { colors, fonts, radius } from '@/constants/theme';
import { queryKeys } from '@/lib/query-keys';
import { errorMessage } from '@/services/shared';
import { fetchWorkoutEditor, saveWorkout, type WorkoutExerciseDraft } from '@/services/workouts';

export default function WorkoutEditorScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const workoutId = typeof params.id === 'string' ? params.id : null;
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.workoutEditor(workoutId),
    queryFn: () => fetchWorkoutEditor(workoutId),
  });
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [entriesDraft, setEntriesDraft] = useState<WorkoutExerciseDraft[] | null>(null);
  const name = nameDraft ?? query.data?.workout?.name ?? '';
  const entries = entriesDraft ?? query.data?.workout?.entries ?? [];
  const setName = setNameDraft;
  const setEntries = (updater: WorkoutExerciseDraft[] | ((current: WorkoutExerciseDraft[]) => WorkoutExerciseDraft[])) => {
    setEntriesDraft((current) => {
      const base = current ?? query.data?.workout?.entries ?? [];
      return typeof updater === 'function' ? updater(base) : updater;
    });
  };

  const save = useMutation({
    mutationFn: () => saveWorkout({ workoutId, name, entries }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
      router.back();
    },
  });

  if (query.isLoading) return <LoadingScreen label="Loading workout…" />;
  const exercises = query.data?.exercises ?? [];
  const available = exercises.filter((exercise) => !entries.some((entry) => entry.exerciseId === exercise.id));
  const nameFor = (id: string) => exercises.find((exercise) => exercise.id === id)?.name ?? '?';
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= entries.length) return;
    setEntries((current) => {
      const next = [...current];
      const currentEntry = next[index];
      const targetEntry = next[target];
      if (!currentEntry || !targetEntry) return current;
      next[index] = targetEntry;
      next[target] = currentEntry;
      return next;
    });
  };

  return (
    <Screen>
      <PageHeader
        title={workoutId ? 'Edit workout' : 'New workout'}
        subtitle="Choose exercise order and the set rows created at the start."
        action={<Button title="" accessibilityLabel="Close" compact variant="ghost" left={<X color={colors.text} size={21} />} onPress={() => router.back()} />}
      />
      {query.error ? <ErrorBanner message={errorMessage(query.error)} /> : null}
      {save.error ? <ErrorBanner message={errorMessage(save.error)} /> : null}
      <Card>
        <Field label="Workout name" value={name} onChangeText={setName} placeholder="e.g. Push day" maxLength={100} />
      </Card>
      <Card style={styles.cardGap}>
        <View>
          <Text style={styles.sectionTitle}>Exercises</Text>
          <Text style={styles.sectionBody}>Tap an exercise below to add it to the routine.</Text>
        </View>
        <View style={styles.chips}>
          {available.map((exercise) => (
            <Pressable
              key={exercise.id}
              onPress={() => setEntries((current) => [...current, { exerciseId: exercise.id, defaultSets: 2 }])}
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            >
              <Plus color={colors.primary} size={14} />
              <Text style={styles.chipText}>{exercise.name}</Text>
            </Pressable>
          ))}
          {!exercises.length ? <Text style={styles.sectionBody}>No exercises yet. Add them in the Exercises tab.</Text> : null}
          {exercises.length > 0 && !available.length ? <Text style={styles.sectionBody}>All exercises are included.</Text> : null}
        </View>
      </Card>
      <View style={styles.entries}>
        {entries.map((entry, index) => (
          <Card key={entry.exerciseId} style={styles.entry}>
            <View style={styles.order}><Text style={styles.orderText}>{index + 1}</Text></View>
            <View style={styles.entryName}><Text style={styles.exerciseName}>{nameFor(entry.exerciseId)}</Text></View>
            <View style={styles.setStepper}>
              <Pressable onPress={() => setEntries((current) => current.map((item, i) => i === index ? { ...item, defaultSets: Math.max(1, item.defaultSets - 1) } : item))} style={styles.stepButton}>
                <Minus color={colors.textMuted} size={15} />
              </Pressable>
              <View style={styles.setCount}><Text style={styles.setCountValue}>{entry.defaultSets}</Text><Text style={styles.setCountLabel}>SETS</Text></View>
              <Pressable onPress={() => setEntries((current) => current.map((item, i) => i === index ? { ...item, defaultSets: Math.min(99, item.defaultSets + 1) } : item))} style={styles.stepButton}>
                <Plus color={colors.textMuted} size={15} />
              </Pressable>
            </View>
            <View style={styles.entryActions}>
              <Pressable disabled={index === 0} onPress={() => move(index, -1)} style={styles.iconButton}><ArrowUp color={index === 0 ? colors.border : colors.textMuted} size={17} /></Pressable>
              <Pressable disabled={index === entries.length - 1} onPress={() => move(index, 1)} style={styles.iconButton}><ArrowDown color={index === entries.length - 1 ? colors.border : colors.textMuted} size={17} /></Pressable>
              <Pressable onPress={() => setEntries((current) => current.filter((_, i) => i !== index))} style={styles.iconButton}><Trash2 color={colors.destructive} size={17} /></Pressable>
            </View>
          </Card>
        ))}
      </View>
      <Button title={workoutId ? 'Save workout' : 'Create workout'} onPress={() => save.mutate()} loading={save.isPending} disabled={!name.trim()} left={<Save color={colors.primaryText} size={17} />} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  cardGap: { gap: 14 },
  sectionTitle: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 17 },
  sectionBody: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, marginTop: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 37, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12 },
  chipText: { color: colors.text, fontFamily: fonts.sansMedium, fontSize: 12 },
  entries: { gap: 9 },
  entry: { padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  order: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryMuted, borderWidth: 1, borderColor: colors.primary },
  orderText: { color: colors.primary, fontFamily: fonts.monoSemibold, fontSize: 11 },
  entryName: { flex: 1 },
  exerciseName: { color: colors.text, fontFamily: fonts.sansSemibold, fontSize: 14 },
  setStepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  stepButton: { width: 29, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  setCount: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  setCountValue: { color: colors.text, fontFamily: fonts.monoSemibold, fontSize: 13 },
  setCountLabel: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 6 },
  entryActions: { flexDirection: 'row' },
  iconButton: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
});

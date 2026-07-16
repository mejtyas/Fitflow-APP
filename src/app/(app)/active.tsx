import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Check,
  Clock,
  FileText,
  Flame,
  Pause,
  Play,
  Plus,
  RotateCcw,
  StopCircle,
  Trash2,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ActiveSetInput } from '@/components/active-set-input';
import { Button, Card, ErrorBanner, Field, LoadingScreen, Screen } from '@/components/ui';
import { colors, fonts, radius, shadow } from '@/constants/theme';
import { formatDaysSince, formatDurationMs, formatNumber, formatRestMs } from '@/lib/format';
import { REST_PRESET_SECONDS } from '@/lib/preferences';
import { queryKeys } from '@/lib/query-keys';
import { computeWarmupPair, topSetKgFromPastSessions } from '@/lib/warmup';
import { useActiveWorkout } from '@/hooks/use-active-workout';
import { useAuth } from '@/providers/auth-provider';
import {
  addExerciseToActiveSession,
  fetchActiveWorkout,
  removeExerciseFromActiveSession,
  type ActiveExercise,
  type ActiveWorkoutData,
} from '@/services/active-workout';
import { updateExerciseDescription } from '@/services/exercises';
import { errorMessage } from '@/services/shared';

export default function ActiveWorkoutScreen() {
  const { session } = useLocalSearchParams<{ session?: string }>();
  const { user } = useAuth();
  const userId = user!.id;
  const query = useQuery({
    queryKey: queryKeys.active(userId, session ?? null),
    queryFn: () => fetchActiveWorkout(userId, session ?? null),
    staleTime: Infinity,
  });
  if (query.isLoading) return <LoadingScreen label="Opening active workout…" />;
  if (!query.data) return <NoActiveWorkout error={query.error} />;
  return <ActiveWorkoutContent data={query.data} userId={userId} refetch={() => query.refetch()} />;
}

function NoActiveWorkout({ error }: { error: unknown }) {
  const router = useRouter();
  return (
    <Screen contentStyle={styles.center}>
      {error ? <ErrorBanner message={errorMessage(error)} /> : <Text style={styles.noActive}>There is no active workout.</Text>}
      <Button title="Back to dashboard" onPress={() => router.replace('/(app)/(tabs)')} />
    </Screen>
  );
}

function ActiveWorkoutContent({
  data,
  userId,
  refetch,
}: {
  data: ActiveWorkoutData;
  userId: string;
  refetch: () => Promise<{ data?: ActiveWorkoutData | null }>;
}) {
  useKeepAwake('fitflow-active-workout');
  const router = useRouter();
  const queryClient = useQueryClient();
  const workout = useActiveWorkout(data, userId);
  const [selectedId, setSelectedId] = useState(data.exercises[0]?.id ?? null);
  const [exercisePicker, setExercisePicker] = useState(false);
  const [restPicker, setRestPicker] = useState(false);
  const [customRest, setCustomRest] = useState('150');
  const [noteDraft, setNoteDraft] = useState<string | null>(null);

  const current =
    workout.exercises.find((exercise) => exercise.id === selectedId) ?? workout.exercises[0] ?? null;
  const currentIndex = current ? workout.exercises.findIndex((exercise) => exercise.id === current.id) : -1;
  const remainingExercises = data.availableExercises.filter(
    (option) => !workout.exercises.some((exercise) => exercise.exerciseId === option.id),
  );

  const addExerciseMutation = useMutation({
    mutationFn: async (exerciseId: string) => {
      const orderIndex = current ? current.orderIndex + 1 : workout.exercises.length;
      const shifts = workout.exercises
        .slice(currentIndex + 1)
        .map((exercise) => ({ id: exercise.id, orderIndex: exercise.orderIndex + 1 }));
      if (!(await workout.flushAll())) throw new Error('Could not sync the active workout. Try again online.');
      await addExerciseToActiveSession(data.sessionId, exerciseId, orderIndex, shifts);
    },
    onSuccess: async () => {
      setExercisePicker(false);
      const refreshed = await refetch();
      if (refreshed.data) workout.syncExercises(refreshed.data.exercises);
    },
  });
  const removeExerciseMutation = useMutation({
    mutationFn: async (exercise: ActiveExercise) => {
      if (!(await workout.flushAll())) throw new Error('Could not sync the active workout. Try again online.');
      await removeExerciseFromActiveSession(data.sessionId, exercise.id);
    },
    onSuccess: async () => {
      setSelectedId(null);
      const refreshed = await refetch();
      if (refreshed.data) workout.syncExercises(refreshed.data.exercises);
    },
  });
  const noteMutation = useMutation({
    mutationFn: () => updateExerciseDescription(userId, current!.exerciseId, noteDraft ?? ''),
    onSuccess: async () => {
      setNoteDraft(null);
      const refreshed = await refetch();
      if (refreshed.data) workout.syncExercises(refreshed.data.exercises);
    },
  });

  const finish = () => Alert.alert(
    'Finish workout?',
    'Unfinished rows without valid reps will be removed before this session is saved.',
    [
      { text: 'Keep training', style: 'cancel' },
      {
        text: 'Finish',
        onPress: async () => {
          if (await workout.finish()) {
            await queryClient.invalidateQueries({ queryKey: queryKeys.all });
            router.replace('/(app)/(tabs)');
          }
        },
      },
    ],
  );
  const removeCurrent = () => {
    if (!current) return;
    Alert.alert('Remove exercise?', `${current.name} and its sets will be removed from this active session.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeExerciseMutation.mutate(current) },
    ]);
  };
  const openRestPicker = () => {
    if (!current) return;
    setCustomRest(String(workout.restDurations[current.exerciseId] ?? workout.defaultRestSeconds));
    setRestPicker(true);
  };
  const saveRest = (value = Number.parseInt(customRest, 10)) => {
    if (!current || !Number.isFinite(value)) return;
    workout.setExerciseRestSeconds(current.exerciseId, value);
    setCustomRest(String(Math.min(3600, Math.max(10, value))));
    setRestPicker(false);
  };
  const allErrors = workout.error ?? addExerciseMutation.error ?? removeExerciseMutation.error ?? noteMutation.error;

  return (
    <View style={styles.root}>
      <Screen contentStyle={styles.activeContent}>
        <Card style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.flex}>
              <Text style={styles.sessionKicker}>● IN SESSION</Text>
              <Text style={styles.workoutName}>{data.workoutName}</Text>
            </View>
            <Button title="Finish" compact loading={workout.ending} onPress={finish} left={<Check color={colors.primaryText} size={15} />} />
          </View>
          <View style={styles.sessionStats}>
            <SessionStat label="Elapsed" value={formatDurationMs(workout.elapsedMs, true)} />
            <SessionStat label="Sets done" value={`${workout.summary.setsDone} / ${workout.summary.totalSets}`} />
            <SessionStat label="Volume" value={`${formatNumber(workout.summary.volume)} kg`} />
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${workout.summary.totalSets ? (workout.summary.setsDone / workout.summary.totalSets) * 100 : 0}%` }]} />
          </View>
        </Card>
        {allErrors ? <ErrorBanner message={errorMessage(allErrors)} /> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exerciseRail}>
          {workout.exercises.map((exercise, index) => {
            const done = exercise.sets.filter((set) => set.completed).length;
            const selected = exercise.id === current?.id;
            return (
              <Pressable key={exercise.id} onPress={() => setSelectedId(exercise.id)} style={[styles.exerciseTab, selected && styles.exerciseTabSelected]}>
                <View style={[styles.exerciseNumber, done === exercise.sets.length && exercise.sets.length > 0 && styles.exerciseNumberDone]}>
                  <Text style={[styles.exerciseNumberText, selected && styles.exerciseNumberTextSelected]}>{index + 1}</Text>
                </View>
                <View>
                  <Text style={[styles.exerciseTabName, selected && styles.exerciseTabNameSelected]} numberOfLines={1}>{exercise.name}</Text>
                  <Text style={styles.exerciseTabMeta}>{done}/{exercise.sets.length} sets</Text>
                </View>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setExercisePicker(true)} style={styles.addExerciseTab}><Plus color={colors.primary} size={18} /><Text style={styles.addExerciseText}>Add</Text></Pressable>
        </ScrollView>

        {current ? (
          <Card style={styles.exerciseCard}>
            <View style={styles.exerciseHeading}>
              <View style={styles.flex}>
                <Text style={styles.exerciseTitle}>{current.name}</Text>
                <Text style={styles.exerciseDescription} numberOfLines={2}>{current.description ?? `${current.sets.length} sets · target 8–12 reps`}</Text>
              </View>
              <Button title="" accessibilityLabel={`Remove ${current.name}`} compact variant="ghost" onPress={removeCurrent} left={<Trash2 color={colors.destructive} size={18} />} />
            </View>
            <View style={styles.contextChips}>
              <WarmupChip exercise={current} />
              {current.pastSessions[0] ? (
                <View style={styles.contextChip}>
                  <RotateCcw color={colors.textMuted} size={14} />
                  <View style={styles.flex}>
                    <Text style={styles.contextLabel}>{formatDaysSince(current.pastSessions[0].endedAt)}</Text>
                    <Text style={styles.contextValue} numberOfLines={1}>{current.pastSessions[0].sets.map((set) => `${set.kg ?? 0}×${set.reps}`).join(' · ') || '—'}</Text>
                  </View>
                </View>
              ) : null}
            </View>
            <View style={styles.exerciseActions}>
              <Button title={`Rest ${formatRestMs((workout.restDurations[current.exerciseId] ?? workout.defaultRestSeconds) * 1000)}`} compact variant="secondary" onPress={openRestPicker} left={<Clock color={colors.textMuted} size={15} />} />
              <Button title={current.description ? 'Edit note' : 'Add note'} compact variant="secondary" onPress={() => setNoteDraft(current.description ?? '')} left={<FileText color={colors.textMuted} size={15} />} />
            </View>
            <View style={styles.sets}>
              {[...current.sets].sort((a, b) => a.setIndex - b.setIndex).map((set) => {
                const previous = current.pastSessions[0]?.sets[set.setIndex];
                return (
                  <View key={set.id} style={[styles.setCard, set.completed && styles.setCardDone]}>
                    <View style={styles.setTop}>
                      <View style={[styles.setNumber, set.completed && styles.setNumberDone]}><Text style={[styles.setNumberText, set.completed && styles.setNumberTextDone]}>{set.setIndex + 1}</Text></View>
                      <Text style={styles.previous}>Previous {previous ? `${previous.kg ?? 0} × ${previous.reps}` : '—'}</Text>
                      <Text style={[styles.rpe, set.completed && styles.rpeDone]}>RPE {set.completed ? '8' : '—'}</Text>
                    </View>
                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}><Text style={styles.inputLabel}>WEIGHT (KG)</Text><ActiveSetInput field="kg" value={set.kg} completed={set.completed} onChange={(value) => workout.changeSetValue(current, set.id, 'kg', value)} onBlur={() => workout.blurSetValue(current.exerciseId, set.id, 'kg')} /></View>
                      <View style={styles.inputGroup}><Text style={styles.inputLabel}>REPS</Text><ActiveSetInput field="reps" value={set.reps} completed={set.completed} onChange={(value) => workout.changeSetValue(current, set.id, 'reps', value)} onBlur={() => workout.blurSetValue(current.exerciseId, set.id, 'reps')} /></View>
                      <Pressable accessibilityLabel={set.completed ? 'Mark set incomplete' : 'Complete set'} onPress={() => workout.completeSet(current.exerciseId, set.id)} style={[styles.completeButton, set.completed && styles.completeButtonDone]}>
                        <Check color={set.completed ? colors.primaryText : colors.textMuted} size={19} />
                      </Pressable>
                      <Pressable accessibilityLabel="Delete set" onPress={() => Alert.alert('Delete set?', 'This set row will be removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void workout.removeSet(set.id) }])} style={styles.deleteSetButton}>
                        <Trash2 color={colors.destructive} size={17} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
            <Button title="Add set" variant="outline" compact onPress={() => void workout.appendSet(current.id)} left={<Plus color={colors.text} size={16} />} />
          </Card>
        ) : (
          <Card style={styles.center}><Text style={styles.noActive}>Add an exercise to begin logging sets.</Text></Card>
        )}
      </Screen>

      <RestDock
        rest={workout.rest}
        onStart={() => current && void workout.startRestForExercise(current.exerciseId)}
        onPauseResume={() => void workout.applyRest({ kind: workout.rest.paused ? 'resume' : 'pause' })}
        onStop={() => void workout.applyRest({ kind: 'stop' })}
      />

      <PickerModal visible={exercisePicker} title="Add exercise" onClose={() => setExercisePicker(false)}>
        {remainingExercises.map((option) => (
          <Button key={option.id} title={option.name} variant="secondary" loading={addExerciseMutation.isPending && addExerciseMutation.variables === option.id} onPress={() => addExerciseMutation.mutate(option.id)} />
        ))}
        {!remainingExercises.length ? <Text style={styles.modalEmpty}>All library exercises are already in this session.</Text> : null}
      </PickerModal>

      <PickerModal visible={restPicker} title={`Rest for ${current?.name ?? 'exercise'}`} onClose={() => setRestPicker(false)}>
        <View style={styles.presetGrid}>
          {REST_PRESET_SECONDS.map((seconds) => (
            <Button key={seconds} title={formatRestMs(seconds * 1000)} compact variant={Number(customRest) === seconds ? 'primary' : 'outline'} style={styles.presetButton} onPress={() => { setCustomRest(String(seconds)); saveRest(seconds); }} />
          ))}
        </View>
        <Field label="Custom seconds (10–3600)" value={customRest} keyboardType="number-pad" onChangeText={setCustomRest} />
        <Button title="Set rest duration" onPress={() => saveRest()} />
      </PickerModal>

      <PickerModal visible={noteDraft !== null} title={`Note for ${current?.name ?? 'exercise'}`} onClose={() => setNoteDraft(null)}>
        <Field multiline value={noteDraft ?? ''} onChangeText={setNoteDraft} maxLength={2000} placeholder="Machine settings, form cues…" />
        <Button title="Save note" loading={noteMutation.isPending} onPress={() => noteMutation.mutate()} />
      </PickerModal>
    </View>
  );
}

function SessionStat({ label, value }: { label: string; value: string }) {
  return <View style={styles.sessionStat}><Text style={styles.sessionStatLabel}>{label}</Text><Text style={styles.sessionStatValue}>{value}</Text></View>;
}

function WarmupChip({ exercise }: { exercise: ActiveExercise }) {
  const topKg = topSetKgFromPastSessions(exercise.pastSessions);
  const pair = topKg ? computeWarmupPair(topKg, exercise.warmupSettings) : null;
  if (!pair) return null;
  return (
    <View style={[styles.contextChip, styles.warmupChip]}>
      <Flame color={colors.primary} size={14} />
      <View><Text style={[styles.contextLabel, { color: colors.primary }]}>WARM-UP</Text><Text style={styles.contextValue}>{pair.w1.kg}×{pair.w1.reps} · {pair.w2.kg}×{pair.w2.reps}</Text></View>
    </View>
  );
}

function RestDock({ rest, onStart, onPauseResume, onStop }: { rest: ActiveWorkoutData['rest']; onStart: () => void; onPauseResume: () => void; onStop: () => void }) {
  const progress = rest.targetMs ? Math.min(1, rest.remainingMs / rest.targetMs) : 0;
  return (
    <View style={styles.restDock}>
      <View style={styles.restCircle}><StopCircle color={colors.primary} size={17} /></View>
      <View style={styles.flex}><Text style={styles.restLabel}>{rest.targetMs ? (rest.paused ? 'REST PAUSED' : 'RESTING') : 'REST TIMER'}</Text><Text style={styles.restValue}>{rest.targetMs ? formatRestMs(rest.remainingMs) : '0:00'}</Text></View>
      <View style={styles.restProgress}><View style={[styles.restProgressFill, { width: `${progress * 100}%` }]} /></View>
      <Pressable onPress={rest.targetMs ? onPauseResume : onStart} style={styles.dockButton}>{!rest.targetMs || rest.paused ? <Play color={colors.text} size={19} /> : <Pause color={colors.text} size={19} />}</Pressable>
      <Pressable onPress={onStop} disabled={!rest.targetMs} style={[styles.dockButton, styles.dockStop, !rest.targetMs && { opacity: 0.4 }]}><Check color={colors.primaryText} size={19} /></Pressable>
    </View>
  );
}

function PickerModal({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{title}</Text><Button title="" accessibilityLabel="Close" compact variant="ghost" onPress={onClose} left={<X color={colors.text} size={21} />} /></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center', gap: 14 },
  noActive: { color: colors.textMuted, fontFamily: fonts.sansMedium, fontSize: 15, textAlign: 'center' },
  activeContent: { paddingBottom: 130 },
  headerCard: { gap: 15 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sessionKicker: { color: colors.primary, fontFamily: fonts.monoSemibold, fontSize: 9, letterSpacing: 1.4 },
  workoutName: { color: colors.text, fontFamily: fonts.sansBold, fontSize: 24, marginTop: 4 },
  sessionStats: { flexDirection: 'row', gap: 20 },
  sessionStat: { gap: 3 },
  sessionStatLabel: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  sessionStatValue: { color: colors.text, fontFamily: fonts.monoSemibold, fontSize: 14 },
  progressTrack: { height: 4, backgroundColor: colors.surface, borderRadius: 2, overflow: 'hidden' },
  progressBar: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
  exerciseRail: { gap: 8 },
  exerciseTab: { width: 150, minHeight: 59, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card },
  exerciseTabSelected: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  exerciseNumber: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  exerciseNumberDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  exerciseNumberText: { color: colors.textMuted, fontFamily: fonts.monoSemibold, fontSize: 10 },
  exerciseNumberTextSelected: { color: colors.primary },
  exerciseTabName: { maxWidth: 92, color: colors.textMuted, fontFamily: fonts.sansSemibold, fontSize: 12 },
  exerciseTabNameSelected: { color: colors.text },
  exerciseTabMeta: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 8, marginTop: 3 },
  addExerciseTab: { width: 70, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md },
  addExerciseText: { color: colors.primary, fontFamily: fonts.monoSemibold, fontSize: 8 },
  exerciseCard: { gap: 14 },
  exerciseHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  exerciseTitle: { color: colors.text, fontFamily: fonts.sansBold, fontSize: 22 },
  exerciseDescription: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, marginTop: 3 },
  contextChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  contextChip: { minWidth: 130, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.sm, padding: 9 },
  warmupChip: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  contextLabel: { color: colors.textMuted, fontFamily: fonts.monoSemibold, fontSize: 7, letterSpacing: 0.8 },
  contextValue: { color: colors.text, fontFamily: fonts.monoMedium, fontSize: 9, marginTop: 2 },
  exerciseActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sets: { gap: 9 },
  setCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, padding: 11, gap: 9 },
  setCardDone: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  setTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  setNumber: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  setNumberDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  setNumberText: { color: colors.textMuted, fontFamily: fonts.monoSemibold, fontSize: 9 },
  setNumberTextDone: { color: colors.primaryText },
  previous: { flex: 1, color: colors.textMuted, fontFamily: fonts.mono, fontSize: 9 },
  rpe: { color: colors.textMuted, fontFamily: fonts.monoSemibold, fontSize: 8 },
  rpeDone: { color: colors.primary },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  inputGroup: { flex: 1, gap: 5 },
  inputLabel: { color: colors.textMuted, fontFamily: fonts.monoSemibold, fontSize: 7, letterSpacing: 0.7, textAlign: 'center' },
  completeButton: { width: 45, height: 45, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  completeButtonDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  deleteSetButton: { width: 38, height: 45, alignItems: 'center', justifyContent: 'center' },
  restDock: { position: 'absolute', left: 14, right: 14, bottom: 12, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, ...shadow },
  restCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  restLabel: { color: colors.primary, fontFamily: fonts.monoSemibold, fontSize: 7, letterSpacing: 1 },
  restValue: { color: colors.text, fontFamily: fonts.monoSemibold, fontSize: 20, marginTop: 2 },
  restProgress: { position: 'absolute', left: 12, right: 12, bottom: 5, height: 2, backgroundColor: colors.surface },
  restProgressFill: { height: 2, backgroundColor: colors.primary },
  dockButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dockStop: { backgroundColor: colors.primary },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  modalSheet: { maxHeight: '80%', backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 18 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { color: colors.text, fontFamily: fonts.sansBold, fontSize: 20 },
  modalContent: { gap: 10, paddingBottom: 20 },
  modalEmpty: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetButton: { minWidth: 80, flexGrow: 1 },
});

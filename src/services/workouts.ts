import type { Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { isValidUuid, sanitizeName } from '@/lib/validation';
import { FitFlowError, requireData, throwOnError } from '@/services/shared';

export type WorkoutListItem = {
  id: string;
  name: string;
  exerciseNames: string[];
  exerciseCount: number;
  lastRunAt: string | null;
};

export type WorkoutExerciseDraft = {
  exerciseId: string;
  defaultSets: number;
};

export async function fetchWorkouts(userId: string): Promise<WorkoutListItem[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select(`id, name, workout_exercises(exercise_id, order_index, default_sets, exercises(name)), workout_sessions(started_at, ended_at)`)
    .eq('user_id', userId)
    .order('name');
  throwOnError(error);
  return (data ?? []).map((workout) => {
    const entries = [...(workout.workout_exercises ?? [])].sort(
      (a, b) => a.order_index - b.order_index,
    );
    const sessions = (workout.workout_sessions ?? [])
      .filter((session) => session.ended_at)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    return {
      id: workout.id,
      name: workout.name,
      exerciseNames: entries.map((entry) => {
        const relation = Array.isArray(entry.exercises) ? entry.exercises[0] : entry.exercises;
        return relation?.name ?? '?';
      }),
      exerciseCount: entries.length,
      lastRunAt: sessions[0]?.started_at ?? null,
    };
  });
}

export type WorkoutEditorData = {
  workout: { id: string; name: string; entries: WorkoutExerciseDraft[] } | null;
  exercises: { id: string; name: string }[];
};

export async function fetchWorkoutEditor(userId: string, workoutId: string | null): Promise<WorkoutEditorData> {
  const exercisesPromise = supabase
    .from('exercises')
    .select('id, name')
    .eq('user_id', userId)
    .order('name');
  const workoutPromise = workoutId
    ? supabase
        .from('workouts')
        .select('id, name, workout_exercises(exercise_id, order_index, default_sets)')
        .eq('id', workoutId)
        .eq('user_id', userId)
        .single()
    : Promise.resolve({ data: null, error: null });
  const [exerciseResult, workoutResult] = await Promise.all([exercisesPromise, workoutPromise]);
  throwOnError(exerciseResult.error);
  throwOnError(workoutResult.error);
  return {
    exercises: exerciseResult.data ?? [],
    workout: workoutResult.data
      ? {
          id: workoutResult.data.id,
          name: workoutResult.data.name,
          entries: [...(workoutResult.data.workout_exercises ?? [])]
            .sort((a, b) => a.order_index - b.order_index)
            .map((entry) => ({ exerciseId: entry.exercise_id, defaultSets: entry.default_sets })),
        }
      : null,
  };
}

export function normalizeEntries(entries: WorkoutExerciseDraft[]) {
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    if (!isValidUuid(entry.exerciseId) || seen.has(entry.exerciseId)) return [];
    seen.add(entry.exerciseId);
    return [{
      exercise_id: entry.exerciseId,
      order_index: seen.size - 1,
      default_sets: Math.min(99, Math.max(1, Math.round(entry.defaultSets))),
    }];
  });
}

async function replaceWorkoutExercises(workoutId: string, entries: WorkoutExerciseDraft[]) {
  const payload = normalizeEntries(entries);
  const { error } = await supabase.rpc('replace_workout_exercises', {
    p_workout_id: workoutId,
    p_exercises: payload as Json,
  });
  throwOnError(error);
}

export async function saveWorkout(
  userId: string,
  input: { workoutId?: string | null; name: string; entries: WorkoutExerciseDraft[] },
) {
  const name = sanitizeName(input.name);
  if (!name) throw new FitFlowError('Workout name is required.');
  if (input.workoutId) {
    const { error } = await supabase
      .from('workouts')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', input.workoutId)
      .eq('user_id', userId);
    throwOnError(error);
    await replaceWorkoutExercises(input.workoutId, input.entries);
    return input.workoutId;
  }
  const { data, error } = await supabase
    .from('workouts')
    .insert({ user_id: userId, name })
    .select('id')
    .single();
  const workout = requireData(data, error, 'Could not create workout.');
  try {
    await replaceWorkoutExercises(workout.id, input.entries);
    return workout.id;
  } catch (cause) {
    await supabase.from('workouts').delete().eq('id', workout.id).eq('user_id', userId);
    throw cause;
  }
}

export async function deleteWorkout(userId: string, workoutId: string) {
  const { error } = await supabase.from('workouts').delete().eq('id', workoutId).eq('user_id', userId);
  throwOnError(error);
}

export type StartWorkoutResult =
  | { sessionId: string; resumed: boolean }
  | { sessionId: string; resumed: true; activeWorkoutMismatch: true };

export async function startWorkout(userId: string, workoutId: string | null): Promise<StartWorkoutResult> {
  if (workoutId !== null && !isValidUuid(workoutId)) throw new FitFlowError('Invalid workout.');
  const existingResult = await supabase
    .from('workout_sessions')
    .select('id, workout_id')
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  throwOnError(existingResult.error);
  if (existingResult.data) {
    return existingResult.data.workout_id === workoutId
      ? { sessionId: existingResult.data.id, resumed: true }
      : { sessionId: existingResult.data.id, resumed: true, activeWorkoutMismatch: true };
  }

  const sessionResult = await supabase
    .from('workout_sessions')
    .insert({ user_id: userId, workout_id: workoutId, started_at: new Date().toISOString() })
    .select('id')
    .single();
  const session = requireData(sessionResult.data, sessionResult.error, 'Could not start workout.');

  try {
    if (!workoutId) return { sessionId: session.id, resumed: false };
    const templateResult = await supabase
      .from('workout_exercises')
      .select('exercise_id, order_index, default_sets')
      .eq('workout_id', workoutId)
      .order('order_index');
    throwOnError(templateResult.error);
    const template = templateResult.data ?? [];
    if (template.length === 0) return { sessionId: session.id, resumed: false };

    const sessionExerciseResult = await supabase
      .from('session_exercises')
      .insert(
        template.map((entry, index) => ({
          workout_session_id: session.id,
          exercise_id: entry.exercise_id,
          order_index: index,
        })),
      )
      .select('id, order_index');
    const inserted = requireData(
      sessionExerciseResult.data,
      sessionExerciseResult.error,
      'Could not prepare workout exercises.',
    ).sort((a, b) => a.order_index - b.order_index);

    const setRows = inserted.flatMap((sessionExercise, index) =>
      Array.from({ length: template[index]?.default_sets ?? 2 }, (_, setIndex) => ({
        session_exercise_id: sessionExercise.id,
        set_index: setIndex,
        kg: null,
        reps: null,
        completed: false,
      })),
    );
    if (setRows.length > 0) {
      const { error } = await supabase.from('session_sets').insert(setRows);
      throwOnError(error);
    }
    return { sessionId: session.id, resumed: false };
  } catch (cause) {
    await supabase.from('workout_sessions').delete().eq('id', session.id).eq('user_id', userId);
    throw cause;
  }
}

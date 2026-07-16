import type { Json } from '@/lib/database.types';
import { estimatedOneRmEpley, sessionMetrics } from '@/lib/metrics';
import { supabase } from '@/lib/supabase';
import { isLoggedSetReps, sanitizeDescription, sanitizeName } from '@/lib/validation';
import { parseWarmupSettings, warmupSettingsToJson, type WarmupSettings } from '@/lib/warmup';
import { FitFlowError, requireData, throwOnError } from '@/services/shared';
import { workoutNameFromRelation } from '@/lib/format';

export type ExerciseListItem = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
};

export async function fetchExercises(userId: string): Promise<ExerciseListItem[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, description, created_at')
    .eq('user_id', userId)
    .order('name');
  throwOnError(error);
  return (data ?? []).map((row) => ({ ...row, createdAt: row.created_at }));
}

export async function createExercise(userId: string, nameRaw: string, descriptionRaw: string) {
  const name = sanitizeName(nameRaw);
  if (!name) throw new FitFlowError('Exercise name is required.');
  const { error } = await supabase.from('exercises').insert({
    user_id: userId,
    name,
    description: sanitizeDescription(descriptionRaw),
  });
  throwOnError(error);
}

export async function updateExercise(userId: string, id: string, nameRaw: string, descriptionRaw: string) {
  const name = sanitizeName(nameRaw);
  if (!name) throw new FitFlowError('Exercise name is required.');
  const { error } = await supabase
    .from('exercises')
    .update({ name, description: sanitizeDescription(descriptionRaw) })
    .eq('id', id)
    .eq('user_id', userId);
  throwOnError(error);
}

export async function updateExerciseDescription(userId: string, id: string, descriptionRaw: string) {
  const { error } = await supabase
    .from('exercises')
    .update({ description: sanitizeDescription(descriptionRaw) })
    .eq('id', id)
    .eq('user_id', userId);
  throwOnError(error);
}

export async function updateWarmupSettings(userId: string, id: string, settings: WarmupSettings) {
  const normalized = parseWarmupSettings(warmupSettingsToJson(settings));
  const { error } = await supabase
    .from('exercises')
    .update({ warmup_settings: warmupSettingsToJson(normalized) })
    .eq('id', id)
    .eq('user_id', userId);
  throwOnError(error);
}

export async function deleteExercise(userId: string, id: string) {
  const { error } = await supabase.from('exercises').delete().eq('id', id).eq('user_id', userId);
  throwOnError(error);
}

export type ExerciseProgressPoint = {
  sessionId: string;
  startedAt: string;
  workoutName: string;
  maxKg: number;
  volume: number;
  estimatedOneRm: number;
};

export type ExerciseDetail = {
  id: string;
  name: string;
  description: string | null;
  warmupSettings: WarmupSettings;
  sessionCount: number;
  totalSets: number;
  maxWeight: number;
  totalVolume: number;
  bestEstimatedOneRm: number;
  progress: ExerciseProgressPoint[];
  recentSessions: {
    sessionId: string;
    startedAt: string;
    workoutName: string;
    sets: { kg: number | null; reps: number | null; setIndex: number }[];
  }[];
};

export async function fetchExerciseDetail(userId: string, id: string): Promise<ExerciseDetail> {
  const [exerciseResult, historyResult] = await Promise.all([
    supabase.from('exercises').select('*').eq('id', id).eq('user_id', userId).single(),
    supabase
      .from('session_exercises')
      .select(`id, workout_session_id, workout_sessions!inner(id, started_at, ended_at, user_id, workouts(name)), session_sets(id, set_index, kg, reps)`)
      .eq('exercise_id', id)
      .eq('workout_sessions.user_id', userId)
      .not('workout_sessions.ended_at', 'is', null)
      .order('workout_sessions(started_at)', { ascending: false }),
  ]);
  const exercise = requireData(exerciseResult.data, exerciseResult.error, 'Exercise not found.');
  throwOnError(historyResult.error);

  const recentSessions = (historyResult.data ?? []).map((row) => {
    const sessionRelation = row.workout_sessions;
    const session = Array.isArray(sessionRelation) ? sessionRelation[0] : sessionRelation;
    const sets = [...(row.session_sets ?? [])]
      .filter((set) => isLoggedSetReps(set.reps))
      .sort((a, b) => a.set_index - b.set_index)
      .map((set) => ({ kg: set.kg, reps: set.reps, setIndex: set.set_index }));
    return {
      sessionId: session?.id ?? row.workout_session_id,
      startedAt: session?.started_at ?? '',
      workoutName: workoutNameFromRelation(session?.workouts),
      sets,
    };
  });

  const progress = recentSessions
    .map((session) => ({
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      workoutName: session.workoutName,
      ...sessionMetrics(session.sets),
    }))
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  const allSets = recentSessions.flatMap((session) => session.sets);

  return {
    id: exercise.id,
    name: exercise.name,
    description: exercise.description,
    warmupSettings: parseWarmupSettings(exercise.warmup_settings as Json | null),
    sessionCount: recentSessions.length,
    totalSets: allSets.length,
    maxWeight: Math.max(0, ...allSets.map((set) => set.kg ?? 0)),
    totalVolume: allSets.reduce((sum, set) => sum + (set.kg ?? 0) * (set.reps ?? 0), 0),
    bestEstimatedOneRm: Math.max(0, ...allSets.map((set) => estimatedOneRmEpley(set.kg ?? 0, set.reps ?? 0) ?? 0)),
    progress,
    recentSessions,
  };
}

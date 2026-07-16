import type { Json } from '@/lib/database.types';
import { workoutNameFromRelation } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { clampKg, clampReps, isLoggedSetReps } from '@/lib/validation';
import { parseWarmupSettings, type WarmupSettings } from '@/lib/warmup';
import { FitFlowError, requireData, throwOnError } from '@/services/shared';

export type ActiveSet = {
  id: string;
  setIndex: number;
  kg: number | null;
  reps: number | null;
  completed: boolean;
};

export type PastSessionPerformance = {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  workoutName: string;
  sets: { kg: number | null; reps: number | null }[];
};

export type ActiveExercise = {
  id: string;
  orderIndex: number;
  exerciseId: string;
  name: string;
  description: string | null;
  sets: ActiveSet[];
  pastSessions: PastSessionPerformance[];
  warmupSettings: WarmupSettings;
};

export type ExerciseOption = {
  id: string;
  name: string;
  description: string | null;
  warmupSettings: WarmupSettings;
};

export type RestTimerState = {
  targetMs: number | null;
  remainingMs: number;
  paused: boolean;
  endsAt: string | null;
};

export type ActiveWorkoutData = {
  sessionId: string;
  startedAt: string;
  workoutName: string;
  exercises: ActiveExercise[];
  availableExercises: ExerciseOption[];
  rest: RestTimerState;
};

type RestRow = {
  rest_target_ms: number | null;
  rest_ends_at: string | null;
  rest_paused_remaining_ms: number | null;
};

const IDLE_REST: RestTimerState = {
  targetMs: null,
  remainingMs: 0,
  paused: false,
  endsAt: null,
};

function mapRestRow(row: RestRow): RestTimerState {
  if (row.rest_target_ms === null) return { ...IDLE_REST };
  if (row.rest_paused_remaining_ms !== null && !row.rest_ends_at) {
    return {
      targetMs: row.rest_target_ms,
      remainingMs: Math.max(0, row.rest_paused_remaining_ms),
      paused: true,
      endsAt: null,
    };
  }
  if (row.rest_ends_at) {
    return {
      targetMs: row.rest_target_ms,
      remainingMs: Math.max(0, new Date(row.rest_ends_at).getTime() - Date.now()),
      paused: false,
      endsAt: row.rest_ends_at,
    };
  }
  return { ...IDLE_REST };
}

async function sealOpenRestPeriods(sessionId: string, endedAt = new Date().toISOString()) {
  const { error } = await supabase
    .from('session_rest_periods')
    .update({ ended_at: endedAt })
    .eq('workout_session_id', sessionId)
    .is('ended_at', null);
  throwOnError(error);
}

async function clearExpiredRest(userId: string, sessionId: string, row: RestRow) {
  if (!row.rest_ends_at || new Date(row.rest_ends_at).getTime() > Date.now()) return mapRestRow(row);
  await sealOpenRestPeriods(sessionId, row.rest_ends_at);
  const result = await supabase
    .from('workout_sessions')
    .update({ rest_target_ms: null, rest_ends_at: null, rest_paused_remaining_ms: null })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .is('ended_at', null);
  throwOnError(result.error);
  return { ...IDLE_REST };
}

export async function fetchActiveWorkout(
  userId: string,
  selectedSessionId?: string | null,
): Promise<ActiveWorkoutData | null> {
  let sessionQuery = supabase
    .from('workout_sessions')
    .select('id, started_at, workouts(name), rest_target_ms, rest_ends_at, rest_paused_remaining_ms')
    .eq('user_id', userId)
    .is('ended_at', null);
  sessionQuery = selectedSessionId
    ? sessionQuery.eq('id', selectedSessionId)
    : sessionQuery.order('started_at', { ascending: false }).limit(1);
  const sessionResult = await sessionQuery.maybeSingle();
  throwOnError(sessionResult.error);
  const session = sessionResult.data;
  if (!session) return null;

  const [sessionExercisesResult, exerciseOptionsResult] = await Promise.all([
    supabase
      .from('session_exercises')
      .select('id, order_index, exercise_id, exercises(name, description), session_sets(id, set_index, kg, reps, completed)')
      .eq('workout_session_id', session.id)
      .order('order_index'),
    supabase
      .from('exercises')
      .select('id, name, description, warmup_settings')
      .eq('user_id', userId)
      .order('name'),
  ]);
  throwOnError(sessionExercisesResult.error);
  throwOnError(exerciseOptionsResult.error);
  const optionRows = exerciseOptionsResult.data ?? [];
  const settings = new Map(
    optionRows.map((row) => [row.id, parseWarmupSettings(row.warmup_settings as Json | null)]),
  );
  const exerciseIds = [...new Set((sessionExercisesResult.data ?? []).map((row) => row.exercise_id))];
  const pastResult = exerciseIds.length
    ? await supabase
        .from('session_exercises')
        .select(`exercise_id, workout_session_id, workout_sessions!inner(id, user_id, started_at, ended_at, workouts(name)), session_sets(set_index, kg, reps)`)
        .in('exercise_id', exerciseIds)
        .eq('workout_sessions.user_id', userId)
        .neq('workout_session_id', session.id)
        .not('workout_sessions.ended_at', 'is', null)
        .order('workout_sessions(ended_at)', { ascending: false })
    : { data: [], error: null };
  throwOnError(pastResult.error);

  const pastByExercise = new Map<string, PastSessionPerformance[]>();
  for (const row of pastResult.data ?? []) {
    const existing = pastByExercise.get(row.exercise_id) ?? [];
    if (existing.length >= 6) continue;
    const relation = row.workout_sessions;
    const pastSession = Array.isArray(relation) ? relation[0] : relation;
    if (!pastSession?.ended_at) continue;
    existing.push({
      sessionId: pastSession.id,
      startedAt: pastSession.started_at,
      endedAt: pastSession.ended_at,
      workoutName: workoutNameFromRelation(pastSession.workouts),
      sets: [...(row.session_sets ?? [])]
        .filter((set) => isLoggedSetReps(set.reps))
        .sort((a, b) => a.set_index - b.set_index)
        .map((set) => ({ kg: set.kg, reps: set.reps })),
    });
    pastByExercise.set(row.exercise_id, existing);
  }

  const rest = await clearExpiredRest(userId, session.id, {
    rest_target_ms: session.rest_target_ms,
    rest_ends_at: session.rest_ends_at,
    rest_paused_remaining_ms: session.rest_paused_remaining_ms,
  });

  return {
    sessionId: session.id,
    startedAt: session.started_at,
    workoutName: workoutNameFromRelation(session.workouts, 'Unnamed Session'),
    exercises: (sessionExercisesResult.data ?? []).map((row) => ({
      id: row.id,
      orderIndex: row.order_index,
      exerciseId: row.exercise_id,
      name: workoutNameFromRelation(row.exercises, '?'),
      description: (() => {
        const relation = Array.isArray(row.exercises) ? row.exercises[0] : row.exercises;
        return relation?.description ?? null;
      })(),
      sets: [...(row.session_sets ?? [])]
        .sort((a, b) => a.set_index - b.set_index)
        .map((set) => ({
          id: set.id,
          setIndex: set.set_index,
          kg: set.kg,
          reps: set.reps,
          completed: set.completed === true,
        })),
      pastSessions: pastByExercise.get(row.exercise_id) ?? [],
      warmupSettings: settings.get(row.exercise_id) ?? parseWarmupSettings(null),
    })),
    availableExercises: optionRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      warmupSettings: settings.get(row.id) ?? parseWarmupSettings(null),
    })),
    rest,
  };
}

export type SetPatch = {
  kg?: number | null;
  reps?: number | null;
  completed?: boolean;
};

export async function persistActiveSet(setId: string, patch: SetPatch) {
  const payload: SetPatch = {};
  if (patch.kg !== undefined) payload.kg = clampKg(patch.kg) ?? null;
  if (patch.reps !== undefined) payload.reps = clampReps(patch.reps) ?? null;
  if (patch.completed !== undefined) payload.completed = patch.completed;
  if (Object.keys(payload).length === 0) return;
  const result = await supabase
    .from('session_sets')
    .update(payload)
    .eq('id', setId)
    .select('session_exercise_id')
    .single();
  const row = requireData(result.data, result.error, 'Set not found.');
  if (patch.kg !== undefined || patch.reps !== undefined) {
    const { error } = await supabase.rpc('record_session_exercise_first_log', {
      p_session_exercise_id: row.session_exercise_id,
    });
    throwOnError(error);
  }
}

export async function addSet(sessionExerciseId: string) {
  const maxResult = await supabase
    .from('session_sets')
    .select('set_index')
    .eq('session_exercise_id', sessionExerciseId)
    .order('set_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  throwOnError(maxResult.error);
  const result = await supabase
    .from('session_sets')
    .insert({
      session_exercise_id: sessionExerciseId,
      set_index: (maxResult.data?.set_index ?? -1) + 1,
      kg: null,
      reps: null,
      completed: false,
    })
    .select('id, set_index, kg, reps, completed')
    .single();
  const set = requireData(result.data, result.error, 'Could not add set.');
  return {
    id: set.id,
    setIndex: set.set_index,
    kg: set.kg,
    reps: set.reps,
    completed: set.completed,
  } satisfies ActiveSet;
}

export async function deleteSet(setId: string) {
  const { error } = await supabase.from('session_sets').delete().eq('id', setId);
  throwOnError(error);
}

export async function addExerciseToActiveSession(
  sessionId: string,
  exerciseId: string,
  orderIndex: number,
  shifts: { id: string; orderIndex: number }[],
) {
  const result = await supabase.rpc('add_exercise_to_session', {
    p_session_id: sessionId,
    p_exercise_id: exerciseId,
    p_order_index: orderIndex,
    p_shift_ids: shifts.map((shift) => shift.id),
    p_shift_orders: shifts.map((shift) => shift.orderIndex),
  });
  throwOnError(result.error);
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
    throw new FitFlowError('Invalid response while adding exercise.');
  }
}

export async function removeExerciseFromActiveSession(sessionId: string, sessionExerciseId: string) {
  const removeResult = await supabase
    .from('session_exercises')
    .delete()
    .eq('id', sessionExerciseId)
    .eq('workout_session_id', sessionId);
  throwOnError(removeResult.error);
  const remainingResult = await supabase
    .from('session_exercises')
    .select('id')
    .eq('workout_session_id', sessionId)
    .order('order_index');
  throwOnError(remainingResult.error);
  const updates = await Promise.all(
    (remainingResult.data ?? []).map((row, index) =>
      supabase.from('session_exercises').update({ order_index: index }).eq('id', row.id),
    ),
  );
  const failure = updates.find((result) => result.error)?.error;
  throwOnError(failure ?? null);
}

async function readActiveRestRow(userId: string, sessionId: string) {
  const result = await supabase
    .from('workout_sessions')
    .select('rest_target_ms, rest_ends_at, rest_paused_remaining_ms')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .is('ended_at', null)
    .single();
  return requireData(result.data, result.error, 'Active session not found.') as RestRow;
}

export type RestTimerOperation =
  | { kind: 'pull' }
  | { kind: 'start'; durationMs: number }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'restart' }
  | { kind: 'stop' };

export async function applyRestTimerOperation(
  userId: string,
  sessionId: string,
  operation: RestTimerOperation,
): Promise<RestTimerState> {
  let row = await readActiveRestRow(userId, sessionId);
  if (row.rest_ends_at && new Date(row.rest_ends_at).getTime() <= Date.now()) {
    return clearExpiredRest(userId, sessionId, row);
  }
  if (operation.kind === 'pull') return mapRestRow(row);

  const update = async (payload: RestRow) => {
    const result = await supabase
      .from('workout_sessions')
      .update(payload)
      .eq('id', sessionId)
      .eq('user_id', userId)
      .is('ended_at', null)
      .select('rest_target_ms, rest_ends_at, rest_paused_remaining_ms')
      .single();
    return requireData(result.data, result.error, 'Could not update rest timer.') as RestRow;
  };

  if (operation.kind === 'stop') {
    await sealOpenRestPeriods(sessionId);
    row = await update({ rest_target_ms: null, rest_ends_at: null, rest_paused_remaining_ms: null });
    return mapRestRow(row);
  }

  if (operation.kind === 'start' || operation.kind === 'restart') {
    const durationMs =
      operation.kind === 'start'
        ? Math.max(1000, Math.floor(operation.durationMs))
        : row.rest_target_ms;
    if (!durationMs) throw new FitFlowError('No rest target to restart.');
    const now = new Date();
    await sealOpenRestPeriods(sessionId, now.toISOString());
    const insert = await supabase.from('session_rest_periods').insert({
      workout_session_id: sessionId,
      started_at: now.toISOString(),
      ended_at: null,
      planned_target_ms: durationMs,
    });
    throwOnError(insert.error);
    row = await update({
      rest_target_ms: durationMs,
      rest_ends_at: new Date(now.getTime() + durationMs).toISOString(),
      rest_paused_remaining_ms: null,
    });
    return mapRestRow(row);
  }

  if (operation.kind === 'pause') {
    if (!row.rest_ends_at || row.rest_target_ms === null) return mapRestRow(row);
    const remaining = Math.max(0, new Date(row.rest_ends_at).getTime() - Date.now());
    row = await update({
      rest_target_ms: row.rest_target_ms,
      rest_ends_at: null,
      rest_paused_remaining_ms: remaining,
    });
    return mapRestRow(row);
  }

  if (row.rest_paused_remaining_ms === null || row.rest_target_ms === null) return mapRestRow(row);
  if (row.rest_paused_remaining_ms <= 0) {
    await sealOpenRestPeriods(sessionId);
    row = await update({ rest_target_ms: null, rest_ends_at: null, rest_paused_remaining_ms: null });
    return mapRestRow(row);
  }
  row = await update({
    rest_target_ms: row.rest_target_ms,
    rest_ends_at: new Date(Date.now() + row.rest_paused_remaining_ms).toISOString(),
    rest_paused_remaining_ms: null,
  });
  return mapRestRow(row);
}

export async function endActiveWorkout(userId: string, sessionId: string) {
  const exerciseResult = await supabase
    .from('session_exercises')
    .select('session_sets(id, reps)')
    .eq('workout_session_id', sessionId);
  throwOnError(exerciseResult.error);
  const invalidSetIds = (exerciseResult.data ?? []).flatMap((row) =>
    (row.session_sets ?? []).filter((set) => !isLoggedSetReps(set.reps)).map((set) => set.id),
  );
  if (invalidSetIds.length > 0) {
    const purge = await supabase.from('session_sets').delete().in('id', invalidSetIds);
    throwOnError(purge.error);
  }
  const endedAt = new Date().toISOString();
  await sealOpenRestPeriods(sessionId, endedAt);
  const payload = {
    ended_at: endedAt,
    rest_target_ms: null,
    rest_ends_at: null,
    rest_paused_remaining_ms: null,
  };
  const primary = await supabase
    .from('workout_sessions')
    .update(payload)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .is('ended_at', null);
  throwOnError(primary.error);
  const zombies = await supabase
    .from('workout_sessions')
    .update(payload)
    .eq('user_id', userId)
    .is('ended_at', null);
  throwOnError(zombies.error);
}

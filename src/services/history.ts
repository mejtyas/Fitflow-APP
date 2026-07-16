import { supabase } from '@/lib/supabase';
import { formatDurationMs, workoutNameFromRelation } from '@/lib/format';
import { isLoggedSetReps } from '@/lib/validation';
import { FitFlowError, requireData, throwOnError } from '@/services/shared';

export const HISTORY_PAGE_SIZE = 10;

export type HistoryListItem = {
  id: string;
  startedAt: string;
  endedAt: string;
  workoutName: string;
  duration: string;
};

export type HistoryPageData = {
  items: HistoryListItem[];
  page: number;
  totalPages: number;
  totalSessions: number;
  totalMinutes: number;
  averageMinutes: number;
};

export async function fetchHistoryPage(userId: string, page: number): Promise<HistoryPageData> {
  const safePage = Math.max(1, Math.floor(page));
  const from = (safePage - 1) * HISTORY_PAGE_SIZE;
  const [pageResult, summaryResult] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select('id, started_at, ended_at, workouts(name)', { count: 'exact' })
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .range(from, from + HISTORY_PAGE_SIZE - 1),
    supabase
      .from('workout_sessions')
      .select('started_at, ended_at')
      .eq('user_id', userId)
      .not('ended_at', 'is', null),
  ]);
  throwOnError(pageResult.error);
  throwOnError(summaryResult.error);
  const totalSessions = pageResult.count ?? 0;
  const totalMinutes = Math.max(
    0,
    Math.floor(
      (summaryResult.data ?? []).reduce((sum, row) => {
        if (!row.ended_at) return sum;
        return sum + new Date(row.ended_at).getTime() - new Date(row.started_at).getTime();
      }, 0) / 60_000,
    ),
  );
  return {
    items: (pageResult.data ?? []).flatMap((row) =>
      row.ended_at
        ? [{
            id: row.id,
            startedAt: row.started_at,
            endedAt: row.ended_at,
            workoutName: workoutNameFromRelation(row.workouts, 'Unnamed Session'),
            duration: formatDurationMs(new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()),
          }]
        : [],
    ),
    page: safePage,
    totalPages: Math.max(1, Math.ceil(totalSessions / HISTORY_PAGE_SIZE)),
    totalSessions,
    totalMinutes,
    averageMinutes: totalSessions ? Math.round(totalMinutes / totalSessions) : 0,
  };
}

export type HistoryDetail = {
  id: string;
  workoutName: string;
  startedAt: string;
  endedAt: string;
  exercises: {
    id: string;
    name: string;
    loggedOrder: number | null;
    firstLoggedAt: string | null;
    sets: { setIndex: number; kg: number | null; reps: number }[];
  }[];
  restPeriods: {
    id: string;
    startedAt: string;
    endedAt: string | null;
    plannedTargetMs: number;
  }[];
};

export async function fetchHistoryDetail(userId: string, sessionId: string): Promise<HistoryDetail> {
  const [sessionResult, exercisesResult, restResult] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select('id, started_at, ended_at, workouts(name)')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('session_exercises')
      .select('id, order_index, logged_order, first_logged_at, exercises(name), session_sets(set_index, kg, reps)')
      .eq('workout_session_id', sessionId)
      .order('order_index'),
    supabase
      .from('session_rest_periods')
      .select('id, started_at, ended_at, planned_target_ms')
      .eq('workout_session_id', sessionId)
      .order('started_at'),
  ]);
  const session = requireData(sessionResult.data, sessionResult.error, 'Session not found.');
  if (!session.ended_at) throw new FitFlowError('Only completed sessions are shown in history.');
  throwOnError(exercisesResult.error);
  throwOnError(restResult.error);

  return {
    id: session.id,
    workoutName: workoutNameFromRelation(session.workouts, 'Unnamed Session'),
    startedAt: session.started_at,
    endedAt: session.ended_at,
    exercises: (exercisesResult.data ?? []).map((row) => ({
      id: row.id,
      name: workoutNameFromRelation(row.exercises, '?'),
      loggedOrder: row.logged_order,
      firstLoggedAt: row.first_logged_at,
      sets: [...(row.session_sets ?? [])]
        .filter((set): set is typeof set & { reps: number } => isLoggedSetReps(set.reps))
        .sort((a, b) => a.set_index - b.set_index)
        .map((set) => ({ setIndex: set.set_index, kg: set.kg, reps: set.reps })),
    })),
    restPeriods: (restResult.data ?? []).map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      plannedTargetMs: row.planned_target_ms,
    })),
  };
}

export async function updateCompletedSessionTimes(
  userId: string,
  sessionId: string,
  startedAt: Date,
  endedAt: Date,
) {
  if (!Number.isFinite(startedAt.getTime()) || !Number.isFinite(endedAt.getTime())) {
    throw new FitFlowError('Invalid date.');
  }
  if (endedAt <= startedAt) throw new FitFlowError('End time must be after start time.');
  const existing = await supabase
    .from('workout_sessions')
    .select('id, ended_at')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();
  const session = requireData(existing.data, existing.error, 'Session not found.');
  if (!session.ended_at) throw new FitFlowError('Only completed sessions can be edited.');
  const { error } = await supabase
    .from('workout_sessions')
    .update({ started_at: startedAt.toISOString(), ended_at: endedAt.toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId);
  throwOnError(error);
}

export async function deleteHistorySession(userId: string, sessionId: string) {
  const { error } = await supabase
    .from('workout_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId)
    .not('ended_at', 'is', null);
  throwOnError(error);
}

export async function clearCompletedHistory(userId: string) {
  const { error } = await supabase
    .from('workout_sessions')
    .delete()
    .eq('user_id', userId)
    .not('ended_at', 'is', null);
  throwOnError(error);
}

export type StatsData = {
  totalWorkouts: number;
  totalMinutes: number;
  topExercises: { id: string; name: string; count: number }[];
};

export async function fetchStats(userId: string): Promise<StatsData> {
  const sessionsResult = await supabase
    .from('workout_sessions')
    .select('id, started_at, ended_at')
    .eq('user_id', userId)
    .not('ended_at', 'is', null);
  throwOnError(sessionsResult.error);
  const sessions = sessionsResult.data ?? [];
  const totalMinutes = Math.round(
    sessions.reduce(
      (sum, row) =>
        sum + (row.ended_at ? new Date(row.ended_at).getTime() - new Date(row.started_at).getTime() : 0),
      0,
    ) / 60_000,
  );
  if (sessions.length === 0) return { totalWorkouts: 0, totalMinutes, topExercises: [] };
  const exerciseResult = await supabase
    .from('session_exercises')
    .select('exercise_id, exercises(name)')
    .in('workout_session_id', sessions.map((row) => row.id));
  throwOnError(exerciseResult.error);
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const row of exerciseResult.data ?? []) {
    const current = counts.get(row.exercise_id);
    counts.set(row.exercise_id, {
      id: row.exercise_id,
      name: workoutNameFromRelation(row.exercises, '?'),
      count: (current?.count ?? 0) + 1,
    });
  }
  return {
    totalWorkouts: sessions.length,
    totalMinutes,
    topExercises: [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

export async function deleteAllUserData(userId: string) {
  const sessions = await supabase.from('workout_sessions').delete().eq('user_id', userId);
  throwOnError(sessions.error);
  const workouts = await supabase.from('workouts').delete().eq('user_id', userId);
  throwOnError(workouts.error);
  const exercises = await supabase.from('exercises').delete().eq('user_id', userId);
  throwOnError(exercises.error);
}

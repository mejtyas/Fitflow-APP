import { supabase } from '@/lib/supabase';
import { workoutNameFromRelation } from '@/lib/format';
import { throwOnError } from '@/services/shared';

export type DashboardData = {
  activeSession: { id: string; startedAt: string; workoutName: string } | null;
  lastSession: { id: string; startedAt: string; endedAt: string; workoutName: string } | null;
  totalSessions: number;
  weeklyWorkouts: number;
  consistency: number;
  exercisedMovements: number;
  workouts: { id: string; name: string }[];
  activeDates: string[];
};

export async function fetchDashboard(userId: string): Promise<DashboardData> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [active, last, count, recent, movements, workouts] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select('id, started_at, workouts(name)')
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('workout_sessions')
      .select('id, started_at, ended_at, workouts(name)')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('workout_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('ended_at', 'is', null),
    supabase
      .from('workout_sessions')
      .select('started_at, ended_at')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .gte('ended_at', thirtyDaysAgo.toISOString()),
    supabase
      .from('session_exercises')
      .select('exercise_id, workout_sessions!inner(user_id)')
      .eq('workout_sessions.user_id', userId),
    supabase.from('workouts').select('id, name').eq('user_id', userId).order('name'),
  ]);

  [active.error, last.error, count.error, recent.error, movements.error, workouts.error].forEach(throwOnError);
  const recentRows = recent.data ?? [];
  const activeDays = new Set(recentRows.map((row) => new Date(row.started_at).toDateString()));
  const activeRow = active.data;
  const lastRow = last.data;

  return {
    activeSession: activeRow
      ? { id: activeRow.id, startedAt: activeRow.started_at, workoutName: workoutNameFromRelation(activeRow.workouts) }
      : null,
    lastSession:
      lastRow?.ended_at
        ? {
            id: lastRow.id,
            startedAt: lastRow.started_at,
            endedAt: lastRow.ended_at,
            workoutName: workoutNameFromRelation(lastRow.workouts),
          }
        : null,
    totalSessions: count.count ?? 0,
    weeklyWorkouts: recentRows.filter((row) => new Date(row.ended_at ?? 0) >= sevenDaysAgo).length,
    consistency: Math.round((activeDays.size / 30) * 100),
    exercisedMovements: new Set((movements.data ?? []).map((row) => row.exercise_id)).size,
    workouts: workouts.data ?? [],
    activeDates: [...activeDays],
  };
}

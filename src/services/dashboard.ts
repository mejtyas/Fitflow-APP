import { getDatabase } from '@/lib/db';
import { displayName } from '@/lib/format';

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

export async function fetchDashboard(): Promise<DashboardData> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const db = await getDatabase();
  type SessionRow = { id: string; started_at: string; ended_at: string | null; workout_name: string | null };
  const sessionSelect = `SELECT ws.id, ws.started_at, ws.ended_at, w.name AS workout_name
    FROM workout_sessions ws LEFT JOIN workouts w ON w.id = ws.workout_id`;
  const [activeRow, lastRow, count, recentRows, movements, workouts] = await Promise.all([
    db.getFirstAsync<SessionRow>(`${sessionSelect} WHERE ws.ended_at IS NULL ORDER BY ws.started_at DESC LIMIT 1`, []),
    db.getFirstAsync<SessionRow>(`${sessionSelect} WHERE ws.ended_at IS NOT NULL ORDER BY ws.ended_at DESC LIMIT 1`, []),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM workout_sessions WHERE ended_at IS NOT NULL', []),
    db.getAllAsync<{ started_at: string; ended_at: string }>(
      'SELECT started_at, ended_at FROM workout_sessions WHERE ended_at IS NOT NULL AND ended_at >= ?',
      [thirtyDaysAgo.toISOString()],
    ),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(DISTINCT exercise_id) AS count FROM session_exercises', []),
    db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM workouts ORDER BY name COLLATE NOCASE', []),
  ]);
  const activeDays = new Set(recentRows.map((row) => new Date(row.started_at).toDateString()));

  return {
    activeSession: activeRow
      ? { id: activeRow.id, startedAt: activeRow.started_at, workoutName: displayName(activeRow.workout_name) }
      : null,
    lastSession:
      lastRow?.ended_at
        ? {
            id: lastRow.id,
            startedAt: lastRow.started_at,
            endedAt: lastRow.ended_at,
            workoutName: displayName(lastRow.workout_name),
          }
        : null,
    totalSessions: count?.count ?? 0,
    weeklyWorkouts: recentRows.filter((row) => new Date(row.ended_at) >= sevenDaysAgo).length,
    consistency: Math.round((activeDays.size / 30) * 100),
    exercisedMovements: movements?.count ?? 0,
    workouts,
    activeDates: [...activeDays],
  };
}

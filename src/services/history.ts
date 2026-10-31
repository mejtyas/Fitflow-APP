import { getDatabase, transaction } from '@/lib/db';
import { displayName, formatDurationMs } from '@/lib/format';
import { isLoggedSetReps } from '@/lib/validation';
import { LixoError, requireRow } from '@/services/shared';

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

function durationMs(startedAt: string, endedAt: string) {
  return new Date(endedAt).getTime() - new Date(startedAt).getTime();
}

function sessionName(name: string | null) {
  return displayName(name, 'Unnamed Session');
}

async function completedSessionTimes() {
  const db = await getDatabase();
  return db.getAllAsync<{ id: string; started_at: string; ended_at: string }>(
    'SELECT id, started_at, ended_at FROM workout_sessions WHERE ended_at IS NOT NULL',
    [],
  );
}

export async function fetchHistoryPage(page: number): Promise<HistoryPageData> {
  const safePage = Math.max(1, Math.floor(page));
  const db = await getDatabase();
  const [rows, summary] = await Promise.all([
    db.getAllAsync<{ id: string; started_at: string; ended_at: string; workout_name: string | null }>(
      `SELECT ws.id, ws.started_at, ws.ended_at, w.name AS workout_name
         FROM workout_sessions ws LEFT JOIN workouts w ON w.id = ws.workout_id
        WHERE ws.ended_at IS NOT NULL
        ORDER BY ws.started_at DESC
        LIMIT ? OFFSET ?`,
      [HISTORY_PAGE_SIZE, (safePage - 1) * HISTORY_PAGE_SIZE],
    ),
    completedSessionTimes(),
  ]);
  const totalSessions = summary.length;
  const totalMinutes = Math.max(
    0,
    Math.floor(summary.reduce((sum, row) => sum + durationMs(row.started_at, row.ended_at), 0) / 60_000),
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      workoutName: sessionName(row.workout_name),
      duration: formatDurationMs(durationMs(row.started_at, row.ended_at)),
    })),
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

export async function fetchHistoryDetail(sessionId: string): Promise<HistoryDetail> {
  const db = await getDatabase();
  const session = requireRow(
    await db.getFirstAsync<{ id: string; started_at: string; ended_at: string | null; workout_name: string | null }>(
      `SELECT ws.id, ws.started_at, ws.ended_at, w.name AS workout_name
         FROM workout_sessions ws LEFT JOIN workouts w ON w.id = ws.workout_id
        WHERE ws.id = ?`,
      [sessionId],
    ),
    'Session not found.',
  );
  if (!session.ended_at) throw new LixoError('Only completed sessions are shown in history.');
  const [exerciseRows, setRows, restRows] = await Promise.all([
    db.getAllAsync<{ id: string; name: string | null; logged_order: number | null; first_logged_at: string | null }>(
      `SELECT se.id, e.name, se.logged_order, se.first_logged_at
         FROM session_exercises se LEFT JOIN exercises e ON e.id = se.exercise_id
        WHERE se.workout_session_id = ?
        ORDER BY se.order_index`,
      [sessionId],
    ),
    db.getAllAsync<{ session_exercise_id: string; set_index: number; kg: number | null; reps: number | null }>(
      `SELECT ss.session_exercise_id, ss.set_index, ss.kg, ss.reps
         FROM session_sets ss JOIN session_exercises se ON se.id = ss.session_exercise_id
        WHERE se.workout_session_id = ?
        ORDER BY ss.set_index`,
      [sessionId],
    ),
    db.getAllAsync<{ id: string; started_at: string; ended_at: string | null; planned_target_ms: number }>(
      `SELECT id, started_at, ended_at, planned_target_ms FROM session_rest_periods
        WHERE workout_session_id = ? ORDER BY started_at`,
      [sessionId],
    ),
  ]);

  return {
    id: session.id,
    workoutName: sessionName(session.workout_name),
    startedAt: session.started_at,
    endedAt: session.ended_at,
    exercises: exerciseRows.map((row) => ({
      id: row.id,
      name: displayName(row.name, '?'),
      loggedOrder: row.logged_order,
      firstLoggedAt: row.first_logged_at,
      sets: setRows.flatMap((set) =>
        set.session_exercise_id === row.id && isLoggedSetReps(set.reps)
          ? [{ setIndex: set.set_index, kg: set.kg, reps: set.reps }]
          : [],
      ),
    })),
    restPeriods: restRows.map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      plannedTargetMs: row.planned_target_ms,
    })),
  };
}

export async function updateCompletedSessionTimes(sessionId: string, startedAt: Date, endedAt: Date) {
  if (!Number.isFinite(startedAt.getTime()) || !Number.isFinite(endedAt.getTime())) {
    throw new LixoError('Invalid date.');
  }
  if (endedAt <= startedAt) throw new LixoError('End time must be after start time.');
  await transaction(async (db) => {
    const session = requireRow(
      await db.getFirstAsync<{ ended_at: string | null }>('SELECT ended_at FROM workout_sessions WHERE id = ?', [sessionId]),
      'Session not found.',
    );
    if (!session.ended_at) throw new LixoError('Only completed sessions can be edited.');
    await db.runAsync('UPDATE workout_sessions SET started_at = ?, ended_at = ? WHERE id = ?', [
      startedAt.toISOString(),
      endedAt.toISOString(),
      sessionId,
    ]);
  });
}

export async function deleteHistorySession(sessionId: string) {
  await transaction((db) =>
    db.runAsync('DELETE FROM workout_sessions WHERE id = ? AND ended_at IS NOT NULL', [sessionId]),
  );
}

export async function clearCompletedHistory() {
  await transaction((db) => db.runAsync('DELETE FROM workout_sessions WHERE ended_at IS NOT NULL', []));
}

export type StatsData = {
  totalWorkouts: number;
  totalMinutes: number;
  topExercises: { id: string; name: string; count: number }[];
};

export async function fetchStats(): Promise<StatsData> {
  const db = await getDatabase();
  const [sessions, topExercises] = await Promise.all([
    completedSessionTimes(),
    db.getAllAsync<{ id: string; name: string | null; count: number }>(
      `SELECT se.exercise_id AS id, e.name, COUNT(*) AS count
         FROM session_exercises se
         JOIN workout_sessions ws ON ws.id = se.workout_session_id
         LEFT JOIN exercises e ON e.id = se.exercise_id
        WHERE ws.ended_at IS NOT NULL
        GROUP BY se.exercise_id
        ORDER BY count DESC, e.name COLLATE NOCASE
        LIMIT 5`,
      [],
    ),
  ]);
  return {
    totalWorkouts: sessions.length,
    totalMinutes: Math.round(
      sessions.reduce((sum, row) => sum + durationMs(row.started_at, row.ended_at), 0) / 60_000,
    ),
    topExercises: topExercises.map((row) => ({ id: row.id, name: displayName(row.name, '?'), count: row.count })),
  };
}

export async function deleteAllUserData() {
  await transaction(async (db) => {
    await db.runAsync('DELETE FROM workout_sessions', []);
    await db.runAsync('DELETE FROM workouts', []);
    await db.runAsync('DELETE FROM exercises', []);
  });
}

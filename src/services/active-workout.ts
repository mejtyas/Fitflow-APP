import { createId, getDatabase, nowIso, transaction, type Database } from '@/lib/db';
import { displayName } from '@/lib/format';
import { parseJson } from '@/lib/json';
import { clampKg, clampReps, isLoggedSetReps } from '@/lib/validation';
import { parseWarmupSettings, type WarmupSettings } from '@/lib/warmup';
import { LixoError, requireRow } from '@/services/shared';

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

const REST_COLUMNS = 'rest_target_ms, rest_ends_at, rest_paused_remaining_ms';

async function sealOpenRestPeriods(db: Database, sessionId: string, endedAt = nowIso()) {
  await db.runAsync(
    'UPDATE session_rest_periods SET ended_at = ? WHERE workout_session_id = ? AND ended_at IS NULL',
    [endedAt, sessionId],
  );
}

async function writeRestRow(db: Database, sessionId: string, row: RestRow) {
  await db.runAsync(
    `UPDATE workout_sessions SET rest_target_ms = ?, rest_ends_at = ?, rest_paused_remaining_ms = ?
      WHERE id = ? AND ended_at IS NULL`,
    [row.rest_target_ms, row.rest_ends_at, row.rest_paused_remaining_ms, sessionId],
  );
  return row;
}

const CLEARED_REST: RestRow = { rest_target_ms: null, rest_ends_at: null, rest_paused_remaining_ms: null };

async function clearExpiredRest(db: Database, sessionId: string, row: RestRow) {
  if (!row.rest_ends_at || new Date(row.rest_ends_at).getTime() > Date.now()) return mapRestRow(row);
  await sealOpenRestPeriods(db, sessionId, row.rest_ends_at);
  await writeRestRow(db, sessionId, CLEARED_REST);
  return { ...IDLE_REST };
}

type SessionRow = RestRow & { id: string; started_at: string; workout_name: string | null };

export async function fetchActiveWorkout(selectedSessionId?: string | null): Promise<ActiveWorkoutData | null> {
  const db = await getDatabase();
  const sessionSelect = `SELECT ws.id, ws.started_at, w.name AS workout_name,
           ws.rest_target_ms, ws.rest_ends_at, ws.rest_paused_remaining_ms
      FROM workout_sessions ws LEFT JOIN workouts w ON w.id = ws.workout_id WHERE ws.ended_at IS NULL`;
  const session = selectedSessionId
    ? await db.getFirstAsync<SessionRow>(`${sessionSelect} AND ws.id = ?`, [selectedSessionId])
    : await db.getFirstAsync<SessionRow>(`${sessionSelect} ORDER BY ws.started_at DESC LIMIT 1`, []);
  if (!session) return null;

  const [exerciseRows, setRows, optionRows] = await Promise.all([
    db.getAllAsync<{ id: string; order_index: number; exercise_id: string; name: string | null; description: string | null }>(
      `SELECT se.id, se.order_index, se.exercise_id, e.name, e.description
         FROM session_exercises se LEFT JOIN exercises e ON e.id = se.exercise_id
        WHERE se.workout_session_id = ?
        ORDER BY se.order_index`,
      [session.id],
    ),
    db.getAllAsync<{ id: string; session_exercise_id: string; set_index: number; kg: number | null; reps: number | null; completed: number }>(
      `SELECT ss.id, ss.session_exercise_id, ss.set_index, ss.kg, ss.reps, ss.completed
         FROM session_sets ss JOIN session_exercises se ON se.id = ss.session_exercise_id
        WHERE se.workout_session_id = ?
        ORDER BY ss.set_index`,
      [session.id],
    ),
    db.getAllAsync<{ id: string; name: string; description: string | null; warmup_settings: string | null }>(
      'SELECT id, name, description, warmup_settings FROM exercises ORDER BY name COLLATE NOCASE',
      [],
    ),
  ]);
  const settings = new Map(optionRows.map((row) => [row.id, parseWarmupSettings(parseJson(row.warmup_settings))]));

  const exerciseIds = [...new Set(exerciseRows.map((row) => row.exercise_id))];
  const pastRows = exerciseIds.length
    ? await db.getAllAsync<{
        exercise_id: string;
        session_exercise_id: string;
        session_id: string;
        started_at: string;
        ended_at: string;
        workout_name: string | null;
        set_index: number | null;
        kg: number | null;
        reps: number | null;
      }>(
        `SELECT se.exercise_id, se.id AS session_exercise_id, ws.id AS session_id, ws.started_at, ws.ended_at,
                w.name AS workout_name, ss.set_index, ss.kg, ss.reps
           FROM session_exercises se
           JOIN workout_sessions ws ON ws.id = se.workout_session_id
           LEFT JOIN workouts w ON w.id = ws.workout_id
           LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
          WHERE se.exercise_id IN (${exerciseIds.map(() => '?').join(', ')})
            AND ws.id <> ? AND ws.ended_at IS NOT NULL
          ORDER BY ws.ended_at DESC, se.id, ss.set_index`,
        [...exerciseIds, session.id],
      )
    : [];

  const pastByExercise = new Map<string, PastSessionPerformance[]>();
  const pastBySessionExercise = new Map<string, PastSessionPerformance>();
  for (const row of pastRows) {
    let past = pastBySessionExercise.get(row.session_exercise_id);
    if (!past) {
      const existing = pastByExercise.get(row.exercise_id) ?? [];
      if (existing.length >= 6) continue;
      past = {
        sessionId: row.session_id,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        workoutName: displayName(row.workout_name),
        sets: [],
      };
      existing.push(past);
      pastByExercise.set(row.exercise_id, existing);
      pastBySessionExercise.set(row.session_exercise_id, past);
    }
    if (isLoggedSetReps(row.reps)) past.sets.push({ kg: row.kg, reps: row.reps });
  }

  const restExpired = session.rest_ends_at !== null && new Date(session.rest_ends_at).getTime() <= Date.now();
  const rest = restExpired
    ? await transaction((txn) => clearExpiredRest(txn, session.id, session))
    : mapRestRow(session);

  return {
    sessionId: session.id,
    startedAt: session.started_at,
    workoutName: displayName(session.workout_name, 'Unnamed Session'),
    exercises: exerciseRows.map((row) => ({
      id: row.id,
      orderIndex: row.order_index,
      exerciseId: row.exercise_id,
      name: displayName(row.name, '?'),
      description: row.description,
      sets: setRows
        .filter((set) => set.session_exercise_id === row.id)
        .map((set) => ({
          id: set.id,
          setIndex: set.set_index,
          kg: set.kg,
          reps: set.reps,
          completed: set.completed === 1,
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

/** Mirrors the web's `record_session_exercise_first_log`: stamps the order in which exercises got their first data. */
async function recordFirstLog(db: Database, sessionExerciseId: string) {
  const sessionExercise = await db.getFirstAsync<{ workout_session_id: string; logged_order: number | null }>(
    'SELECT workout_session_id, logged_order FROM session_exercises WHERE id = ?',
    [sessionExerciseId],
  );
  if (!sessionExercise || sessionExercise.logged_order !== null) return;
  const hasData = await db.getFirstAsync<{ found: number }>(
    'SELECT 1 AS found FROM session_sets WHERE session_exercise_id = ? AND (kg IS NOT NULL OR reps IS NOT NULL) LIMIT 1',
    [sessionExerciseId],
  );
  if (!hasData) return;
  const session = await db.getFirstAsync<{ next_logged_order: number }>(
    'SELECT next_logged_order FROM workout_sessions WHERE id = ?',
    [sessionExercise.workout_session_id],
  );
  if (!session) return;
  await db.runAsync(
    'UPDATE session_exercises SET logged_order = ?, first_logged_at = ? WHERE id = ? AND logged_order IS NULL',
    [session.next_logged_order, nowIso(), sessionExerciseId],
  );
  await db.runAsync('UPDATE workout_sessions SET next_logged_order = next_logged_order + 1 WHERE id = ?', [
    sessionExercise.workout_session_id,
  ]);
}

export async function persistActiveSet(setId: string, patch: SetPatch) {
  const assignments: string[] = [];
  const values: (number | null)[] = [];
  if (patch.kg !== undefined) {
    assignments.push('kg = ?');
    values.push(clampKg(patch.kg) ?? null);
  }
  if (patch.reps !== undefined) {
    assignments.push('reps = ?');
    values.push(clampReps(patch.reps) ?? null);
  }
  if (patch.completed !== undefined) {
    assignments.push('completed = ?');
    values.push(patch.completed ? 1 : 0);
  }
  if (assignments.length === 0) return;
  await transaction(async (db) => {
    const set = requireRow(
      await db.getFirstAsync<{ session_exercise_id: string }>('SELECT session_exercise_id FROM session_sets WHERE id = ?', [setId]),
      'Set not found.',
    );
    await db.runAsync(`UPDATE session_sets SET ${assignments.join(', ')} WHERE id = ?`, [...values, setId]);
    if (patch.kg !== undefined || patch.reps !== undefined) await recordFirstLog(db, set.session_exercise_id);
  });
}

export async function addSet(sessionExerciseId: string): Promise<ActiveSet> {
  return transaction(async (db) => {
    const max = await db.getFirstAsync<{ max_index: number | null }>(
      'SELECT MAX(set_index) AS max_index FROM session_sets WHERE session_exercise_id = ?',
      [sessionExerciseId],
    );
    const set: ActiveSet = { id: createId(), setIndex: (max?.max_index ?? -1) + 1, kg: null, reps: null, completed: false };
    await db.runAsync(
      'INSERT INTO session_sets (id, session_exercise_id, set_index, kg, reps, completed) VALUES (?, ?, ?, NULL, NULL, 0)',
      [set.id, sessionExerciseId, set.setIndex],
    );
    return set;
  });
}

export async function deleteSet(setId: string) {
  await transaction((db) => db.runAsync('DELETE FROM session_sets WHERE id = ?', [setId]));
}

export async function addExerciseToActiveSession(
  sessionId: string,
  exerciseId: string,
  orderIndex: number,
  shifts: { id: string; orderIndex: number }[],
) {
  await transaction(async (db) => {
    const session = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM workout_sessions WHERE id = ? AND ended_at IS NULL',
      [sessionId],
    );
    if (!session) throw new LixoError('Active session not found.');
    for (const shift of shifts) {
      await db.runAsync('UPDATE session_exercises SET order_index = ? WHERE id = ? AND workout_session_id = ?', [
        shift.orderIndex,
        shift.id,
        sessionId,
      ]);
    }
    const sessionExerciseId = createId();
    await db.runAsync(
      'INSERT INTO session_exercises (id, workout_session_id, exercise_id, order_index) VALUES (?, ?, ?, ?)',
      [sessionExerciseId, sessionId, exerciseId, orderIndex],
    );
    await db.runAsync(
      'INSERT INTO session_sets (id, session_exercise_id, set_index, kg, reps, completed) VALUES (?, ?, 0, NULL, NULL, 0)',
      [createId(), sessionExerciseId],
    );
  });
}

export async function removeExerciseFromActiveSession(sessionId: string, sessionExerciseId: string) {
  await transaction(async (db) => {
    await db.runAsync('DELETE FROM session_exercises WHERE id = ? AND workout_session_id = ?', [
      sessionExerciseId,
      sessionId,
    ]);
    const remaining = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM session_exercises WHERE workout_session_id = ? ORDER BY order_index',
      [sessionId],
    );
    for (const [index, row] of remaining.entries()) {
      await db.runAsync('UPDATE session_exercises SET order_index = ? WHERE id = ?', [index, row.id]);
    }
  });
}

export type RestTimerOperation =
  | { kind: 'pull' }
  | { kind: 'start'; durationMs: number }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'restart' }
  | { kind: 'stop' };

export async function applyRestTimerOperation(sessionId: string, operation: RestTimerOperation): Promise<RestTimerState> {
  return transaction(async (db) => {
    const row = requireRow(
      await db.getFirstAsync<RestRow>(
        `SELECT ${REST_COLUMNS} FROM workout_sessions WHERE id = ? AND ended_at IS NULL`,
        [sessionId],
      ),
      'Active session not found.',
    );
    if (row.rest_ends_at && new Date(row.rest_ends_at).getTime() <= Date.now()) {
      return clearExpiredRest(db, sessionId, row);
    }
    if (operation.kind === 'pull') return mapRestRow(row);

    if (operation.kind === 'stop') {
      await sealOpenRestPeriods(db, sessionId);
      return mapRestRow(await writeRestRow(db, sessionId, CLEARED_REST));
    }

    if (operation.kind === 'start' || operation.kind === 'restart') {
      const durationMs =
        operation.kind === 'start' ? Math.max(1000, Math.floor(operation.durationMs)) : row.rest_target_ms;
      if (!durationMs) throw new LixoError('No rest target to restart.');
      const now = new Date();
      await sealOpenRestPeriods(db, sessionId, now.toISOString());
      await db.runAsync(
        `INSERT INTO session_rest_periods (id, workout_session_id, started_at, ended_at, planned_target_ms)
         VALUES (?, ?, ?, NULL, ?)`,
        [createId(), sessionId, now.toISOString(), durationMs],
      );
      return mapRestRow(
        await writeRestRow(db, sessionId, {
          rest_target_ms: durationMs,
          rest_ends_at: new Date(now.getTime() + durationMs).toISOString(),
          rest_paused_remaining_ms: null,
        }),
      );
    }

    if (operation.kind === 'pause') {
      if (!row.rest_ends_at || row.rest_target_ms === null) return mapRestRow(row);
      return mapRestRow(
        await writeRestRow(db, sessionId, {
          rest_target_ms: row.rest_target_ms,
          rest_ends_at: null,
          rest_paused_remaining_ms: Math.max(0, new Date(row.rest_ends_at).getTime() - Date.now()),
        }),
      );
    }

    if (row.rest_paused_remaining_ms === null || row.rest_target_ms === null) return mapRestRow(row);
    if (row.rest_paused_remaining_ms <= 0) {
      await sealOpenRestPeriods(db, sessionId);
      return mapRestRow(await writeRestRow(db, sessionId, CLEARED_REST));
    }
    return mapRestRow(
      await writeRestRow(db, sessionId, {
        rest_target_ms: row.rest_target_ms,
        rest_ends_at: new Date(Date.now() + row.rest_paused_remaining_ms).toISOString(),
        rest_paused_remaining_ms: null,
      }),
    );
  });
}

export async function endActiveWorkout(sessionId: string) {
  await transaction(async (db) => {
    await db.runAsync(
      `DELETE FROM session_sets
        WHERE session_exercise_id IN (SELECT id FROM session_exercises WHERE workout_session_id = ?)
          AND (reps IS NULL OR reps < 1)`,
      [sessionId],
    );
    const endedAt = nowIso();
    await sealOpenRestPeriods(db, sessionId, endedAt);
    // Close the requested session and any other zombie session left open.
    await db.runAsync(
      `UPDATE workout_sessions
          SET ended_at = ?, rest_target_ms = NULL, rest_ends_at = NULL, rest_paused_remaining_ms = NULL
        WHERE ended_at IS NULL`,
      [endedAt],
    );
  });
}

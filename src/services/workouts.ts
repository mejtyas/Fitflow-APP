import { createId, getDatabase, nowIso, placeholders, transaction, type Database } from '@/lib/db';
import { isValidUuid, sanitizeName } from '@/lib/validation';
import { LixoError } from '@/services/shared';

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

export async function fetchWorkouts(): Promise<WorkoutListItem[]> {
  const db = await getDatabase();
  const [workouts, entries] = await Promise.all([
    db.getAllAsync<{ id: string; name: string; last_run_at: string | null }>(
      `SELECT w.id, w.name,
              (SELECT MAX(ws.started_at) FROM workout_sessions ws
                WHERE ws.workout_id = w.id AND ws.ended_at IS NOT NULL) AS last_run_at
         FROM workouts w
        ORDER BY w.name COLLATE NOCASE`,
      [],
    ),
    db.getAllAsync<{ workout_id: string; name: string | null }>(
      `SELECT we.workout_id, e.name
         FROM workout_exercises we
         LEFT JOIN exercises e ON e.id = we.exercise_id
        ORDER BY we.workout_id, we.order_index`,
      [],
    ),
  ]);
  const namesByWorkout = new Map<string, string[]>();
  for (const entry of entries) {
    const names = namesByWorkout.get(entry.workout_id) ?? [];
    names.push(entry.name ?? '?');
    namesByWorkout.set(entry.workout_id, names);
  }
  return workouts.map((workout) => {
    const exerciseNames = namesByWorkout.get(workout.id) ?? [];
    return {
      id: workout.id,
      name: workout.name,
      exerciseNames,
      exerciseCount: exerciseNames.length,
      lastRunAt: workout.last_run_at,
    };
  });
}

export type WorkoutEditorData = {
  workout: { id: string; name: string; entries: WorkoutExerciseDraft[] } | null;
  exercises: { id: string; name: string }[];
};

export async function fetchWorkoutEditor(workoutId: string | null): Promise<WorkoutEditorData> {
  const db = await getDatabase();
  const exercises = await db.getAllAsync<{ id: string; name: string }>(
    'SELECT id, name FROM exercises ORDER BY name COLLATE NOCASE',
    [],
  );
  if (!workoutId) return { exercises, workout: null };
  const workout = await db.getFirstAsync<{ id: string; name: string }>(
    'SELECT id, name FROM workouts WHERE id = ?',
    [workoutId],
  );
  if (!workout) throw new LixoError('Workout not found.');
  const entries = await db.getAllAsync<{ exercise_id: string; default_sets: number }>(
    'SELECT exercise_id, default_sets FROM workout_exercises WHERE workout_id = ? ORDER BY order_index',
    [workoutId],
  );
  return {
    exercises,
    workout: {
      id: workout.id,
      name: workout.name,
      entries: entries.map((entry) => ({ exerciseId: entry.exercise_id, defaultSets: entry.default_sets })),
    },
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

async function replaceWorkoutExercises(db: Database, workoutId: string, entries: WorkoutExerciseDraft[]) {
  const payload = normalizeEntries(entries);
  if (payload.length > 0) {
    const ids = payload.map((entry) => entry.exercise_id);
    const known = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM exercises WHERE id IN (${placeholders(ids.length)})`,
      ids,
    );
    if ((known?.count ?? 0) !== ids.length) throw new LixoError('One of the selected exercises no longer exists.');
  }
  await db.runAsync('DELETE FROM workout_exercises WHERE workout_id = ?', [workoutId]);
  for (const entry of payload) {
    await db.runAsync(
      'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, default_sets) VALUES (?, ?, ?, ?, ?)',
      [createId(), workoutId, entry.exercise_id, entry.order_index, entry.default_sets],
    );
  }
}

export async function saveWorkout(input: { workoutId?: string | null; name: string; entries: WorkoutExerciseDraft[] }) {
  const name = sanitizeName(input.name);
  if (!name) throw new LixoError('Workout name is required.');
  return transaction(async (db) => {
    const now = nowIso();
    if (input.workoutId) {
      const result = await db.runAsync('UPDATE workouts SET name = ?, updated_at = ? WHERE id = ?', [
        name,
        now,
        input.workoutId,
      ]);
      if (result.changes === 0) throw new LixoError('Workout not found.');
      await replaceWorkoutExercises(db, input.workoutId, input.entries);
      return input.workoutId;
    }
    const id = createId();
    await db.runAsync('INSERT INTO workouts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [id, name, now, now]);
    await replaceWorkoutExercises(db, id, input.entries);
    return id;
  });
}

export async function deleteWorkout(workoutId: string) {
  await transaction((db) => db.runAsync('DELETE FROM workouts WHERE id = ?', [workoutId]));
}

export type StartWorkoutResult =
  | { sessionId: string; resumed: boolean }
  | { sessionId: string; resumed: true; activeWorkoutMismatch: true };

export async function startWorkout(workoutId: string | null): Promise<StartWorkoutResult> {
  if (workoutId !== null && !isValidUuid(workoutId)) throw new LixoError('Invalid workout.');
  return transaction(async (db) => {
    const existing = await db.getFirstAsync<{ id: string; workout_id: string | null }>(
      'SELECT id, workout_id FROM workout_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
      [],
    );
    if (existing) {
      return existing.workout_id === workoutId
        ? { sessionId: existing.id, resumed: true }
        : { sessionId: existing.id, resumed: true, activeWorkoutMismatch: true };
    }

    if (workoutId) {
      const workout = await db.getFirstAsync<{ id: string }>('SELECT id FROM workouts WHERE id = ?', [workoutId]);
      if (!workout) throw new LixoError('Workout not found.');
    }
    const sessionId = createId();
    await db.runAsync('INSERT INTO workout_sessions (id, workout_id, started_at) VALUES (?, ?, ?)', [
      sessionId,
      workoutId,
      nowIso(),
    ]);
    if (!workoutId) return { sessionId, resumed: false };

    const template = await db.getAllAsync<{ exercise_id: string; default_sets: number }>(
      'SELECT exercise_id, default_sets FROM workout_exercises WHERE workout_id = ? ORDER BY order_index',
      [workoutId],
    );
    for (const [index, entry] of template.entries()) {
      const sessionExerciseId = createId();
      await db.runAsync(
        'INSERT INTO session_exercises (id, workout_session_id, exercise_id, order_index) VALUES (?, ?, ?, ?)',
        [sessionExerciseId, sessionId, entry.exercise_id, index],
      );
      for (let setIndex = 0; setIndex < (entry.default_sets ?? 2); setIndex += 1) {
        await db.runAsync(
          'INSERT INTO session_sets (id, session_exercise_id, set_index, kg, reps, completed) VALUES (?, ?, ?, NULL, NULL, 0)',
          [createId(), sessionExerciseId, setIndex],
        );
      }
    }
    return { sessionId, resumed: false };
  });
}

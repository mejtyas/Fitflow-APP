import { createId, getDatabase, nowIso, transaction } from '@/lib/db';
import { displayName } from '@/lib/format';
import { parseJson } from '@/lib/json';
import { estimatedOneRmEpley, sessionMetrics } from '@/lib/metrics';
import { isLoggedSetReps, sanitizeDescription, sanitizeName } from '@/lib/validation';
import { parseWarmupSettings, warmupSettingsToJson, type WarmupSettings } from '@/lib/warmup';
import { LixoError, requireRow } from '@/services/shared';

export type ExerciseListItem = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
};

export async function fetchExercises(): Promise<ExerciseListItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<ExerciseListItem>(
    'SELECT id, name, description, created_at AS createdAt FROM exercises ORDER BY name COLLATE NOCASE',
    [],
  );
}

export async function createExercise(nameRaw: string, descriptionRaw: string) {
  const name = sanitizeName(nameRaw);
  if (!name) throw new LixoError('Exercise name is required.');
  await transaction((db) =>
    db.runAsync(
      'INSERT INTO exercises (id, name, description, warmup_settings, created_at) VALUES (?, ?, ?, NULL, ?)',
      [createId(), name, sanitizeDescription(descriptionRaw), nowIso()],
    ),
  );
}

export async function updateExercise(id: string, nameRaw: string, descriptionRaw: string) {
  const name = sanitizeName(nameRaw);
  if (!name) throw new LixoError('Exercise name is required.');
  await transaction((db) =>
    db.runAsync('UPDATE exercises SET name = ?, description = ? WHERE id = ?', [
      name,
      sanitizeDescription(descriptionRaw),
      id,
    ]),
  );
}

export async function updateExerciseDescription(id: string, descriptionRaw: string) {
  await transaction((db) =>
    db.runAsync('UPDATE exercises SET description = ? WHERE id = ?', [sanitizeDescription(descriptionRaw), id]),
  );
}

export async function updateWarmupSettings(id: string, settings: WarmupSettings) {
  const normalized = parseWarmupSettings(warmupSettingsToJson(settings));
  await transaction((db) =>
    db.runAsync('UPDATE exercises SET warmup_settings = ? WHERE id = ?', [
      JSON.stringify(warmupSettingsToJson(normalized)),
      id,
    ]),
  );
}

export async function deleteExercise(id: string) {
  await transaction(async (db) => {
    const used = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM session_exercises WHERE exercise_id = ?',
      [id],
    );
    if ((used?.count ?? 0) > 0) {
      throw new LixoError('This exercise is part of your workout history, so it cannot be deleted.');
    }
    await db.runAsync('DELETE FROM exercises WHERE id = ?', [id]);
  });
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

export async function fetchExerciseDetail(id: string): Promise<ExerciseDetail> {
  const db = await getDatabase();
  const exercise = requireRow(
    await db.getFirstAsync<{ id: string; name: string; description: string | null; warmup_settings: string | null }>(
      'SELECT id, name, description, warmup_settings FROM exercises WHERE id = ?',
      [id],
    ),
    'Exercise not found.',
  );
  const setRows = await db.getAllAsync<{
    session_id: string;
    started_at: string;
    workout_name: string | null;
    set_index: number | null;
    kg: number | null;
    reps: number | null;
  }>(
    `SELECT ws.id AS session_id, ws.started_at, w.name AS workout_name, ss.set_index, ss.kg, ss.reps
       FROM session_exercises se
       JOIN workout_sessions ws ON ws.id = se.workout_session_id
       LEFT JOIN workouts w ON w.id = ws.workout_id
       LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
      WHERE se.exercise_id = ? AND ws.ended_at IS NOT NULL
      ORDER BY ws.started_at DESC, se.order_index, ss.set_index`,
    [id],
  );

  const sessionsById = new Map<string, ExerciseDetail['recentSessions'][number]>();
  for (const row of setRows) {
    let session = sessionsById.get(row.session_id);
    if (!session) {
      session = {
        sessionId: row.session_id,
        startedAt: row.started_at,
        workoutName: displayName(row.workout_name),
        sets: [],
      };
      sessionsById.set(row.session_id, session);
    }
    if (row.set_index !== null && isLoggedSetReps(row.reps)) {
      session.sets.push({ kg: row.kg, reps: row.reps, setIndex: row.set_index });
    }
  }
  const recentSessions = [...sessionsById.values()];

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
    warmupSettings: parseWarmupSettings(parseJson(exercise.warmup_settings)),
    sessionCount: recentSessions.length,
    totalSets: allSets.length,
    maxWeight: Math.max(0, ...allSets.map((set) => set.kg ?? 0)),
    totalVolume: allSets.reduce((sum, set) => sum + (set.kg ?? 0) * (set.reps ?? 0), 0),
    bestEstimatedOneRm: Math.max(0, ...allSets.map((set) => estimatedOneRmEpley(set.kg ?? 0, set.reps ?? 0) ?? 0)),
    progress,
    recentSessions,
  };
}

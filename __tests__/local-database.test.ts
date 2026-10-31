import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDatabase, SCHEMA_VERSION, setDatabaseForTesting, transaction } from '@/lib/db';
import { DEFAULT_WARMUP_SETTINGS } from '@/lib/warmup';
import {
  addExerciseToActiveSession,
  addSet,
  applyRestTimerOperation,
  deleteSet,
  endActiveWorkout,
  fetchActiveWorkout,
  persistActiveSet,
  removeExerciseFromActiveSession,
} from '@/services/active-workout';
import { fetchDashboard } from '@/services/dashboard';
import {
  createExercise,
  deleteExercise,
  fetchExerciseDetail,
  fetchExercises,
  updateExercise,
  updateWarmupSettings,
} from '@/services/exercises';
import { exportHistory } from '@/services/export-history';
import { createFeedback, fetchFeedback, setFeedbackSolved } from '@/services/feedback';
import {
  clearCompletedHistory,
  deleteAllUserData,
  deleteHistorySession,
  fetchHistoryDetail,
  fetchHistoryPage,
  fetchStats,
  updateCompletedSessionTimes,
} from '@/services/history';
import { deleteWorkout, fetchWorkoutEditor, fetchWorkouts, saveWorkout, startWorkout } from '@/services/workouts';
import { createTestDatabase } from '../jest/node-sqlite';

const written: string[] = [];
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: jest.fn().mockImplementation(() => ({
    uri: 'file:///cache/lixo-history.csv',
    create: jest.fn(),
    write: jest.fn((content: string) => written.push(content)),
  })),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

beforeEach(() => {
  setDatabaseForTesting(createTestDatabase());
  written.length = 0;
});

async function exerciseId(name: string) {
  const exercise = (await fetchExercises()).find((item) => item.name === name);
  if (!exercise) throw new Error(`missing ${name}`);
  return exercise.id;
}

async function seedPushWorkout() {
  await createExercise('Squat', '');
  await createExercise('Bench press', 'Retract shoulder blades');
  const bench = await exerciseId('Bench press');
  const squat = await exerciseId('Squat');
  const workoutId = await saveWorkout({
    name: 'Push',
    entries: [
      { exerciseId: bench, defaultSets: 3 },
      { exerciseId: squat, defaultSets: 2 },
      { exerciseId: bench, defaultSets: 5 },
    ],
  });
  return { bench, squat, workoutId };
}

async function activeWorkout() {
  const data = await fetchActiveWorkout();
  if (!data) throw new Error('no active workout');
  return data;
}

async function logAllSets(reps = 8, kg = 100) {
  const data = await activeWorkout();
  for (const exercise of data.exercises) {
    for (const set of exercise.sets) await persistActiveSet(set.id, { kg, reps, completed: true });
  }
}

describe('local SQLite database', () => {
  test('migrates a fresh database once and keeps it idempotent', async () => {
    const db = await getDatabase();
    expect(await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', [])).toEqual({
      user_version: SCHEMA_VERSION,
    });
    setDatabaseForTesting(db);
    await expect(getDatabase()).resolves.toBe(db);
    expect(await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys', [])).toEqual({ foreign_keys: 1 });
  });

  test('manages the exercise library', async () => {
    await createExercise('  Deadlift ', '  hinge ');
    await expect(createExercise('   ', '')).rejects.toThrow('Exercise name is required.');
    const id = await exerciseId('Deadlift');
    await updateExercise(id, 'Romanian deadlift', '');
    await updateWarmupSettings(id, { ...DEFAULT_WARMUP_SETTINGS, w1_pct_low: 60, w1_pct_high: 30 });
    const detail = await fetchExerciseDetail(id);
    expect(detail).toMatchObject({ name: 'Romanian deadlift', description: null, sessionCount: 0 });
    expect(detail.warmupSettings).toMatchObject({ w1_pct_low: 30, w1_pct_high: 60 });
    await deleteExercise(id);
    expect(await fetchExercises()).toEqual([]);
  });

  test('saves workout templates atomically and de-duplicates exercises', async () => {
    const { bench, squat, workoutId } = await seedPushWorkout();
    expect(await fetchWorkouts()).toEqual([
      { id: workoutId, name: 'Push', exerciseNames: ['Bench press', 'Squat'], exerciseCount: 2, lastRunAt: null },
    ]);
    const editor = await fetchWorkoutEditor(workoutId);
    expect(editor.workout?.entries).toEqual([
      { exerciseId: bench, defaultSets: 3 },
      { exerciseId: squat, defaultSets: 2 },
    ]);

    // A missing exercise rolls back the whole save, including the new workout row.
    await expect(
      saveWorkout({ name: 'Broken', entries: [{ exerciseId: '550e8400-e29b-41d4-a716-446655440000', defaultSets: 3 }] }),
    ).rejects.toThrow('no longer exists');
    expect((await fetchWorkouts()).map((workout) => workout.name)).toEqual(['Push']);

    await saveWorkout({ workoutId, name: 'Push day', entries: [{ exerciseId: squat, defaultSets: 4 }] });
    expect((await fetchWorkoutEditor(workoutId)).workout).toEqual({
      id: workoutId,
      name: 'Push day',
      entries: [{ exerciseId: squat, defaultSets: 4 }],
    });
  });

  test('runs a full workout from template to history, stats and export', async () => {
    const { bench, squat, workoutId } = await seedPushWorkout();
    const started = await startWorkout(workoutId);
    expect(started).toEqual({ sessionId: expect.any(String), resumed: false });
    expect(await startWorkout(workoutId)).toEqual({ sessionId: started.sessionId, resumed: true });
    expect(await startWorkout(null)).toMatchObject({ sessionId: started.sessionId, activeWorkoutMismatch: true });

    let data = await activeWorkout();
    expect(data.workoutName).toBe('Push');
    expect(data.exercises.map((exercise) => [exercise.name, exercise.sets.length])).toEqual([
      ['Bench press', 3],
      ['Squat', 2],
    ]);

    // Log squat first: logged_order follows the order the user actually trained in.
    const [benchRow, squatRow] = data.exercises;
    await persistActiveSet(squatRow!.sets[0]!.id, { kg: 140, reps: 5, completed: true });
    await persistActiveSet(benchRow!.sets[0]!.id, { kg: 100, reps: 8 });
    await persistActiveSet(benchRow!.sets[0]!.id, { reps: 0.3 });
    await persistActiveSet(benchRow!.sets[0]!.id, { reps: 10.26, kg: 100.123 });

    const extra = await addSet(squatRow!.id);
    expect(extra).toMatchObject({ setIndex: 2, kg: null, reps: null, completed: false });
    await deleteSet(extra.id);

    await createExercise('Dips', '');
    const dips = await exerciseId('Dips');
    await addExerciseToActiveSession(data.sessionId, dips, 1, [{ id: squatRow!.id, orderIndex: 2 }]);
    data = await activeWorkout();
    expect(data.exercises.map((exercise) => exercise.name)).toEqual(['Bench press', 'Dips', 'Squat']);
    expect(data.exercises[0]!.sets[0]).toMatchObject({ kg: 100.12, reps: 10.5, completed: false });
    await removeExerciseFromActiveSession(data.sessionId, data.exercises[1]!.id);
    data = await activeWorkout();
    expect(data.exercises.map((exercise) => [exercise.name, exercise.orderIndex])).toEqual([
      ['Bench press', 0],
      ['Squat', 1],
    ]);

    const rest = await applyRestTimerOperation(data.sessionId, { kind: 'start', durationMs: 90_000 });
    expect(rest).toMatchObject({ targetMs: 90_000, paused: false });
    expect((await applyRestTimerOperation(data.sessionId, { kind: 'pause' })).paused).toBe(true);
    expect((await applyRestTimerOperation(data.sessionId, { kind: 'resume' })).paused).toBe(false);
    expect((await applyRestTimerOperation(data.sessionId, { kind: 'restart' })).targetMs).toBe(90_000);
    expect(await applyRestTimerOperation(data.sessionId, { kind: 'stop' })).toEqual({
      targetMs: null,
      remainingMs: 0,
      paused: false,
      endsAt: null,
    });

    await endActiveWorkout(data.sessionId);
    expect(await fetchActiveWorkout()).toBeNull();

    const history = await fetchHistoryPage(1);
    expect(history).toMatchObject({ totalSessions: 1, totalPages: 1, page: 1 });
    expect(history.items[0]).toMatchObject({ id: data.sessionId, workoutName: 'Push' });

    const detail = await fetchHistoryDetail(data.sessionId);
    expect(detail.exercises).toEqual([
      { id: expect.any(String), name: 'Bench press', loggedOrder: 1, firstLoggedAt: expect.any(String), sets: [{ setIndex: 0, kg: 100.12, reps: 10.5 }] },
      { id: expect.any(String), name: 'Squat', loggedOrder: 0, firstLoggedAt: expect.any(String), sets: [{ setIndex: 0, kg: 140, reps: 5 }] },
    ]);
    expect(detail.restPeriods).toHaveLength(2);
    expect(detail.restPeriods.every((period) => period.endedAt !== null)).toBe(true);

    const dashboard = await fetchDashboard();
    expect(dashboard).toMatchObject({ activeSession: null, totalSessions: 1, weeklyWorkouts: 1, exercisedMovements: 2 });
    expect(dashboard.lastSession?.workoutName).toBe('Push');

    expect(await fetchStats()).toMatchObject({ totalWorkouts: 1, topExercises: [{ count: 1 }, { count: 1 }] });
    const squatDetail = await fetchExerciseDetail(squat);
    expect(squatDetail).toMatchObject({ sessionCount: 1, totalSets: 1, maxWeight: 140, totalVolume: 700 });
    expect((await fetchWorkouts())[0]!.lastRunAt).toBe(history.items[0]!.startedAt);

    // The next workout shows the previous performance for each exercise.
    await startWorkout(workoutId);
    const next = await activeWorkout();
    expect(next.exercises[0]!.pastSessions).toEqual([
      expect.objectContaining({ sessionId: data.sessionId, sets: [{ kg: 100.12, reps: 10.5 }] }),
    ]);
    await logAllSets();
    await endActiveWorkout(next.sessionId);
    expect((await fetchExerciseDetail(bench)).progress).toHaveLength(2);

    await exportHistory('csv');
    expect(jest.mocked(File)).toHaveBeenCalledWith('cache', 'lixo-history.csv');
    expect(Sharing.shareAsync).toHaveBeenCalled();
    const csv = written[0]!.split('\r\n');
    expect(csv[0]).toBe('date,workout_name,duration_minutes,exercise_name,exercise_logged_order,exercise_first_logged_at,set_index,kg,reps');
    expect(csv).toHaveLength(1 + 5 + 2);
  });

  test('protects history and cleans up when data is deleted', async () => {
    const { bench, workoutId } = await seedPushWorkout();
    const { sessionId } = await startWorkout(workoutId);
    await logAllSets();
    await endActiveWorkout(sessionId);

    await expect(deleteExercise(bench)).rejects.toThrow('part of your workout history');

    const start = new Date('2026-10-01T10:00:00Z');
    await expect(updateCompletedSessionTimes(sessionId, start, start)).rejects.toThrow('after start');
    await updateCompletedSessionTimes(sessionId, start, new Date('2026-10-01T11:00:00Z'));
    expect((await fetchHistoryPage(1)).totalMinutes).toBe(60);

    await deleteWorkout(workoutId);
    expect((await fetchHistoryDetail(sessionId)).workoutName).toBe('Unnamed Session');

    await deleteHistorySession(sessionId);
    expect((await fetchHistoryPage(1)).totalSessions).toBe(0);
    const db = await getDatabase();
    expect(await db.getFirstAsync('SELECT COUNT(*) AS count FROM session_sets', [])).toEqual({ count: 0 });

    const second = await startWorkout(null);
    await endActiveWorkout(second.sessionId);
    await clearCompletedHistory();
    expect((await fetchHistoryPage(1)).totalSessions).toBe(0);

    await deleteAllUserData();
    expect(await fetchExercises()).toEqual([]);
    expect(await fetchWorkouts()).toEqual([]);
  });

  test('keeps notes locally', async () => {
    await expect(createFeedback('  ')).rejects.toThrow('Please enter a note.');
    await createFeedback('Add plate calculator');
    const [note] = await fetchFeedback();
    expect(note).toMatchObject({ body: 'Add plate calculator', solved: false });
    await setFeedbackSolved(note!.id, true);
    expect((await fetchFeedback())[0]!.solved).toBe(true);
  });

  test('serializes concurrent transactions and rolls back failures', async () => {
    await createExercise('Row', '');
    const failing = transaction(async (db) => {
      await db.runAsync("UPDATE exercises SET name = 'Changed'", []);
      throw new Error('boom');
    });
    const succeeding = createExercise('Curl', '');
    await expect(failing).rejects.toThrow('boom');
    await succeeding;
    expect((await fetchExercises()).map((exercise) => exercise.name)).toEqual(['Curl', 'Row']);
  });
});

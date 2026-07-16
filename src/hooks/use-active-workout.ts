import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  clearActiveMirror,
  readActiveMirror,
  writeActiveMirror,
  type ActiveMirror,
  type MirrorSet,
} from '@/lib/active-mirror';
import { cancelRestNotification, scheduleRestCompleteNotification, signalRestComplete } from '@/lib/notifications';
import { getDefaultRestSeconds } from '@/lib/preferences';
import { isLoggedSetReps } from '@/lib/validation';
import {
  addSet,
  applyRestTimerOperation,
  deleteSet,
  endActiveWorkout,
  persistActiveSet,
  type ActiveExercise,
  type ActiveSet,
  type ActiveWorkoutData,
  type RestTimerOperation,
  type RestTimerState,
} from '@/services/active-workout';
import { errorMessage } from '@/services/shared';

const SAVE_DEBOUNCE_MS = 400;

function mergeMirror(exercises: ActiveExercise[], sets: Record<string, MirrorSet>) {
  return exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => (sets[set.id] ? { ...set, ...sets[set.id] } : set)),
  }));
}

export function useActiveWorkout(data: ActiveWorkoutData, userId: string) {
  const [exercises, setExercises] = useState(data.exercises);
  const [rest, setRest] = useState<RestTimerState>(data.rest);
  const [restDurations, setRestDurations] = useState<Record<string, number>>({});
  const [defaultRestSeconds, setDefaultRestSeconds] = useState(150);
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - new Date(data.startedAt).getTime());
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const snapshotsRef = useRef(new Map<string, MirrorSet>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const persistChainsRef = useRef(new Map<string, Promise<boolean>>());
  const addingSetRef = useRef(new Set<string>());
  const removingSetRef = useRef(new Set<string>());
  const restBusyRef = useRef(false);
  const finishedRef = useRef(false);
  const restNotificationRef = useRef<string | null>(null);
  const alarmConsumedRef = useRef(false);
  const mirrorWriteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exercisesRef = useRef(exercises);
  const restRef = useRef(rest);
  const restDurationsRef = useRef(restDurations);

  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);
  useEffect(() => {
    restRef.current = rest;
  }, [rest]);
  useEffect(() => {
    restDurationsRef.current = restDurations;
  }, [restDurations]);

  const persistMirror = useCallback(() => {
    if (mirrorWriteRef.current) clearTimeout(mirrorWriteRef.current);
    mirrorWriteRef.current = setTimeout(() => {
      mirrorWriteRef.current = null;
      const sets = Object.fromEntries(snapshotsRef.current.entries());
      const mirror: ActiveMirror = {
        version: 4,
        sessionId: data.sessionId,
        updatedAt: Date.now(),
        sets,
        rest: restRef.current,
        restDurations: restDurationsRef.current,
      };
      void writeActiveMirror(mirror).catch(() => undefined);
    }, 80);
  }, [data.sessionId]);

  const persistOne = useCallback((setId: string) => {
    const previous = persistChainsRef.current.get(setId) ?? Promise.resolve(true);
    const operation = previous.then(async () => {
      const snapshot = snapshotsRef.current.get(setId);
      if (!snapshot) return true;
      try {
        await persistActiveSet(setId, snapshot);
        return true;
      } catch (cause) {
        setError(errorMessage(cause, 'Could not save a set. Your local copy is retained.'));
        return false;
      }
    });
    persistChainsRef.current.set(setId, operation);
    void operation.then(() => {
      if (persistChainsRef.current.get(setId) === operation) persistChainsRef.current.delete(setId);
    });
    return operation;
  }, []);

  const schedulePersist = useCallback(
    (setId: string) => {
      const existing = timersRef.current.get(setId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        timersRef.current.delete(setId);
        void persistOne(setId);
      }, SAVE_DEBOUNCE_MS);
      timersRef.current.set(setId, timer);
    },
    [persistOne],
  );

  const flushAll = useCallback(async () => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
    const saved = await Promise.all([...snapshotsRef.current.keys()].map(persistOne));
    persistMirror();
    return saved.every(Boolean);
  }, [persistMirror, persistOne]);

  useEffect(() => {
    let active = true;
    void Promise.all([readActiveMirror(data.sessionId), getDefaultRestSeconds()]).then(
      async ([mirror, defaultSeconds]) => {
        if (!active) return;
        setDefaultRestSeconds(defaultSeconds);
        if (!mirror) return;
        setExercises((current) => mergeMirror(current, mirror.sets));
        setRestDurations(mirror.restDurations ?? {});
        Object.entries(mirror.sets).forEach(([id, value]) => snapshotsRef.current.set(id, value));
        await Promise.allSettled(Object.keys(mirror.sets).map(persistOne));
      },
    );
    return () => {
      active = false;
    };
  }, [data.sessionId, persistOne]);

  useEffect(() => {
    const started = new Date(data.startedAt).getTime();
    const timer = setInterval(() => setElapsedMs(Date.now() - started), 1000);
    return () => clearInterval(timer);
  }, [data.startedAt]);

  const applyRest = useCallback(
    async (operation: RestTimerOperation) => {
      if (restBusyRef.current) return null;
      restBusyRef.current = true;
      try {
        const previous = restRef.current;
        const next = await applyRestTimerOperation(userId, data.sessionId, operation);
        setRest(next);
        restRef.current = next;
        if (operation.kind !== 'pull') alarmConsumedRef.current = false;
        try {
          await cancelRestNotification(restNotificationRef.current);
          restNotificationRef.current = null;
          if (next.targetMs !== null && !next.paused && next.remainingMs > 0) {
            restNotificationRef.current = await scheduleRestCompleteNotification(next.remainingMs / 1000);
          }
        } catch {
          restNotificationRef.current = null;
        }
        if (previous.targetMs !== null && next.targetMs === null && operation.kind === 'pull') {
          await signalRestComplete();
        }
        persistMirror();
        return next;
      } catch (cause) {
        setError(errorMessage(cause, 'Could not update the rest timer.'));
        return null;
      } finally {
        restBusyRef.current = false;
      }
    },
    [data.sessionId, persistMirror, userId],
  );

  useEffect(() => {
    if (rest.targetMs === null || rest.paused || !rest.endsAt) return;
    const timer = setInterval(() => {
      const remainingMs = Math.max(0, new Date(rest.endsAt!).getTime() - Date.now());
      setRest((current) => ({ ...current, remainingMs }));
      restRef.current = { ...restRef.current, remainingMs };
      if (remainingMs === 0 && !alarmConsumedRef.current) {
        alarmConsumedRef.current = true;
        void signalRestComplete();
        void applyRest({ kind: 'stop' });
      }
    }, 250);
    return () => clearInterval(timer);
  }, [applyRest, rest.endsAt, rest.paused, rest.targetMs]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void applyRest({ kind: 'pull' });
      else void flushAll();
    });
    return () => subscription.remove();
  }, [applyRest, flushAll]);

  useEffect(() => {
    return () => {
      if (mirrorWriteRef.current) clearTimeout(mirrorWriteRef.current);
      if (!finishedRef.current) void flushAll();
    };
  }, [flushAll]);

  const patchSets = useCallback(
    (updates: Map<string, Partial<ActiveSet>>) => {
      setExercises((current) =>
        current.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => {
            const patch = updates.get(set.id);
            if (!patch) return set;
            const next = { ...set, ...patch };
            snapshotsRef.current.set(set.id, {
              kg: next.kg,
              reps: next.reps,
              completed: next.completed,
            });
            schedulePersist(set.id);
            return next;
          }),
        })),
      );
      persistMirror();
    },
    [persistMirror, schedulePersist],
  );

  const changeSetValue = useCallback(
    (exercise: ActiveExercise, setId: string, field: 'kg' | 'reps', value: number | null) => {
      const updates = new Map<string, Partial<ActiveSet>>([[setId, { [field]: value }]]);
      const sorted = [...exercise.sets].sort((a, b) => a.setIndex - b.setIndex);
      const first = sorted[0];
      if (field === 'kg' && first?.id === setId && value !== null) {
        sorted.slice(1, 3).forEach((follower) => {
          if (follower.kg === null || follower.kg === first.kg) updates.set(follower.id, { kg: value });
        });
      }
      patchSets(updates);
    },
    [patchSets],
  );

  const restSecondsFor = useCallback(
    (exerciseId: string) => restDurationsRef.current[exerciseId] ?? defaultRestSeconds,
    [defaultRestSeconds],
  );

  const startRestForExercise = useCallback(
    (exerciseId: string) => applyRest({ kind: 'start', durationMs: restSecondsFor(exerciseId) * 1000 }),
    [applyRest, restSecondsFor],
  );

  const completeSet = useCallback(
    (exerciseId: string, setId: string, force?: boolean) => {
      const exercise = exercisesRef.current.find((item) => item.exerciseId === exerciseId);
      const set = exercise?.sets.find((item) => item.id === setId);
      if (!set) return;
      const completed = force ?? !set.completed;
      patchSets(new Map([[setId, { completed }]]));
      if (completed) void startRestForExercise(exerciseId);
    },
    [patchSets, startRestForExercise],
  );

  const blurSetValue = useCallback(
    (exerciseId: string, setId: string, field: 'kg' | 'reps') => {
      const storedSet = exercisesRef.current.flatMap((exercise) => exercise.sets).find((item) => item.id === setId);
      const snapshot = snapshotsRef.current.get(setId);
      const set = storedSet && snapshot ? { ...storedSet, ...snapshot } : storedSet;
      if (field === 'reps' && set && set.kg !== null && isLoggedSetReps(set.reps) && !set.completed) {
        completeSet(exerciseId, setId, true);
      } else {
        const timer = timersRef.current.get(setId);
        if (timer) clearTimeout(timer);
        timersRef.current.delete(setId);
        void persistOne(setId);
      }
    },
    [completeSet, persistOne],
  );

  const appendSet = useCallback(async (sessionExerciseId: string) => {
    if (addingSetRef.current.has(sessionExerciseId)) return;
    addingSetRef.current.add(sessionExerciseId);
    try {
      const set = await addSet(sessionExerciseId);
      setExercises((current) =>
        current.map((exercise) =>
          exercise.id === sessionExerciseId ? { ...exercise, sets: [...exercise.sets, set] } : exercise,
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause, 'Could not add set.'));
    } finally {
      addingSetRef.current.delete(sessionExerciseId);
    }
  }, []);

  const removeSet = useCallback(async (setId: string) => {
    if (removingSetRef.current.has(setId)) return;
    removingSetRef.current.add(setId);
    const previous = exercisesRef.current;
    setExercises((current) =>
      current.map((exercise) => ({ ...exercise, sets: exercise.sets.filter((set) => set.id !== setId) })),
    );
    try {
      const timer = timersRef.current.get(setId);
      if (timer) clearTimeout(timer);
      timersRef.current.delete(setId);
      await persistChainsRef.current.get(setId);
      await deleteSet(setId);
      snapshotsRef.current.delete(setId);
      persistMirror();
    } catch (cause) {
      setExercises(previous);
      setError(errorMessage(cause, 'Could not delete set.'));
    } finally {
      removingSetRef.current.delete(setId);
    }
  }, [persistMirror]);

  const setExerciseRestSeconds = useCallback(
    (exerciseId: string, seconds: number) => {
      const clamped = Math.min(3600, Math.max(10, Math.round(seconds)));
      setRestDurations((current) => ({ ...current, [exerciseId]: clamped }));
      restDurationsRef.current = { ...restDurationsRef.current, [exerciseId]: clamped };
      persistMirror();
    },
    [persistMirror],
  );

  const syncExercises = useCallback(
    (nextExercises: ActiveExercise[]) => {
      const nextSetIds = new Set(nextExercises.flatMap((exercise) => exercise.sets).map((set) => set.id));
      for (const setId of snapshotsRef.current.keys()) {
        if (nextSetIds.has(setId)) continue;
        snapshotsRef.current.delete(setId);
        const timer = timersRef.current.get(setId);
        if (timer) clearTimeout(timer);
        timersRef.current.delete(setId);
      }
      setExercises((current) => {
        const currentById = new Map(current.flatMap((exercise) => exercise.sets).map((set) => [set.id, set]));
        return nextExercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => currentById.get(set.id) ?? set),
        }));
      });
      persistMirror();
    },
    [persistMirror],
  );

  const finish = useCallback(async () => {
    setEnding(true);
    setError(null);
    try {
      if (!(await flushAll())) {
        throw new Error('Some sets could not be synced. Check your connection and try finishing again.');
      }
      await cancelRestNotification(restNotificationRef.current);
      await endActiveWorkout(userId, data.sessionId);
      finishedRef.current = true;
      if (mirrorWriteRef.current) clearTimeout(mirrorWriteRef.current);
      mirrorWriteRef.current = null;
      snapshotsRef.current.clear();
      await clearActiveMirror(data.sessionId).catch(() => undefined);
      return true;
    } catch (cause) {
      setError(errorMessage(cause, 'Could not finish workout.'));
      return false;
    } finally {
      setEnding(false);
    }
  }, [data.sessionId, flushAll, userId]);

  const summary = useMemo(() => {
    const allSets = exercises.flatMap((exercise) => exercise.sets);
    const completed = allSets.filter((set) => set.completed);
    return {
      setsDone: completed.length,
      totalSets: allSets.length,
      volume: completed.reduce((sum, set) => sum + (set.kg ?? 0) * (set.reps ?? 0), 0),
    };
  }, [exercises]);

  return {
    exercises,
    setExercises,
    rest,
    restDurations,
    defaultRestSeconds,
    elapsedMs,
    error,
    clearError: () => setError(null),
    ending,
    summary,
    changeSetValue,
    blurSetValue,
    completeSet,
    appendSet,
    removeSet,
    setExerciseRestSeconds,
    syncExercises,
    startRestForExercise,
    applyRest,
    flushAll,
    finish,
  };
}

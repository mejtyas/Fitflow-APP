import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useActiveWorkout } from '@/hooks/use-active-workout';
import { clearActiveMirror, writeActiveMirror } from '@/lib/active-mirror';
import { DEFAULT_WARMUP_SETTINGS } from '@/lib/warmup';
import {
  applyRestTimerOperation,
  endActiveWorkout,
  persistActiveSet,
  type ActiveWorkoutData,
} from '@/services/active-workout';

jest.mock('@/lib/active-mirror', () => ({
  readActiveMirror: jest.fn(async () => null),
  writeActiveMirror: jest.fn(async () => undefined),
  clearActiveMirror: jest.fn(async () => undefined),
}));

jest.mock('@/lib/preferences', () => ({
  getDefaultRestSeconds: jest.fn(async () => 150),
}));

jest.mock('@/lib/notifications', () => ({
  cancelRestNotification: jest.fn(async () => undefined),
  scheduleRestCompleteNotification: jest.fn(async () => 'notification-1'),
  signalRestComplete: jest.fn(async () => undefined),
}));

jest.mock('@/services/active-workout', () => ({
  addSet: jest.fn(),
  applyRestTimerOperation: jest.fn(async () => ({
    targetMs: null,
    remainingMs: 0,
    paused: false,
    endsAt: null,
  })),
  deleteSet: jest.fn(async () => undefined),
  endActiveWorkout: jest.fn(async () => undefined),
  persistActiveSet: jest.fn(async () => undefined),
}));

const data: ActiveWorkoutData = {
  sessionId: 'session-1',
  startedAt: new Date().toISOString(),
  workoutName: 'Push',
  rest: { targetMs: null, remainingMs: 0, paused: false, endsAt: null },
  availableExercises: [],
  exercises: [
    {
      id: 'session-exercise-1',
      exerciseId: 'exercise-1',
      orderIndex: 0,
      name: 'Bench press',
      description: null,
      pastSessions: [],
      warmupSettings: DEFAULT_WARMUP_SETTINGS,
      sets: [
        { id: 'set-1', setIndex: 0, kg: null, reps: null, completed: false },
        { id: 'set-2', setIndex: 1, kg: null, reps: null, completed: false },
        { id: 'set-3', setIndex: 2, kg: null, reps: null, completed: false },
      ],
    },
  ],
};

describe('active workout persistence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.mocked(persistActiveSet).mockResolvedValue(undefined);
    jest.mocked(endActiveWorkout).mockResolvedValue(undefined);
    jest.mocked(applyRestTimerOperation).mockResolvedValue({
      targetMs: null,
      remainingMs: 0,
      paused: false,
      endsAt: null,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('prefills follower weights and completes a valid set on reps blur', async () => {
    const { result } = await renderHook(() => useActiveWorkout(data, 'user-1'));
    expect(result.current).not.toBeNull();

    await act(() => result.current.changeSetValue(result.current.exercises[0]!, 'set-1', 'kg', 100));
    await waitFor(() => {
      expect(result.current.exercises[0]!.sets.map((set) => set.kg)).toEqual([100, 100, 100]);
    });

    await act(() => result.current.changeSetValue(result.current.exercises[0]!, 'set-1', 'reps', 8));
    await act(() => result.current.blurSetValue('exercise-1', 'set-1', 'reps'));
    await waitFor(() => expect(result.current.exercises[0]!.sets[0]!.completed).toBe(true));
  });

  test('debounces repeated edits to one latest network save', async () => {
    const { result } = await renderHook(() => useActiveWorkout(data, 'user-1'));
    expect(result.current).not.toBeNull();

    await act(() => {
      result.current.changeSetValue(result.current.exercises[0]!, 'set-1', 'reps', 8);
      result.current.changeSetValue(result.current.exercises[0]!, 'set-1', 'reps', 9);
      result.current.changeSetValue(result.current.exercises[0]!, 'set-1', 'reps', 10);
    });

    await waitFor(() => expect(persistActiveSet).toHaveBeenCalledTimes(1), { timeout: 1200 });
    expect(persistActiveSet).toHaveBeenLastCalledWith(
      'set-1',
      expect.objectContaining({ reps: 10 }),
    );
  });

  test('does not finish or purge a workout when set sync fails', async () => {
    jest.mocked(persistActiveSet).mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => useActiveWorkout(data, 'user-1'));
    expect(result.current).not.toBeNull();
    await act(() => result.current.changeSetValue(result.current.exercises[0]!, 'set-1', 'reps', 6));

    let finished = true;
    await act(async () => {
      finished = await result.current.finish();
    });

    expect(finished).toBe(false);
    expect(endActiveWorkout).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/could not.*sync|local copy/i);
  });

  test('clears recovery state and does not recreate it after a successful finish', async () => {
    const { result, unmount } = await renderHook(() => useActiveWorkout(data, 'user-1'));
    await act(() => result.current.changeSetValue(result.current.exercises[0]!, 'set-1', 'reps', 5));

    let finished = false;
    await act(async () => {
      finished = await result.current.finish();
    });
    await unmount();
    await act(() => jest.runOnlyPendingTimers());

    expect(finished).toBe(true);
    expect(endActiveWorkout).toHaveBeenCalledWith('user-1', 'session-1');
    expect(clearActiveMirror).toHaveBeenCalledWith('session-1');
    expect(writeActiveMirror).not.toHaveBeenCalled();
  });
});

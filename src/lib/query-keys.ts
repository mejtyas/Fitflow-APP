export const queryKeys = {
  all: ['lixo'] as const,
  dashboard: () => ['lixo', 'dashboard'] as const,
  exercises: () => ['lixo', 'exercises'] as const,
  exercise: (id: string) => ['lixo', 'exercise', id] as const,
  workouts: () => ['lixo', 'workouts'] as const,
  workoutEditor: (id: string | null) => ['lixo', 'workout-editor', id] as const,
  history: (page: number) => ['lixo', 'history', page] as const,
  historyDetail: (id: string) => ['lixo', 'history-detail', id] as const,
  stats: () => ['lixo', 'stats'] as const,
  feedback: () => ['lixo', 'feedback'] as const,
  active: (sessionId?: string | null) => ['lixo', 'active', sessionId] as const,
};

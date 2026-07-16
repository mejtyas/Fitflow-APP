export const queryKeys = {
  all: ['fitflow'] as const,
  dashboard: (userId: string) => ['fitflow', 'dashboard', userId] as const,
  exercises: (userId: string) => ['fitflow', 'exercises', userId] as const,
  exercise: (userId: string, id: string) => ['fitflow', 'exercise', userId, id] as const,
  workouts: (userId: string) => ['fitflow', 'workouts', userId] as const,
  workoutEditor: (userId: string, id: string | null) => ['fitflow', 'workout-editor', userId, id] as const,
  history: (userId: string, page: number) => ['fitflow', 'history', userId, page] as const,
  historyDetail: (userId: string, id: string) => ['fitflow', 'history-detail', userId, id] as const,
  stats: (userId: string) => ['fitflow', 'stats', userId] as const,
  feedback: () => ['fitflow', 'feedback'] as const,
  active: (userId: string, sessionId?: string | null) => ['fitflow', 'active', userId, sessionId] as const,
};

import { isLoggedSetReps } from '@/lib/validation';

export type LoggedSet = { kg: number | null; reps: number | null };

export function estimatedOneRmEpley(kg: number, reps: number): number | null {
  if (!(kg > 0) || !(reps >= 1) || !Number.isFinite(kg) || !Number.isFinite(reps)) {
    return null;
  }
  return kg * (1 + reps / 30);
}

export function setVolume(set: LoggedSet): number {
  return (set.kg ?? 0) * (isLoggedSetReps(set.reps) ? set.reps : 0);
}

export function sessionMetrics(sets: LoggedSet[]) {
  const logged = sets.filter((set) => isLoggedSetReps(set.reps));
  let maxKg = 0;
  let volume = 0;
  let estimatedOneRm = 0;
  for (const set of logged) {
    const kg = set.kg ?? 0;
    maxKg = Math.max(maxKg, kg);
    volume += setVolume(set);
    estimatedOneRm = Math.max(estimatedOneRm, estimatedOneRmEpley(kg, set.reps ?? 0) ?? 0);
  }
  return { maxKg, volume, estimatedOneRm };
}

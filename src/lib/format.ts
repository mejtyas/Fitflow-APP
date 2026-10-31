export function displayName(value: string | null | undefined, fallback = 'Workout'): string {
  return value?.trim() || fallback;
}

export function formatDurationMs(ms: number, includeSeconds = false): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (includeSeconds) {
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
      : `${minutes}:${String(remainder).padStart(2, '0')}`;
  }
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatRestMs(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatDate(iso: string, withTime = false): string {
  const date = new Date(iso);
  return withTime
    ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDaysSince(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const atNoon = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTime();
  const days = Math.round((atNoon(now) - atNoon(then)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}

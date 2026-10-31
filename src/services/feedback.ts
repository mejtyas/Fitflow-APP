import { createId, getDatabase, nowIso, transaction } from '@/lib/db';
import { limits } from '@/lib/validation';
import { LixoError } from '@/services/shared';

export type FeedbackItem = {
  id: string;
  body: string;
  solved: boolean;
  createdAt: string;
};

export async function fetchFeedback(): Promise<FeedbackItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; body: string; solved: number; created_at: string }>(
    'SELECT id, body, solved, created_at FROM app_feedback ORDER BY created_at DESC',
    [],
  );
  return rows.map((row) => ({ id: row.id, body: row.body, solved: row.solved === 1, createdAt: row.created_at }));
}

export async function createFeedback(bodyRaw: string) {
  const body = bodyRaw.trim();
  if (!body) throw new LixoError('Please enter a note.');
  if (body.length > limits.feedback) throw new LixoError('Note is too long (max 4,000 characters).');
  await transaction((db) =>
    db.runAsync('INSERT INTO app_feedback (id, body, solved, solved_at, created_at) VALUES (?, ?, 0, NULL, ?)', [
      createId(),
      body,
      nowIso(),
    ]),
  );
}

export async function setFeedbackSolved(id: string, solved: boolean) {
  await transaction((db) =>
    db.runAsync('UPDATE app_feedback SET solved = ?, solved_at = ? WHERE id = ?', [
      solved ? 1 : 0,
      solved ? nowIso() : null,
      id,
    ]),
  );
}


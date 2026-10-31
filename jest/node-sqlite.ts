/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';
import type { Database, SqlValue } from '@/lib/db';

/** In-memory SQLite (Node's built-in driver) behind the same async surface the app uses from expo-sqlite. */
export function createTestDatabase(): Database {
  const db = new DatabaseSync(':memory:');
  const plain = <T,>(row: unknown) => (row ? ({ ...(row as object) } as T) : null);
  return {
    async execAsync(source: string) {
      db.exec(source);
    },
    async runAsync(source: string, params: SqlValue[]) {
      const result = db.prepare(source).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getFirstAsync<T>(source: string, params: SqlValue[]) {
      return plain<T>(db.prepare(source).get(...params));
    },
    async getAllAsync<T>(source: string, params: SqlValue[]) {
      return db.prepare(source).all(...params).map((row) => plain<T>(row) as T);
    },
  };
}

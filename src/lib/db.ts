import * as SQLite from 'expo-sqlite';

export type SqlValue = string | number | null;

/** The subset of the expo-sqlite async API the services use (also implemented by the test adapter). */
export type Database = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
};

export const DATABASE_NAME = 'lixo.db';

/**
 * Ordered schema migrations. Each entry moves the database from version `index` to `index + 1`
 * (tracked in `PRAGMA user_version`). Never edit a shipped entry; append a new one instead.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE exercises (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    warmup_settings TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE workouts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE workout_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    default_sets INTEGER NOT NULL DEFAULT 2
  );
  CREATE INDEX workout_exercises_workout_idx ON workout_exercises(workout_id);

  CREATE TABLE workout_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    workout_id TEXT REFERENCES workouts(id) ON DELETE SET NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    next_logged_order INTEGER NOT NULL DEFAULT 0,
    rest_target_ms INTEGER,
    rest_ends_at TEXT,
    rest_paused_remaining_ms INTEGER
  );
  CREATE INDEX workout_sessions_ended_idx ON workout_sessions(ended_at, started_at);

  CREATE TABLE session_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    workout_session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    order_index INTEGER NOT NULL,
    first_logged_at TEXT,
    logged_order INTEGER
  );
  CREATE INDEX session_exercises_session_idx ON session_exercises(workout_session_id);
  CREATE INDEX session_exercises_exercise_idx ON session_exercises(exercise_id);

  CREATE TABLE session_sets (
    id TEXT PRIMARY KEY NOT NULL,
    session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
    set_index INTEGER NOT NULL,
    kg REAL,
    reps REAL,
    completed INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX session_sets_exercise_idx ON session_sets(session_exercise_id);

  CREATE TABLE session_rest_periods (
    id TEXT PRIMARY KEY NOT NULL,
    workout_session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    planned_target_ms INTEGER NOT NULL
  );
  CREATE INDEX session_rest_periods_session_idx ON session_rest_periods(workout_session_id);

  CREATE TABLE app_feedback (
    id TEXT PRIMARY KEY NOT NULL,
    body TEXT NOT NULL,
    solved INTEGER NOT NULL DEFAULT 0,
    solved_at TEXT,
    created_at TEXT NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrateDatabase(db: Database) {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(`Database version ${current} is newer than this app supports (${SCHEMA_VERSION}).`);
  }
  for (const [offset, migration] of MIGRATIONS.slice(current).entries()) {
    await db.execAsync('BEGIN IMMEDIATE;');
    try {
      await db.execAsync(migration);
      await db.execAsync(`PRAGMA user_version = ${current + offset + 1};`);
      await db.execAsync('COMMIT;');
    } catch (cause) {
      await db.execAsync('ROLLBACK;');
      throw cause;
    }
  }
}

let databasePromise: Promise<Database> | null = null;

async function openDatabase(): Promise<Database> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await migrateDatabase(db);
  return db as unknown as Database;
}

export function getDatabase(): Promise<Database> {
  databasePromise ??= openDatabase().catch((cause) => {
    databasePromise = null;
    throw cause;
  });
  return databasePromise;
}

/** Test hook: swap in a migrated in-memory database (or reset with `null`). */
export function setDatabaseForTesting(db: Database | null) {
  databasePromise = db ? migrateDatabase(db).then(() => db) : null;
  writeQueue = Promise.resolve();
}

let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs `task` inside an immediate transaction. Writes are serialized through one queue so two
 * transactions never interleave on the shared connection; every mutation must go through here.
 */
export function transaction<T>(task: (db: Database) => Promise<T>): Promise<T> {
  const run = async () => {
    const db = await getDatabase();
    await db.execAsync('BEGIN IMMEDIATE;');
    try {
      const result = await task(db);
      await db.execAsync('COMMIT;');
      return result;
    } catch (cause) {
      await db.execAsync('ROLLBACK;');
      throw cause;
    }
  };
  const next = writeQueue.then(run, run);
  writeQueue = next.catch(() => undefined);
  return next;
}

export function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}

/** RFC 4122 v4 identifier; the app validates ids with `isValidUuid`. */
export function createId() {
  const bytes = Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

#!/usr/bin/env python3
"""Create fictional screenshot data using the app's actual schema migrations."""
import datetime as dt
import pathlib
import re
import sqlite3
import sys
import uuid


def uid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'lixo-screenshot/' + name))


def seed(destination, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    iso = lambda date: date.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    source = (pathlib.Path(__file__).resolve().parents[1] / 'src/lib/db.ts').read_text()
    block = source.split('const MIGRATIONS: string[] = [', 1)[1].split('\n];', 1)[0]
    migrations = re.findall(r'`([^`]+)`', block)
    assert migrations and all('${' not in value for value in migrations)
    path = pathlib.Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError('Refusing to overwrite a database: ' + str(path))
    db = sqlite3.connect(path)
    db.execute('PRAGMA foreign_keys = ON')
    for migration in migrations:
        db.executescript(migration)
    db.execute(f'PRAGMA user_version = {len(migrations)}')
    names = ['Bench Press', 'Incline Dumbbell Press', 'Cable Fly', 'Lat Pulldown', 'Seated Cable Row', 'Back Squat', 'Romanian Deadlift']
    for name in names:
        db.execute('INSERT INTO exercises VALUES (?, ?, ?, NULL, ?)', (uid(name), name, 'Controlled tempo. Full range of motion.', iso(now - dt.timedelta(days=60))))
    routines = [('Push Day', names[:3]), ('Pull Day', names[3:5]), ('Leg Day', names[5:])]
    for title, movements in routines:
        db.execute('INSERT INTO workouts VALUES (?, ?, ?, ?)', (uid(title), title, iso(now - dt.timedelta(days=60)), iso(now)))
        for index, name in enumerate(movements):
            db.execute('INSERT INTO workout_exercises VALUES (?, ?, ?, ?, 3)', (uid(title + name), uid(title), uid(name), index))
    for index in range(16):
        title, movements = routines[index % 3]
        start = now - dt.timedelta(days=1 + index * 2, minutes=52)
        session = uid('past-' + str(index))
        db.execute('INSERT INTO workout_sessions (id, workout_id, started_at, ended_at, next_logged_order) VALUES (?, ?, ?, ?, ?)', (session, uid(title), iso(start), iso(start + dt.timedelta(minutes=48)), len(movements)))
        for order, name in enumerate(movements):
            exercise = uid(session + name)
            db.execute('INSERT INTO session_exercises VALUES (?, ?, ?, ?, ?, ?)', (exercise, session, uid(name), order, iso(start), order))
            for number in range(3):
                weight = 70 if name == 'Bench Press' else 30
                db.execute('INSERT INTO session_sets VALUES (?, ?, ?, ?, ?, 1)', (uid(exercise + str(number)), exercise, number, weight, 10 - number))
    session = uid('active')
    start = now - dt.timedelta(minutes=18)
    db.execute('INSERT INTO workout_sessions (id, workout_id, started_at, next_logged_order) VALUES (?, ?, ?, 1)', (session, uid('Push Day'), iso(start)))
    for order, name in enumerate(names[:3]):
        exercise = uid(session + name)
        db.execute('INSERT INTO session_exercises VALUES (?, ?, ?, ?, ?, ?)', (exercise, session, uid(name), order, iso(start) if order == 0 else None, 0 if order == 0 else None))
        for number in range(3):
            db.execute('INSERT INTO session_sets VALUES (?, ?, ?, ?, ?, ?)', (uid(exercise + str(number)), exercise, number, 72.5 if order == 0 else 30, 10, int(order == 0 and number < 2)))
    db.commit()
    assert db.execute('PRAGMA integrity_check').fetchone() == ('ok',)
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    db.close()
    return session


if __name__ == '__main__':
    print(seed(sys.argv[1]))

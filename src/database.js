import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT,
      google_sub TEXT UNIQUE,
      credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
      CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      digest TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      schema_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS surveys (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      source_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      audience TEXT NOT NULL,
      time_minutes INTEGER NOT NULL CHECK (time_minutes > 0),
      goal INTEGER NOT NULL CHECK (goal > 0),
      questions_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY,
      survey_id INTEGER NOT NULL REFERENCES surveys(id),
      respondent_id INTEGER NOT NULL REFERENCES users(id),
      answers_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      unlocked_at INTEGER,
      UNIQUE (survey_id, respondent_id)
    );

    CREATE INDEX IF NOT EXISTS surveys_by_owner ON surveys(owner_id, id);
  `);
  return db;
}

export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

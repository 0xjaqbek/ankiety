import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const schema = `
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

    CREATE TABLE IF NOT EXISTS user_activity (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      visits INTEGER NOT NULL DEFAULT 0,
      last_visit_at INTEGER,
      csv_downloads INTEGER NOT NULL DEFAULT 0
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

    CREATE INDEX IF NOT EXISTS responses_by_respondent ON responses(respondent_id, id);
    CREATE INDEX IF NOT EXISTS surveys_by_owner ON surveys(owner_id, id);
`;

export class DatabaseConfigurationError extends Error {}

export function databaseEnvironment(env = process.env) {
  const fixed = env.VERCEL_ENV === 'production'
    || env.ANKIETY_TURSO_DATABASE_URL !== undefined
    || env.ANKIETY_TURSO_AUTH_TOKEN !== undefined;
  const url = (fixed ? env.ANKIETY_TURSO_DATABASE_URL : env.TURSO_DATABASE_URL)?.trim();
  const authToken = (fixed ? env.ANKIETY_TURSO_AUTH_TOKEN : env.TURSO_AUTH_TOKEN)?.trim();
  if (fixed && (!url || !authToken)) {
    throw new DatabaseConfigurationError('Uzupełnij ANKIETY_TURSO_DATABASE_URL i ANKIETY_TURSO_AUTH_TOKEN dla stałej bazy aplikacji.');
  }
  return { url, authToken };
}

function operations(connection) {
  return {
    async one(sql, ...args) {
      const { rows } = await connection.execute({ sql, args });
      return rows[0] ?? null;
    },
    async all(sql, ...args) {
      const { rows } = await connection.execute({ sql, args });
      return rows;
    },
    async run(sql, ...args) {
      const result = await connection.execute({ sql, args });
      return { changes: result.rowsAffected, id: Number(result.lastInsertRowid) };
    },
  };
}

async function openDatabase(requireRemote) {
  const { url, authToken } = databaseEnvironment();
  let client;
  if (requireRemote || url || authToken) {
    if (!url || !authToken) {
      throw new DatabaseConfigurationError('Połącz bazę Turso w ustawieniach projektu i ponów wdrożenie.');
    }
    const { createClient } = await import('@libsql/client/web');
    client = createClient({ url: url.replace(/^libsql:\/\//, 'https://'), authToken });
  } else {
    const path = process.env.DATABASE_PATH || 'data/ankiety.sqlite';
    const location = path === ':memory:' ? 'file::memory:' : pathToFileURL(resolve(path)).href;
    if (path !== ':memory:') await mkdir(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    const { createClient } = await import('@libsql/client');
    client = createClient({ url: location, concurrency: 1 });
  }
  try {
    if (!url) await client.executeMultiple('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    await client.batch(schema.split(';').map(sql => sql.trim()).filter(Boolean), 'write');
  } catch (error) {
    client.close();
    throw error;
  }
  return {
    ...operations(client),
    async transaction(action) {
      const tx = await client.transaction('write');
      try {
        const result = await action(operations(tx));
        await tx.commit();
        return result;
      } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
      } finally {
        tx.close();
      }
    },
  };
}

export function databaseConnection(requireRemote) {
  let pending;
  return () => {
    pending ??= openDatabase(requireRemote).catch(error => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { databaseEnvironment, DatabaseConfigurationError } from '../src/database.js';

const integration = { TURSO_DATABASE_URL: 'libsql://deployment.example', TURSO_AUTH_TOKEN: 'deployment-token' };
const fixed = { ANKIETY_TURSO_DATABASE_URL: 'libsql://fixed.example', ANKIETY_TURSO_AUTH_TOKEN: 'fixed-token' };

test('Production uses the fixed database even when deployment credentials exist', () => {
  assert.deepEqual(databaseEnvironment({ VERCEL_ENV: 'production', ...integration, ...fixed }), {
    url: fixed.ANKIETY_TURSO_DATABASE_URL, authToken: fixed.ANKIETY_TURSO_AUTH_TOKEN,
  });
});

test('Production fails closed instead of falling back to a deployment database', () => {
  for (const partial of [{}, { ANKIETY_TURSO_DATABASE_URL: fixed.ANKIETY_TURSO_DATABASE_URL }, { ANKIETY_TURSO_AUTH_TOKEN: fixed.ANKIETY_TURSO_AUTH_TOKEN }]) {
    assert.throws(() => databaseEnvironment({ VERCEL_ENV: 'production', ...integration, ...partial }), DatabaseConfigurationError);
  }
});

test('Preview keeps the integration configuration', () => {
  assert.deepEqual(databaseEnvironment({ VERCEL_ENV: 'preview', ...integration }), {
    url: integration.TURSO_DATABASE_URL, authToken: integration.TURSO_AUTH_TOKEN,
  });
});

test('Local development keeps its SQLite fallback', () => {
  assert.deepEqual(databaseEnvironment({}), { url: undefined, authToken: undefined });
});

test('An incomplete fixed pair never mixes database credentials', () => {
  assert.throws(() => databaseEnvironment({ ...integration, ANKIETY_TURSO_DATABASE_URL: fixed.ANKIETY_TURSO_DATABASE_URL }), DatabaseConfigurationError);
});

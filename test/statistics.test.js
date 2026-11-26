import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { databaseConnection } from '../src/database.js';

test('Only the Google-linked creator can review visits, earned points and CSV downloads', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'ankiety-statistics-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const key of ['VERCEL_ENV', 'ANKIETY_TURSO_DATABASE_URL', 'ANKIETY_TURSO_AUTH_TOKEN', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']) {
    delete process.env[key];
  }
  process.env.DATABASE_PATH = join(directory, 'test.sqlite');
  process.env.COOKIE_SECURE = '0';
  const { createHandler } = await import('../src/handler.js');
  const db = await databaseConnection(false)();
  const now = Date.now();
  await db.run(`
    INSERT INTO users (id, name, email, google_sub) VALUES
      (1, 'Creator', 'jaqbek.eth@gmail.com', 'creator-test'),
      (2, 'Respondent', 'respondent@example.test', 'respondent-test'),
      (3, 'Inactive', 'inactive@example.test', 'inactive-test')
  `);
  for (const id of [1, 2]) {
    const digest = createHash('sha256').update(String(id).repeat(64)).digest('hex');
    await db.run('INSERT INTO sessions VALUES (?, ?, ?)', digest, id, now + 600_000);
  }
  await db.run(`
    INSERT INTO surveys VALUES (1, 2, 'source', 'Survey', '', '', 1, 1, ?, ?)
  `, JSON.stringify([{ id: 'q1', label: 'Pytanie', kind: 'short' }]), now);
  await db.run(`
    INSERT INTO surveys (id, owner_id, source_key, title, description, audience, time_minutes, goal, questions_json, created_at) VALUES
      (2, 2, 'second', 'Druga & kolejna', '', '', 1, 1, '[]', ?),
      (3, 1, 'creator', 'Ankieta twórcy', '', '', 1, 1, '[]', ?)
  `, now, now);
  await db.run('INSERT INTO responses VALUES (1, 1, 1, ?, ?, ?)', JSON.stringify({ q1: 'Tak' }), now, now);

  const server = createServer(createHandler()).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const request = (path, id) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    redirect: 'manual',
    headers: id ? { Cookie: `ankiety_session=${String(id).repeat(64)}` } : {},
  });

  assert.equal((await request('/statystyki')).status, 303);
  assert.equal((await request('/statystyki', 2)).status, 403);
  assert.doesNotMatch(await (await request('/', 2)).text(), /href="\/statystyki"/);
  assert.equal((await request('/moje', 2)).status, 200);
  assert.equal((await request('/moje/1/csv', 1)).status, 404);
  await db.run('UPDATE user_activity SET last_visit_at = ? WHERE user_id = 2', now - 31 * 60_000);
  const pages = await Promise.all([request('/', 2), request('/moje', 2)]);
  assert.deepEqual(pages.map(page => page.status), [200, 200]);
  for (let i = 0; i < 2; i++) {
    const csv = await request('/moje/1/csv', 2);
    assert.equal(csv.status, 200);
    assert.equal(await csv.text(), 'Pytanie\r\nTak\r\n');
  }

  const statistics = await request('/statystyki', 1);
  assert.equal(statistics.status, 200);
  assert.equal(statistics.headers.get('cache-control'), 'no-store');
  const html = await statistics.text();
  assert.match(html, /href="\/statystyki" aria-current="page"/);
  assert.match(html, /Creator<small>jaqbek\.eth@gmail\.com<\/small><ul[^>]*><li>Ankieta twórcy<\/li><\/ul><\/th>\s*<td>1<\/td><td>1<\/td><td>0<\/td>/);
  assert.match(html, /Inactive<small>inactive@example\.test<\/small><\/th>\s*<td>0<\/td><td>0<\/td><td>0<\/td>/);
  assert.match(html, /Respondent<small>respondent@example\.test<\/small><ul[^>]*><li>Druga &amp; kolejna<\/li><li>Survey<\/li><\/ul><\/th>\s*<td>2<\/td><td>0<\/td><td>2<\/td>/);

  await db.run("UPDATE users SET google_sub = NULL, password_hash = 'test-only' WHERE id = 1");
  assert.equal((await request('/statystyki', 1)).status, 403);
});

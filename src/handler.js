import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { databaseConnection, DatabaseConfigurationError } from './database.js';
import { importGoogleForm, ImportError } from './google-forms.js';
import { answerQuestions } from './survey-questions.js';
import { beginGoogleAuth, googleConfigurationError, googleEnabled, googleIdentity } from './google-auth.js';
import {
  authView, dashboardView, editSurveyView, errorView, guideView, importView, mineView, previewView, resultsView, takeView,
} from './views.js';

const deriveKey = promisify(scrypt);
const sessionAge = 14 * 24 * 60 * 60 * 1000;
const draftAge = 24 * 60 * 60 * 1000;
const maxRequestBytes = 1_048_576;
const secureCookies = process.env.COOKIE_SECURE !== undefined
  ? process.env.COOKIE_SECURE === '1'
  : process.env.NODE_ENV === 'production';
const cookieNames = {
  session: secureCookies ? '__Host-ankiety_session' : 'ankiety_session',
  csrf: secureCookies ? '__Host-ankiety_csrf' : 'ankiety_csrf',
  google: secureCookies ? '__Host-ankiety_oauth' : 'ankiety_oauth',
};
const tokenPattern = /^[0-9a-f]{64}$/;
const messages = {
  answered: 'Dziękujemy za wypełnienie ankiety. Na Twoje konto trafił 1 punkt.',
  published: 'Ankieta została opublikowana. Inne osoby mogą już ją wypełniać.',
  edited: 'Zmiany w ankiecie zostały zapisane.',
  'questions-updated': 'Pytania z Google Forms zostały zaktualizowane.',
  unlocked: 'Odpowiedzi zostały odblokowane. Możesz je teraz przeczytać lub pobrać.',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function randomToken() {
  return randomBytes(32).toString('hex');
}

function digest(token) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieValue(req, key) {
  return (req.headers.cookie || '').split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${key}=`))?.slice(key.length + 1) || '';
}

function setCookie(res, key, value, maxAge) {
  res.appendHeader('Set-Cookie', `${key}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureCookies ? '; Secure' : ''}`);
}

function getUser(req, db) {
  const token = cookieValue(req, cookieNames.session);
  if (!tokenPattern.test(token)) return null;

  return db.one(`
    SELECT users.id, users.name, users.email, users.credits
    FROM users JOIN sessions ON sessions.user_id = users.id
    WHERE sessions.digest = ? AND sessions.expires_at > ?
  `, digest(token), Date.now());
}

async function signIn(req, res, db, userId) {
  const existing = cookieValue(req, cookieNames.session);
  const token = randomToken();
  await db.transaction(async tx => {
    if (tokenPattern.test(existing)) await tx.run('DELETE FROM sessions WHERE digest = ?', digest(existing));
    await tx.run('DELETE FROM sessions WHERE expires_at <= ?', Date.now());
    await tx.run('INSERT INTO sessions (digest, user_id, expires_at) VALUES (?, ?, ?)', digest(token), userId, Date.now() + sessionAge);
  });
  setCookie(res, cookieNames.session, token, sessionAge / 1000);
  setCookie(res, cookieNames.csrf, randomToken(), sessionAge / 1000);
}

function safeEqual(first, second) {
  if (!tokenPattern.test(first) || !tokenPattern.test(second)) return false;
  return timingSafeEqual(Buffer.from(first, 'hex'), Buffer.from(second, 'hex'));
}

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = await deriveKey(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${hash.toString('hex')}`;
}

const loginAttempts = new Map();
const loginWindow = 15 * 60 * 1000;

function allowAuthAttempt(ip) {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (entry.until <= now) loginAttempts.delete(key);
  }
  const entry = loginAttempts.get(ip) || { count: 0, until: now + loginWindow };
  if (entry.count >= 25) return false;
  entry.count++;
  loginAttempts.set(ip, entry);
  return true;
}

function reply(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(body);
}

function redirect(res, target) {
  res.writeHead(303, { Location: target });
  res.end();
}

async function postData(req, csrf) {
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type'] || '')) {
    throw new HttpError(415, 'Ten formularz ma nieobsługiwany format.');
  }
  if (Number(req.headers['content-length']) > maxRequestBytes) {
    throw new HttpError(413, 'Przesłany formularz jest za duży.');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxRequestBytes) throw new HttpError(413, 'Przesłany formularz jest za duży.');
    chunks.push(chunk);
  }

  const values = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  if (!safeEqual(values.get('_csrf'), csrf)) {
    throw new HttpError(403, 'Odśwież stronę i spróbuj ponownie.');
  }
  return values;
}

function int(value, min, max) {
  if (!/^\d+$/.test(value || '')) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

function validation(questions, values) {
  const answers = {};
  const errors = {};
  for (const question of questions) {
    const name = `q_${question.id}`;
    const submitted = values.getAll(name).filter(value => value.trim() !== '');
    if (!submitted.length) {
      if (question.required) errors[question.id] = 'Uzupełnij to pole.';
      continue;
    }

    if (question.kind === 'short' || question.kind === 'long') {
      const limit = question.kind === 'short' ? 1000 : 5000;
      if (submitted.length !== 1 || submitted[0].length > limit) {
        errors[question.id] = `Wpisz maksymalnie ${limit} znaków.`;
      } else {
        answers[question.id] = submitted[0].trim();
      }
      continue;
    }

    const checkbox = question.kind === 'checkbox';
    const options = submitted.map(value => question.hasOther && value === 'other' ? value : int(value, 0, question.choices.length - 1));
    if ((!checkbox && options.length !== 1) || options.includes(null) || options.length !== new Set(options).size) {
      errors[question.id] = 'Wybierz odpowiedź spośród dostępnych opcji.';
      continue;
    }
    const other = values.getAll(`${name}_other`);
    if (options.includes('other') && (other.length !== 1 || !other[0].trim() || other[0].length > 1000)) {
      errors[question.id] = 'Wpisz własną odpowiedź przy opcji „Inne”. Możesz użyć maksymalnie 1000 znaków.';
      continue;
    }
    const labels = options.map(option => option === 'other' ? other[0].trim() : question.choices[option]);
    answers[question.id] = checkbox ? labels : labels[0];
  }
  return { answers, errors };
}

function availableSurveys(db, userId) {
  return db.all(`
    SELECT surveys.id, surveys.title, surveys.audience
    FROM surveys
    WHERE owner_id <> ?
      AND goal > (SELECT COUNT(*) FROM responses WHERE survey_id = surveys.id)
      AND NOT EXISTS (SELECT 1 FROM responses WHERE survey_id = surveys.id AND respondent_id = ?)
    ORDER BY surveys.id DESC
  `, userId, userId);
}

const surveyCounts = `
  SELECT surveys.*,
    (SELECT COUNT(*) FROM responses WHERE survey_id = surveys.id) AS total,
    (SELECT COUNT(*) FROM responses WHERE survey_id = surveys.id AND unlocked_at IS NOT NULL) AS unlocked
  FROM surveys
`;

async function ownedSurvey(db, userId, surveyId) {
  const survey = await db.one(`${surveyCounts} WHERE surveys.id = ? AND owner_id = ?`, surveyId, userId);
  if (!survey) throw new HttpError(404, 'Nie znaleziono tej ankiety w Twoim koncie.');
  return survey;
}

async function resultData(db, userId, surveyId, requestPage) {
  const survey = await ownedSurvey(db, userId, surveyId);
  const questions = answerQuestions(JSON.parse(survey.questions_json));
  const page = Math.min(int(requestPage, 1, 500) || 1, Math.ceil(survey.unlocked / 20) || 1);
  const rows = await db.all(`
    SELECT answers_json FROM responses
    WHERE survey_id = ? AND unlocked_at IS NOT NULL
    ORDER BY id LIMIT 20 OFFSET ?
  `, surveyId, (page - 1) * 20);
  const responses = rows.map(row => ({ answers: JSON.parse(row.answers_json) }));
  return { questions, survey, page, responses };
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[\t\r\n]/.test(text) || /^[\s\u200B-\u200D\uFEFF]*[=+@\-]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function exportCsv(res, db, userId, surveyId) {
  const survey = await ownedSurvey(db, userId, surveyId);
  if (!survey.unlocked) throw new HttpError(409, 'Odblokuj przynajmniej jedną odpowiedź, aby pobrać CSV.');

  const questions = answerQuestions(JSON.parse(survey.questions_json));
  const { lastId } = await db.one('SELECT MAX(id) AS lastId FROM responses WHERE survey_id = ? AND unlocked_at IS NOT NULL', surveyId);
  const query = `
    SELECT id, answers_json FROM responses
    WHERE survey_id = ? AND unlocked_at IS NOT NULL AND id > ? AND id <= ?
    ORDER BY id LIMIT 20
  `;

  async function* rows() {
    yield `\uFEFF${questions.map(question => csvCell(question.label)).join(',')}\r\n`;
    let cursor = 0;
    while (cursor < lastId) {
      const batch = await db.all(query, surveyId, cursor, lastId);
      if (!batch.length) break;
      for (const row of batch) {
        const answers = JSON.parse(row.answers_json);
        const values = questions.map(question => {
          const value = answers[question.id];
          return csvCell(Array.isArray(value) ? value.join(', ') : value);
        });
        cursor = row.id;
        yield `${values.join(',')}\r\n`;
      }
    }
  }

  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="ankieta-${surveyId}.csv"`,
  });
  await pipeline(Readable.from(rows(), { objectMode: false }), res);
}

async function getDraft(db, draftId, userId) {
  const draft = await db.one('SELECT schema_json FROM drafts WHERE id = ? AND owner_id = ? AND created_at > ?', draftId, userId, Date.now() - draftAge);
  if (!draft) throw new HttpError(404, 'Podgląd importu wygasł. Dodaj link jeszcze raz.');
  return JSON.parse(draft.schema_json);
}

async function googleRoute(req, res, url, context) {
  if (context.user) return redirect(res, '/');
  if (url.pathname === '/google/start') {
    const { state, verifier, url: target } = beginGoogleAuth();
    setCookie(res, cookieNames.google, `${state}.${verifier}`, 600);
    return redirect(res, target);
  }

  const [state, verifier] = cookieValue(req, cookieNames.google).split('.');
  setCookie(res, cookieNames.google, '', 0);
  const code = url.searchParams.get('code');
  const invalid = errors => reply(res, 400, authView({ ...context, mode: 'login', errors }));
  if (!code || code.length > 2048 || !safeEqual(state, url.searchParams.get('state')) || !/^[\w-]{43}$/.test(verifier || '')) {
    return invalid('Nie udało się potwierdzić logowania. Spróbuj ponownie.');
  }

  let identity;
  try {
    identity = await googleIdentity(code, verifier);
  } catch {
    return invalid('Połączenie z Google się nie powiodło. Spróbuj ponownie.');
  }
  if (!identity) return invalid('Google nie potwierdziło tożsamości. Użyj konta z potwierdzonym adresem e-mail.');

  const userId = await context.db.transaction(async tx => {
    const existing = await tx.one('SELECT id FROM users WHERE google_sub = ?', identity.subject);
    if (existing) return existing.id;
    const account = await tx.run(`
      INSERT INTO users (name, email, google_sub) VALUES (?, ?, ?)
      ON CONFLICT(email) DO NOTHING
    `, identity.name, identity.email, identity.subject);
    return account.changes ? account.id : null;
  });
  if (!userId) return invalid('Konto z tym adresem już istnieje i nie jest połączone z Google.');
  await signIn(req, res, context.db, userId);
  redirect(res, '/');
}

async function authRoute(req, res, path, context) {
  if (context.user) return redirect(res, '/');
  const mode = path === '/rejestracja' ? 'register' : 'login';
  if (req.method === 'GET') return reply(res, 200, authView({ ...context, mode }));
  if (googleEnabled) throw new HttpError(405, 'W tej aplikacji logowanie odbywa się przez Google.');

  const form = await postData(req, context.csrf);
  const email = (form.get('email') || '').trim().toLowerCase();
  const name = (form.get('name') || '').trim();
  const password = form.get('password') || '';
  const invalid = (status, errors) => reply(res, status, authView({ ...context, mode, errors, values: { name, email } }));
  if (!allowAuthAttempt(req.socket.remoteAddress)) return invalid(429, 'Zbyt wiele prób. Spróbuj za 15 minut.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 128) {
    return invalid(422, 'Sprawdź adres e-mail i hasło.');
  }

  if (mode === 'register') {
    if (!name || name.length > 70 || password.length < 8) return invalid(422, 'Podaj imię i hasło z co najmniej 8 znakami.');
    const passwordHash = await hashPassword(password);
    const result = await context.db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING', name, email, passwordHash);
    if (!result.changes) return invalid(409, 'Nie udało się utworzyć konta. Jeśli masz już konto, zaloguj się.');
    await signIn(req, res, context.db, result.id);
  } else {
    const existing = await context.db.one('SELECT id, password_hash FROM users WHERE email = ?', email);
    const stored = existing?.password_hash?.split(':') || ['0'.repeat(32), '0'.repeat(128)];
    const actual = (await hashPassword(password, stored[0])).split(':')[1];
    if (!existing?.password_hash || !timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(stored[1], 'hex'))) {
      return invalid(401, 'Adres e-mail lub hasło są nieprawidłowe.');
    }
    await signIn(req, res, context.db, existing.id);
  }
  redirect(res, '/');
}

function importPublishedForm(link) {
  if (!link || link.length > 2048) throw new ImportError('Wklej link do opublikowanego formularza Google.');
  return importGoogleForm(link);
}

async function importRoute(req, res, context) {
  if (req.method === 'GET') return reply(res, 200, importView(context));

  const form = await postData(req, context.csrf);
  const link = (form.get('link') || '').trim();
  try {
    const schema = await importPublishedForm(link);
    if (await context.db.one('SELECT 1 FROM surveys WHERE source_key = ?', schema.sourceKey)) {
      throw new ImportError('Ten formularz został już opublikowany w aplikacji.');
    }
    const draft = randomBytes(16).toString('hex');
    await context.db.transaction(async tx => {
      await tx.run('DELETE FROM drafts WHERE created_at <= ? OR owner_id = ?', Date.now() - draftAge, context.user.id);
      await tx.run('INSERT INTO drafts (id, owner_id, schema_json, created_at) VALUES (?, ?, ?, ?)', draft, context.user.id, JSON.stringify(schema), Date.now());
    });
    redirect(res, `/dodaj/${draft}`);
  } catch (error) {
    if (!(error instanceof ImportError)) throw error;
    reply(res, 422, importView({ ...context, link, error: error.message }));
  }
}

function surveySettings(form) {
  return {
    title: (form.get('title') || '').trim(),
    audience: (form.get('audience') || '').trim(),
    goal: form.get('goal'),
  };
}

function validSurveySettings(values) {
  return values.title && values.title.length <= 200 && values.audience && values.audience.length <= 200
    && int(values.goal, 1, 10_000);
}

const settingsError = 'Sprawdź tytuł, grupę odbiorców i liczbę odpowiedzi.';

async function publishRoute(req, res, draft, context) {
  const schema = await getDraft(context.db, draft, context.user.id);
  if (req.method === 'GET') return reply(res, 200, previewView({ ...context, draft, schema }));

  const form = await postData(req, context.csrf);
  const values = surveySettings(form);
  const invalid = error => reply(res, 422, previewView({ ...context, draft, schema, values, error }));
  if (!validSurveySettings(values)) return invalid(settingsError);

  const published = await context.db.transaction(async tx => {
    await getDraft(tx, draft, context.user.id);
    // time_minutes is required by existing databases.
    const result = await tx.run(`
      INSERT INTO surveys (owner_id, source_key, title, description, audience, time_minutes, goal, questions_json, created_at)
      VALUES (?, ?, ?, ?, ?, 5, ?, ?, ?) ON CONFLICT(source_key) DO NOTHING
    `, context.user.id, schema.sourceKey, values.title, schema.description, values.audience,
      Number(values.goal), JSON.stringify(schema.questions), Date.now());
    if (!result.changes) return false;
    await tx.run('DELETE FROM drafts WHERE id = ?', draft);
    return true;
  });
  if (!published) return invalid('Ten formularz jest już opublikowany w aplikacji.');
  redirect(res, '/moje?status=published');
}

async function editSurveyRoute(req, res, surveyId, context, message) {
  const survey = await ownedSurvey(context.db, context.user.id, surveyId);
  if (req.method === 'GET') return reply(res, 200, editSurveyView({ ...context, survey, message }));

  const form = await postData(req, context.csrf);
  const values = { ...surveySettings(form), description: (form.get('description') || '').trim() };
  const invalid = error => reply(res, 422, editSurveyView({ ...context, survey, values, error }));
  if (!validSurveySettings(values)) return invalid(settingsError);
  if (values.description.length > 50_000 && values.description !== survey.description) {
    return invalid('Opis może mieć maksymalnie 50 000 znaków.');
  }

  await context.db.run(`
    UPDATE surveys SET title = ?, description = ?, audience = ?, goal = ?
    WHERE id = ? AND owner_id = ?
  `, values.title, values.description, values.audience, Number(values.goal), surveyId, context.user.id);
  redirect(res, '/moje?status=edited');
}

async function updateQuestionsRoute(req, res, surveyId, context) {
  const survey = await ownedSurvey(context.db, context.user.id, surveyId);
  const form = await postData(req, context.csrf);
  const link = (form.get('link') || '').trim();
  const lockedError = 'Pytania można zaktualizować przed przesłaniem pierwszej odpowiedzi.';
  const invalid = (status, questionsError, current = survey) =>
    reply(res, status, editSurveyView({ ...context, survey: current, link, questionsError }));
  if (survey.total) return invalid(409, lockedError);

  let schema;
  try {
    schema = await importPublishedForm(link);
  } catch (error) {
    if (!(error instanceof ImportError)) throw error;
    return invalid(422, error.message);
  }
  if (schema.sourceKey !== survey.source_key) {
    return invalid(422, 'Wklej link do tego samego formularza Google, z którego dodano ankietę.');
  }

  const result = await context.db.run(`
    UPDATE surveys SET questions_json = ?
    WHERE id = ? AND owner_id = ?
      AND NOT EXISTS (SELECT 1 FROM responses WHERE survey_id = surveys.id)
  `, JSON.stringify(schema.questions), surveyId, context.user.id);
  if (!result.changes) {
    return invalid(409, lockedError, await ownedSurvey(context.db, context.user.id, surveyId));
  }
  redirect(res, `/moje/${surveyId}/edytuj?status=questions-updated`);
}

async function answerState(db, surveyId, userId) {
  const survey = await db.one(`${surveyCounts} WHERE surveys.id = ?`, surveyId);
  if (!survey) throw new HttpError(404, 'Tej ankiety nie udało się znaleźć.');
  if (survey.owner_id === userId) throw new HttpError(403, 'Punkty możesz zdobywać za ankiety innych osób.');
  if (await db.one('SELECT 1 FROM responses WHERE survey_id = ? AND respondent_id = ?', surveyId, userId)) {
    throw new HttpError(409, 'Ta ankieta została już przez Ciebie wypełniona.');
  }
  if (survey.total >= survey.goal) throw new HttpError(409, 'Ta ankieta zebrała już potrzebną liczbę odpowiedzi.');
  return survey;
}

async function takeRoute(req, res, surveyId, context) {
  const survey = await answerState(context.db, surveyId, context.user.id);
  const view = (status, current, details = {}) => reply(res, status, takeView({
    ...context, survey: current, questions: JSON.parse(current.questions_json),
    questionVersion: digest(current.questions_json), ...details,
  }));
  const changed = current => view(409, current, { error: 'Ankieta została zaktualizowana. Sprawdź pytania i wypełnij formularz ponownie.' });
  if (req.method === 'GET') return view(200, survey);

  const values = await postData(req, context.csrf);
  if (values.get('_questions') !== digest(survey.questions_json)) return changed(survey);
  const { answers, errors } = validation(answerQuestions(JSON.parse(survey.questions_json)), values);
  if (Object.keys(errors).length || !Object.keys(answers).length) {
    const error = Object.keys(errors).length ? 'Uzupełnij zaznaczone pytania.' : 'Udziel przynajmniej jednej odpowiedzi.';
    return view(422, survey, { values, errors, error });
  }

  const updated = await context.db.transaction(async tx => {
    const current = await answerState(tx, surveyId, context.user.id);
    if (current.questions_json !== survey.questions_json) return current;
    await tx.run('INSERT INTO responses (survey_id, respondent_id, answers_json, created_at) VALUES (?, ?, ?, ?)', surveyId, context.user.id, JSON.stringify(answers), Date.now());
    await tx.run('UPDATE users SET credits = credits + 1 WHERE id = ?', context.user.id);
    return null;
  });
  if (updated) return changed(updated);
  redirect(res, '/?status=answered');
}

async function unlockRoute(req, res, surveyId, context) {
  const form = await postData(req, context.csrf);
  const amount = int(form.get('amount'), 1, 10_000);
  const error = await context.db.transaction(async tx => {
    const survey = await ownedSurvey(tx, context.user.id, surveyId);
    if (!amount || amount > survey.total - survey.unlocked) return 'Wybierz liczbę dostępną do odblokowania.';
    const payment = await tx.run('UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?', amount, context.user.id, amount);
    if (!payment.changes) return 'Masz za mało punktów. Wypełnij kolejną ankietę i spróbuj ponownie.';

    const updated = await tx.run(`
      UPDATE responses SET unlocked_at = ?
      WHERE id IN (
        SELECT id FROM responses WHERE survey_id = ? AND unlocked_at IS NULL ORDER BY id LIMIT ?
      )
    `, Date.now(), surveyId, amount);
    if (updated.changes !== amount) throw new Error('Incomplete unlock.');
    return null;
  });

  if (error) {
    return reply(res, 422, resultsView({ ...context, user: await getUser(req, context.db), ...await resultData(context.db, context.user.id, surveyId), error }));
  }
  redirect(res, `/moje/${surveyId}?status=unlocked`);
}

async function handle(req, res, connect, context) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (!['GET', 'POST'].includes(req.method)) throw new HttpError(405, 'Ta metoda jest niedostępna.');
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  if (req.method === 'GET' && path === '/assets/app.css') {
    const css = await readFile(new URL('../public/assets/app.css', import.meta.url));
    return reply(res, 200, css, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
  }

  if (req.method === 'GET' && path === '/instrukcja') return reply(res, 200, guideView());
  if (req.method === 'GET' && /^\/assets\/instrukcja\/[a-z]+\.jpg$/.test(path)) {
    try {
      const screenshot = await readFile(new URL(`../public${path}`, import.meta.url));
      return reply(res, 200, screenshot, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=300' });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      throw new HttpError(404, 'Nie znaleziono tego obrazu.');
    }
  }

  const existingCsrf = cookieValue(req, cookieNames.csrf);
  const csrf = tokenPattern.test(existingCsrf) ? existingCsrf : randomToken();
  if (csrf !== existingCsrf) setCookie(res, cookieNames.csrf, csrf, sessionAge / 1000);
  const db = await connect();
  const user = await getUser(req, db);
  Object.assign(context, { user, csrf, googleEnabled, db });

  if (!user && googleConfigurationError) throw new HttpError(503, googleConfigurationError);

  if (googleEnabled && req.method === 'GET' && ['/google/start', '/google/callback'].includes(path)) {
    return googleRoute(req, res, url, context);
  }

  if (path === '/logowanie' || path === '/rejestracja') return authRoute(req, res, path, context);
  if (!user) {
    if (req.method === 'GET' && path === '/') return reply(res, 200, authView({ ...context, mode: 'register' }));
    return redirect(res, '/logowanie');
  }

  const status = url.searchParams.get('status');
  const message = Object.hasOwn(messages, status) ? messages[status] : undefined;
  if (req.method === 'POST' && path === '/wyloguj') {
    await postData(req, csrf);
    await db.run('DELETE FROM sessions WHERE digest = ?', digest(cookieValue(req, cookieNames.session)));
    setCookie(res, cookieNames.session, '', 0);
    setCookie(res, cookieNames.csrf, '', 0);
    return redirect(res, '/logowanie');
  }
  if (path === '/dodaj') return importRoute(req, res, context);

  const draft = path.match(/^\/dodaj\/([a-f0-9]{32})$/);
  if (draft) return publishRoute(req, res, draft[1], context);

  const take = path.match(/^\/ankiety\/(\d+)$/);
  if (take) return takeRoute(req, res, int(take[1], 1, Number.MAX_SAFE_INTEGER), context);

  const own = path.match(/^\/moje\/(\d+)(?:\/(csv|odblokuj|edytuj|pytania))?$/);
  if (own) {
    const surveyId = int(own[1], 1, Number.MAX_SAFE_INTEGER);
    if (own[2] === 'edytuj') return editSurveyRoute(req, res, surveyId, context, message);
    if (req.method === 'POST' && own[2] === 'pytania') return updateQuestionsRoute(req, res, surveyId, context);
    if (req.method === 'POST' && own[2] === 'odblokuj') return unlockRoute(req, res, surveyId, context);
    if (req.method === 'GET' && own[2] === 'csv') return exportCsv(res, db, user.id, surveyId);
    if (req.method === 'GET' && !own[2]) {
      return reply(res, 200, resultsView({ ...context, ...await resultData(db, user.id, surveyId, url.searchParams.get('strona')), message }));
    }
  }
  if (req.method === 'GET' && path === '/moje') {
    const [surveys, draft] = await Promise.all([
      db.all(`${surveyCounts} WHERE owner_id = ? ORDER BY surveys.id DESC`, user.id),
      db.one(`
        SELECT id, json_extract(schema_json, '$.title') AS title
        FROM drafts
        WHERE owner_id = ? AND created_at > ?
        ORDER BY created_at DESC LIMIT 1
      `, user.id, Date.now() - draftAge),
    ]);
    return reply(res, 200, mineView({ ...context, surveys, draft, message }));
  }
  if (req.method === 'GET' && path === '/') {
    const query = (url.searchParams.get('q') || '').trim().slice(0, 120);
    const needle = query.toLocaleLowerCase('pl');
    const [available, completed] = await Promise.all([
      availableSurveys(db, user.id),
      db.all(`
        SELECT surveys.title
        FROM responses JOIN surveys ON surveys.id = responses.survey_id
        WHERE responses.respondent_id = ?
        ORDER BY responses.id DESC
      `, user.id),
    ]);
    const surveys = available.filter(survey =>
      `${survey.title} ${survey.audience}`.toLocaleLowerCase('pl').includes(needle));
    return reply(res, 200, dashboardView({ ...context, surveys, completed, query, message }));
  }

  throw new HttpError(404, 'Strona, której szukasz, jest niedostępna.');
}

export function createHandler({ requireRemote = false } = {}) {
  const connect = databaseConnection(requireRemote);
  return async (req, res) => {
    const context = {};
    try {
      await handle(req, res, connect, context);
    } catch (error) {
      const config = error instanceof DatabaseConfigurationError;
      const expected = error instanceof HttpError;
      if (!expected && !config) console.error(error);
      if (res.headersSent) return res.destroy();
      const title = config ? 'Skonfiguruj bazę danych' : expected ? 'Nie można wykonać tej czynności' : 'Wystąpił błąd';
      const message = expected || config ? error.message : 'Spróbuj ponownie za chwilę.';
      const status = config ? 503 : expected ? error.status : 500;
      reply(res, status, errorView({ ...context, title, message }));
    }
  };
}

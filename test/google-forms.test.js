import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importGoogleForm } from '../src/google-forms.js';

const respondentLink = 'https://docs.google.com/forms/d/e/test-public-form/viewform';

test('imports a built-in Other field for single and multiple choice questions', async t => {
  const items = [
    [11, 'Wykształcenie', null, 2, [[101, [['Licencjat'], ['', null, null, null, 1]], 1]]],
    [12, 'Przeszkody', null, 4, [[102, [['Brak czasu'], [null, null, null, null, 1]], 0]]],
    [13, 'Zwykłe opcje', null, 2, [[103, [['Inne'], ['Brak']], 1]]],
  ];
  const schema = ['', items];
  schema[8] = 'Ankieta testowa';
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(`<script>FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify([null, schema])};</script>`));

  const { questions } = await importGoogleForm(respondentLink);
  assert.deepEqual(
    questions.map(({ kind, choices, hasOther }) => ({ kind, choices, hasOther })),
    [
      { kind: 'radio', choices: ['Licencjat'], hasOther: true },
      { kind: 'checkbox', choices: ['Brak czasu'], hasOther: true },
      { kind: 'radio', choices: ['Inne', 'Brak'], hasOther: undefined },
    ],
  );
});

test('preserves radio-grid columns, row IDs, and required flags', async t => {
  const row = (id, label, required) => [
    id, [['Nigdy'], ['Zawsze']], required, [label], null, null, null, null, null, null, null, [0],
  ];
  const schema = ['', [[11, 'Jak często?', 'Zaznacz odpowiedź w każdym wierszu.', 7,
    [row(101, 'Czuję się zmęczony', 1), row(102, 'Mam czas na przerwę', 0)]]]];
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(`<script>FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify([null, schema])};</script>`));
  const { questions } = await importGoogleForm(respondentLink);
  assert.deepEqual(questions, [{
    id: 'grid-11', kind: 'grid', label: 'Jak często?', description: 'Zaznacz odpowiedź w każdym wierszu.',
    choices: ['Nigdy', 'Zawsze'],
    rows: [
      { id: '101', label: 'Czuję się zmęczony', required: true },
      { id: '102', label: 'Mam czas na przerwę', required: false },
    ],
  }]);
});

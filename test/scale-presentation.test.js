import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scalePresentation } from '../src/survey-questions.js';

const choices = ['1', '2', '3', '4', '5'];

test('puts the scale from the question under the matching numbers', () => {
  const label = 'Czy zgadzasz się? (Skala: 1 – Zdecydowanie się nie zgadzam, 2 – Raczej się nie zgadzam, 3 – Nie mam zdania, 4 – Raczej się zgadzam, 5 – Zdecydowanie się zgadzam)';
  assert.deepEqual(scalePresentation({ label, choices }), {
    label: 'Czy zgadzasz się?',
    description: '',
    labels: ['Zdecydowanie się nie zgadzam', 'Raczej się nie zgadzam', 'Nie mam zdania', 'Raczej się zgadzam', 'Zdecydowanie się zgadzam'],
  });
});

test('uses the endpoints supplied by the author without inferring the middle', () => {
  const label = 'Jak często?';
  const scaleLabels = ['1 — Zawsze', '5 — Nigdy'];
  assert.deepEqual(scalePresentation({ label, choices, scaleLabels }).labels, ['Zawsze', '', '', '', 'Nigdy']);
});

test('keeps incomplete descriptions visible and preserves numbers in prose', () => {
  const description = 'Dodatkowa informacja.\nSkala: 1 – Rzadko, 5 – Często';
  assert.equal(scalePresentation({ label: 'Jak często?', description, choices }).description, description);
  const complete = 'Dodatkowa informacja.\nSkala: 1 – Nigdy; 2 – Raz na 2 tygodnie; 3 – Co tydzień; 4 – Co dzień; 5 – Zawsze';
  assert.equal(scalePresentation({ label: 'Jak często?', description: complete, choices }).labels[1], 'Raz na 2 tygodnie');
});

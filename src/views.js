import { guideContents } from './guide.js';

const escapeChars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = (value = '') => String(value).replace(/[&<>"']/g, char => escapeChars[char]);

const csrfField = csrf => `<input type="hidden" name="_csrf" value="${escape(csrf)}">`;
const mark = '<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>';
const brand = `<a class="brand" href="/">${mark}<span>Ankiety<span class="brand-period">.</span></span></a>`;
const tileIcon = kind => `<span class="tile-icon ${kind}" aria-hidden="true"><i></i></span>`;
const status = (message, error = false) => message
  ? `<p class="notice ${error ? 'error' : 'success'}" role="${error ? 'alert' : 'status'}">${escape(message)}</p>`
  : '';

export function number(value) {
  return new Intl.NumberFormat('pl-PL').format(value);
}

export function points(value) {
  if (value === 1) return '1 punkt';
  const few = [2, 3, 4].includes(value % 10) && ![12, 13, 14].includes(value % 100);
  return `${number(value)} ${few ? 'punkty' : 'punktów'}`;
}

function document(title, inner, bodyClass = '') {
  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#191633">
  <meta name="description" content="Importuj ankiety z Google Forms, wypełniaj formularze innych osób i odblokowuj własne wyniki.">
  <title>${escape(title)} · Ankiety</title>
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body class="${bodyClass}">
  <a class="skip" href="#main">Przejdź do treści</a>
  ${inner}
</body>
</html>`;
}

const links = [
  ['browse', '/', 'Dostępne ankiety', 'browse-icon'],
  ['mine', '/moje', 'Moje ankiety', 'surveys-icon'],
  ['new', '/dodaj', 'Dodaj ankietę', 'plus-icon'],
  ['guide', '/instrukcja', 'Instrukcja', 'help-icon'],
];

function shell({ title, user, csrf, tab, main }) {
  return document(title, `
    <div class="shell">
      <aside class="sidebar">
        ${brand}
        <nav aria-label="Menu główne">
          ${links.map(([id, url, label, icon]) => `<a href="${url}" ${tab === id ? 'aria-current="page"' : ''}>${tileIcon(icon)}${label}</a>`).join('')}
        </nav>
        <div class="sidebar-foot">
          <div class="account">
            <span class="avatar" aria-hidden="true">${escape(Array.from(user.name)[0]?.toUpperCase() || 'A')}</span>
            <span class="account-text"><strong>${escape(user.name)}</strong><small>${escape(user.email)}</small></span>
          </div>
          <form method="post" action="/wyloguj">${csrfField(csrf)}<button class="signout" type="submit">Wyloguj się</button></form>
        </div>
      </aside>
      <div class="workspace">
        <header class="topbar">
          <span class="workspace-label">Wymiana ankiet</span>
          <a class="credit-pill" href="/moje">${tileIcon('point-icon')}<strong>${points(user.credits)}</strong></a>
        </header>
        <main id="main" class="main">${main}</main>
      </div>
    </div>`);
}

const steps = [
  ['plus-icon', 'Dodaj ankietę', 'Zaimportuj pytania z formularza Google i opublikuj ankietę.'],
  ['surveys-icon', 'Wypełnij ankietę', 'Za każdą wypełnioną ankietę innej osoby dostajesz punkt.'],
  ['point-icon', 'Odblokuj wyniki', 'Wymień punkty na odpowiedzi do swojej ankiety i pobierz je jako CSV.'],
];

function stepList() {
  return steps.map(([icon, title, text]) => `<li>${tileIcon(icon)}<div><strong>${title}</strong><p>${text}</p></div></li>`).join('');
}

export function authView({ mode, csrf, errors, values = {}, googleEnabled }) {
  const signup = mode === 'register';
  const heading = signup ? 'Utwórz konto' : 'Zaloguj się';
  const auth = `
    <section class="auth-card">
      <h2>${heading}</h2>
      <p>${googleEnabled ? 'Użyj swojego konta Google.' : signup ? 'Wystarczą imię, e-mail i hasło.' : 'Zaloguj się, aby wrócić do swoich ankiet.'}</p>
      ${status(errors, true)}
      ${googleEnabled ? '<a class="button primary google-login" href="/google/start">Kontynuuj z Google</a>' : `
      <form method="post" action="${signup ? '/rejestracja' : '/logowanie'}">
        ${csrfField(csrf)}
        ${signup ? `<label for="name">Imię</label><input id="name" name="name" autocomplete="given-name" value="${escape(values.name)}" maxlength="70" required>` : ''}
        <label for="email">Adres e-mail</label>
        <input type="email" id="email" name="email" autocomplete="username" value="${escape(values.email)}" maxlength="254" required>
        <label for="password">Hasło</label>
        <input type="password" id="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" ${signup ? 'minlength="8" aria-describedby="password-hint"' : ''} maxlength="128" required>
        ${signup ? '<small id="password-hint" class="hint">Co najmniej 8 znaków.</small>' : ''}
        <button class="button primary" type="submit">${heading}</button>
      </form>
      <p class="auth-switch">${signup ? 'Masz już konto? <a href="/logowanie">Zaloguj się</a>' : 'Nie masz konta? <a href="/rejestracja">Zarejestruj się</a>'}</p>`}
      <p class="auth-switch"><a href="/instrukcja">Instrukcja krok po kroku</a></p>
    </section>`;

  return document(heading, `
    <header class="guest-header">${brand}<a class="button plain" href="${signup ? '/logowanie' : '/rejestracja'}">${signup ? 'Zaloguj się' : 'Utwórz konto'}</a></header>
    <main id="main" class="guest-main">
      <section class="guest-hero">
        <div class="orbit" aria-hidden="true"><div></div><div></div><div></div></div>
        <div class="guest-copy">
          <h1>Wypełniaj ankiety.<br><em>Odblokuj wyniki.</em></h1>
          <p>Zbieraj odpowiedzi do swojej ankiety i pomóż innym zebrać ich własne.</p>
          <ul class="steps guest-steps">${stepList()}</ul>
        </div>
      </section>
      ${auth}
    </main>`, 'guest');
}

function surveyCard(survey) {
  return `<article class="card survey-card">
    <div class="survey-card-top">${tileIcon('surveys-icon')}<span class="tag">${number(survey.time_minutes)} min</span></div>
    <h3><a href="/ankiety/${survey.id}">${escape(survey.title)}</a></h3>
    <p>Odbiorcy · ${escape(survey.audience)}</p>
    <a class="button secondary" href="/ankiety/${survey.id}">Wypełnij ankietę</a>
  </article>`;
}

export function dashboardView({ user, csrf, surveys, query = '', message }) {
  return shell({ title: 'Dostępne ankiety', user, csrf, tab: 'browse', main: `
    ${status(message)}
    <section class="hero">
      <div class="orbit" aria-hidden="true"><div></div><div></div><div></div></div>
      <div class="hero-copy"><h1>Cześć, ${escape(user.name)}!</h1>
        <p>Wypełnij ankietę innej osoby i zdobądź punkt, którym odblokujesz jedną ze swoich odpowiedzi.</p>
        <a class="button primary" href="/dodaj">Dodaj swoją ankietę</a>
      </div>
    </section>
    <div class="dashboard-grid">
      <section aria-labelledby="browse-heading">
        <div class="section-heading"><h2 id="browse-heading">Dostępne ankiety</h2><span class="count">${number(surveys.length)}</span></div>
        <form class="search" method="get" action="/">
          <label class="sr-only" for="q">Szukaj ankiet</label>
          <input id="q" name="q" type="search" placeholder="Szukaj po tytule lub grupie odbiorców" value="${escape(query)}" maxlength="120">
          <button class="button secondary" type="submit">Szukaj</button>
        </form>
        ${surveys.length ? `<div class="survey-grid">${surveys.map(surveyCard).join('')}</div>` : `
          <div class="card empty">
            ${tileIcon('browse-icon')}
            <h3>${query ? 'Brak wyników wyszukiwania' : 'Brak dostępnych ankiet'}</h3>
            <p>${query ? 'Wpisz inny tytuł lub grupę odbiorców.' : 'Tutaj pojawią się ankiety innych osób, które możesz wypełnić.'}</p>
            ${query ? '<a href="/" class="button secondary">Wyczyść wyszukiwanie</a>' : '<a href="/dodaj" class="button secondary">Dodaj ankietę</a>'}
          </div>`}
      </section>
      <aside class="card guide"><h2>Jak działa wymiana?</h2><ul class="steps">${stepList()}</ul></aside>
    </div>` });
}

export function importView({ user, csrf, error, link = '' }) {
  return shell({ title: 'Dodaj ankietę', user, csrf, tab: 'new', main: `
    <div class="page-heading"><h1>Dodaj ankietę</h1><p>Wklej link do opublikowanego formularza Google. Przed publikacją zobaczysz zaimportowane pytania.</p></div>
    <section class="card form-panel">
      ${tileIcon('plus-icon')}<h2>Importuj z Google Forms</h2>
      ${status(error, true)}
      <form method="post" action="/dodaj">
        ${csrfField(csrf)}
        <label for="link">Link do formularza</label>
        <input id="link" name="link" type="url" placeholder="https://docs.google.com/forms/…" value="${escape(link)}" maxlength="2048" required aria-describedby="link-hint">
        <small id="link-hint" class="hint">Formularz musi być dostępny dla wszystkich osób z linkiem.</small>
        <button class="button primary" type="submit">Importuj pytania</button>
      </form>
    </section>` });
}

const kinds = {
  short: 'Krótka odpowiedź',
  long: 'Dłuższa odpowiedź',
  radio: 'Jednokrotny wybór',
  select: 'Lista rozwijana',
  checkbox: 'Wielokrotny wybór',
  scale: 'Skala',
};

function surveySettingsFields(values) {
  return `
    <label for="title">Tytuł</label>
    <input id="title" name="title" value="${escape(values.title)}" maxlength="200" required>
    <label for="audience">Dla kogo jest ankieta?</label>
    <input id="audience" name="audience" value="${escape(values.audience)}" placeholder="Np. studenci ratownictwa" maxlength="200" required>
    <label for="time">Czas wypełnienia w minutach</label>
    <input id="time" name="time" type="number" min="1" max="120" value="${escape(values.time ?? 5)}" required>
    <label for="goal">Ile odpowiedzi potrzebujesz?</label>
    <input id="goal" name="goal" type="number" min="1" max="10000" value="${escape(values.goal ?? 10)}" required>`;
}

export function previewView({ user, csrf, draft, schema, error, values = {} }) {
  return shell({ title: 'Podgląd importu', user, csrf, tab: 'new', main: `
    <div class="page-heading"><a class="back" href="/dodaj">Dodaj inny formularz</a><h1>Podgląd importu</h1><p>Sprawdź pytania i ustaw cel ankiety.</p></div>
    <div class="edit-grid">
      <section class="card form-panel preview">
        <h2>${escape(schema.title)}</h2>
        ${schema.description ? `<p class="preserve">${escape(schema.description)}</p>` : ''}
        <ol class="preview-questions">${schema.questions.map(question => question.kind === 'section'
          ? `<li class="section-item"><h3>${escape(question.label)}</h3>${question.description ? `<p>${escape(question.description)}</p>` : ''}</li>`
          : `<li><h3>${escape(question.label)}</h3><p>${kinds[question.kind]}${question.required ? ' · Wymagane' : ''}</p>
          ${question.description ? `<p class="preserve">${escape(question.description)}</p>` : ''}
          ${question.choices.length || question.hasOther
            ? `<ul>${question.choices.map(choice => `<li>${escape(choice)}</li>`).join('')}${question.hasOther ? '<li>Inne (własna odpowiedź)</li>' : ''}</ul>`
            : ''}</li>`).join('')}</ol>
      </section>
      <section class="card form-panel">
        <h2>Ustawienia publikacji</h2>
        ${status(error, true)}
        <form method="post" action="/dodaj/${escape(draft)}">
          ${csrfField(csrf)}
          ${surveySettingsFields({ ...values, title: values.title ?? schema.title })}
          <button class="button primary" type="submit">Opublikuj ankietę</button>
        </form>
      </section>
    </div>` });
}

export function editSurveyView({ user, csrf, survey, message, error, questionsError, link = '', values }) {
  values ??= {
    title: survey.title, description: survey.description, audience: survey.audience,
    time: survey.time_minutes, goal: survey.goal,
  };
  return shell({ title: 'Edytuj ankietę', user, csrf, tab: 'mine', main: `
    <div class="page-heading"><a class="back" href="/moje">Moje ankiety</a><h1>Edytuj ankietę</h1><p>${escape(survey.title)}</p></div>
    ${status(message)}
    <div class="survey-edit">
      <section class="card form-panel">
        <h2>Ustawienia ankiety</h2>
        ${status(error, true)}
        <form method="post" action="/moje/${survey.id}/edytuj">
          ${csrfField(csrf)}
          ${surveySettingsFields(values)}
          <label for="description">Opis ankiety</label>
          <textarea id="description" name="description" rows="4" maxlength="50000">${escape(values.description)}</textarea>
          <button class="button primary" type="submit">Zapisz zmiany</button>
        </form>
      </section>
      <section class="card form-panel">
        <h2>Pytania z Google Forms</h2>
        ${status(questionsError, true)}
        ${survey.total ? '<p>Pytania można zaktualizować przed przesłaniem pierwszej odpowiedzi.</p>' : `
        <p>Jeśli zmienisz pytania w Google Forms, wklej link do tego samego formularza, aby pobrać je ponownie.</p>
        <form method="post" action="/moje/${survey.id}/pytania">
          ${csrfField(csrf)}
          <label for="link">Link do formularza</label>
          <input id="link" name="link" type="url" placeholder="https://docs.google.com/forms/…" value="${escape(link)}" maxlength="2048" required>
          <button class="button secondary" type="submit">Pobierz pytania ponownie</button>
        </form>`}
      </section>
    </div>` });
}

function questionView(question, values, fieldError) {
  if (question.kind === 'section') return `<section class="survey-section"><h2>${escape(question.label)}</h2>${question.description ? `<p class="preserve">${escape(question.description)}</p>` : ''}</section>`;

  const name = `q_${question.id}`;
  const label = `${escape(question.label)}${question.required ? '<span class="asterisk" aria-hidden="true"> *</span>' : ''}`;
  const description = question.description ? `<p id="${name}-description" class="hint preserve">${escape(question.description)}</p>` : '';
  const describedBy = question.description ? ` aria-describedby="${name}-description"` : '';
  const valuesForQuestion = values.getAll(name);
  const value = valuesForQuestion[0] ?? '';
  const required = question.required ? ' required' : '';
  const feedback = fieldError ? `<p class="field-error" role="alert">${escape(fieldError)}</p>` : '';

  if (['radio', 'checkbox', 'scale'].includes(question.kind)) {
    const checkbox = question.kind === 'checkbox';
    const choice = (option, text) => `<label class="choice">
      <input type="${checkbox ? 'checkbox' : 'radio'}" name="${name}" value="${option}"${!checkbox ? required : ''}${describedBy}${valuesForQuestion.includes(String(option)) ? ' checked' : ''}>
      <span>${escape(text)}</span>
    </label>`;
    return `<fieldset class="card question ${question.kind}">
      <legend>${label}</legend>${description}${feedback}
      ${question.scaleLabels[0] ? `<p class="hint">${escape(question.scaleLabels[0])}</p>` : ''}
      <div class="choices">
        ${question.choices.map((text, index) => choice(index, text)).join('')}
        ${question.hasOther ? `<div class="choice-other">
          ${choice('other', 'Inne')}
          <div class="other-text">
            <label for="${name}_other">Wpisz własną odpowiedź</label>
            <input id="${name}_other" name="${name}_other" maxlength="1000" value="${escape(values.get(`${name}_other`) ?? '')}">
          </div>
        </div>` : ''}
      </div>
      ${question.scaleLabels[1] ? `<p class="hint">${escape(question.scaleLabels[1])}</p>` : ''}
    </fieldset>`;
  }

  let control;
  if (question.kind === 'select') {
    control = `<select id="${name}" name="${name}"${required}${describedBy}><option value="">Wybierz odpowiedź</option>${question.choices.map((choice, index) => `<option value="${index}"${value === String(index) ? ' selected' : ''}>${escape(choice)}</option>`).join('')}</select>`;
  } else if (question.kind === 'long') {
    control = `<textarea id="${name}" name="${name}" rows="4" maxlength="5000"${required}${describedBy}>${escape(value)}</textarea>`;
  } else {
    control = `<input id="${name}" name="${name}" maxlength="1000" value="${escape(value)}"${required}${describedBy}>`;
  }
  return `<div class="card question"><label for="${name}">${label}</label>${description}${feedback}${control}</div>`;
}

export function takeView({ user, csrf, survey, questions, questionVersion, values = new URLSearchParams(), errors = {}, error }) {
  return shell({ title: survey.title, user, csrf, tab: 'browse', main: `
    <div class="take-wrap">
      <div class="page-heading"><a class="back" href="/">Wszystkie ankiety</a><h1>${escape(survey.title)}</h1>
        <p>${number(survey.time_minutes)} min · Odbiorcy: ${escape(survey.audience)}</p>
        ${survey.description ? `<p class="preserve">${escape(survey.description)}</p>` : ''}
      </div>
      ${status(error, true)}
      <form class="question-form" method="post" action="/ankiety/${survey.id}">
        ${csrfField(csrf)}
        <input type="hidden" name="_questions" value="${escape(questionVersion)}">
        ${questions.map(question => questionView(question, values, errors[question.id])).join('')}
        <button class="button primary" type="submit">Wyślij odpowiedzi</button>
      </form>
    </div>` });
}

export function mineView({ user, csrf, surveys, message }) {
  return shell({ title: 'Moje ankiety', user, csrf, tab: 'mine', main: `
    <div class="page-heading heading-row"><div><h1>Moje ankiety</h1><p>Edytuj ankiety, sprawdzaj postęp i pobieraj wyniki.</p></div><a class="button primary" href="/dodaj">Dodaj ankietę</a></div>
    ${status(message)}
    ${surveys.length ? `<div class="survey-grid">${surveys.map(survey => `
      <article class="card survey-card mine-card">
        <div class="survey-card-top">${tileIcon('surveys-icon')}<span class="tag">${survey.total >= survey.goal ? 'Cel osiągnięty' : 'Zbiera odpowiedzi'}</span></div>
        <h2><a href="/moje/${survey.id}">${escape(survey.title)}</a></h2>
        <progress max="${survey.goal}" value="${survey.total}" aria-label="Postęp zbierania odpowiedzi"></progress>
        <p>${number(survey.total)} z ${number(survey.goal)} odpowiedzi · ${number(survey.unlocked)} odblokowanych</p>
        <div class="mine-card-actions">
          <a class="button secondary" href="/moje/${survey.id}">Zobacz wyniki</a>
          <a class="button secondary" href="/moje/${survey.id}/edytuj">Edytuj</a>
        </div>
      </article>`).join('')}</div>`
      : '<div class="card empty"><h2>Dodaj swoją pierwszą ankietę</h2><p>Zaimportuj formularz Google, żeby zacząć zbierać odpowiedzi.</p><a class="button primary" href="/dodaj">Importuj z Google Forms</a></div>'}` });
}

export function resultsView({ user, csrf, survey, questions, responses, message, error, page = 1 }) {
  const max = Math.min(survey.total - survey.unlocked, user.credits);
  const lastPage = Math.ceil(survey.unlocked / 20);
  return shell({ title: survey.title, user, csrf, tab: 'mine', main: `
    <div class="page-heading heading-row"><div><a class="back" href="/moje">Moje ankiety</a><h1>${escape(survey.title)}</h1>
      <p>${number(survey.total)} z ${number(survey.goal)} odpowiedzi · ${survey.total >= survey.goal ? 'Cel osiągnięty' : 'Zbiera odpowiedzi'}</p>
    </div><a class="button secondary" href="/moje/${survey.id}/edytuj">Edytuj ankietę</a></div>
    ${status(message)}${status(error, true)}
    <div class="stats">
      <div class="card stat"><strong>${number(survey.total)}</strong><span>Zebrane odpowiedzi</span></div>
      <div class="card stat"><strong>${number(survey.total - survey.unlocked)}</strong><span>Zablokowane</span></div>
      <div class="card stat"><strong>${number(survey.unlocked)}</strong><span>Odblokowane</span></div>
    </div>
    <section class="card unlock">
      <div><h2>Odblokuj odpowiedzi</h2><p>${max > 0 ? 'Jedna odpowiedź kosztuje 1 punkt.' : (survey.total === survey.unlocked
        ? 'Kolejne odpowiedzi pojawią się tutaj po przesłaniu ankiety przez uczestników.'
        : 'Wypełnij ankiety innych osób, aby zdobyć punkty.')}</p></div>
      ${max > 0 ? `<form method="post" action="/moje/${survey.id}/odblokuj">${csrfField(csrf)}
        <div><label for="amount">Liczba odpowiedzi</label><input id="amount" name="amount" type="number" value="1" min="1" max="${max}" required></div>
        <button class="button primary" type="submit">Odblokuj</button></form>` : (survey.total > survey.unlocked ? '<a href="/" class="button secondary">Znajdź ankiety</a>' : '')}
    </section>
    <section class="results">
      <div class="section-heading heading-row"><h2>Odblokowane wyniki</h2>${survey.unlocked ? `<a class="button secondary" href="/moje/${survey.id}/csv">Pobierz CSV</a>` : ''}</div>
      ${responses.length ? responses.map((response, index) => `<details class="card answer-card">
        <summary>Odpowiedź ${(page - 1) * 20 + index + 1}</summary>
        <dl>${questions.map(question => {
          const value = response.answers[question.id];
          return `<dt>${escape(question.label)}</dt><dd class="preserve">${escape(Array.isArray(value) ? value.join(' · ') : (value || '—'))}</dd>`;
        }).join('')}</dl></details>`).join('') : '<div class="card empty"><p>Odblokowane odpowiedzi pojawią się tutaj.</p></div>'}
      ${lastPage > 1 ? `<nav class="pagination" aria-label="Strony odpowiedzi">
        ${page > 1 ? `<a href="?strona=${page - 1}">Poprzednia</a>` : ''}
        <span>Strona ${page} z ${lastPage}</span>
        ${page < lastPage ? `<a href="?strona=${page + 1}">Następna</a>` : ''}</nav>` : ''}
    </section>` });
}

export function guideView() {
  return document('Instrukcja krok po kroku', `
    <header class="guest-header">${brand}<a class="button plain" href="/">Wróć do Ankiet</a></header>
    <main id="main" class="guide-page">${guideContents()}</main>`);
}

export function errorView({ user, csrf, title, message }) {
  const main = `<div class="page-heading"><h1>${escape(title)}</h1><p>${escape(message)}</p><a href="/" class="button secondary">Wróć do ankiet</a></div>`;
  return user ? shell({ title, user, csrf, tab: '', main })
    : document(title, `<header class="guest-header">${brand}</header><main id="main" class="standalone">${main}</main>`, 'guest');
}

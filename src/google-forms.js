const formPath = /^\/forms\/(?:u\/\d+\/)?d\/(e\/)?([\w-]{12,})\/(?:viewform|edit|)$/;
const shortPath = /^\/[\w-]{4,}\/?$/;
const maxBytes = 2_000_000;
const kinds = { 0: 'short', 1: 'long', 2: 'radio', 3: 'select', 4: 'checkbox', 5: 'scale' };

export class ImportError extends Error {}

function parseLink(link) {
  let url;
  try {
    url = new URL(link);
  } catch {
    throw new ImportError('Wklej pełny link do opublikowanego formularza Google.');
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new ImportError('Link do formularza musi zaczynać się od https://.');
  }

  const match = url.hostname === 'docs.google.com' && url.pathname.match(formPath);
  if (match) {
    return {
      url: new URL(`https://docs.google.com/forms/d/${match[1] || ''}${match[2]}/viewform`),
      key: match[2],
    };
  }

  if (url.hostname === 'forms.gle' && shortPath.test(url.pathname)) {
    return { url: new URL(url.pathname, 'https://forms.gle') };
  }

  throw new ImportError('Użyj linku do formularza z docs.google.com lub forms.gle. Formularz musi być publicznie dostępny.');
}

async function fetchForm(link) {
  let form = parseLink(link);
  const signal = AbortSignal.timeout(12_000);

  for (let hop = 0; hop < 5; hop++) {
    const response = await fetch(form.url, { redirect: 'manual', signal });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) break;
      const next = new URL(location, form.url);
      if (next.hostname === 'accounts.google.com') {
        throw new ImportError('Google wymaga zalogowania, aby otworzyć ten formularz. Ustaw dostęp dla wszystkich osób z linkiem.');
      }
      form = parseLink(next.href);
      continue;
    }

    if (!response.ok || !form.key || !response.body) {
      await response.body?.cancel();
      throw new ImportError('Ten formularz jest niedostępny. Sprawdź link i ustawienia publikacji.');
    }

    const chunks = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          await reader.cancel();
          throw new ImportError('Ten formularz jest za duży do zaimportowania.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    return { ...form, html: Buffer.concat(chunks).toString('utf8') };
  }

  throw new ImportError('Nie udało się otworzyć formularza z tego linku.');
}

function readSchema(html) {
  const start = /\bFB_PUBLIC_LOAD_DATA_\s*=\s*/.exec(html);
  if (!start) throw new ImportError('Google nie udostępnia pytań z tego formularza. Sprawdź, czy jest opublikowany i publicznie dostępny.');

  const bodyStart = start.index + start[0].length;
  const bodyEnd = html.indexOf('</script>', bodyStart);
  try {
    const data = JSON.parse(html.slice(bodyStart, bodyEnd).trim().replace(/;$/, ''));
    if (!Array.isArray(data?.[1]?.[1])) throw new Error();
    return data[1];
  } catch {
    throw new ImportError('Nie udało się odczytać struktury formularza Google.');
  }
}

function cleanLabel(value) {
  return typeof value === 'string' ? value.replace(/\*\*([^\n]+?)\*\*/g, '$1').trim() : '';
}

export async function importGoogleForm(link) {
  let form;
  try {
    form = await fetchForm(link);
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('Połączenie z Google Forms się nie powiodło. Spróbuj ponownie za chwilę.');
  }

  const schema = readSchema(form.html);
  const items = schema[1];

  if (items.length > 150) throw new ImportError('Możesz zaimportować formularz z maksymalnie 150 pozycjami.');

  const questions = [];
  const questionIds = new Set();
  for (const item of items) {
    if (!Array.isArray(item)) throw new ImportError('Google zwróciło nieznany format pytania.');
    const [itemId, title, description, type, entries] = item;
    const label = cleanLabel(title);
    if (type === 6 || (type === 8 && (item[5] == null || item[5] === -2))) {
      questions.push({ id: `section-${itemId}`, kind: 'section', label, description: cleanLabel(description) });
      continue;
    }

    const entry = entries?.[0];
    if (!kinds[type] || !Array.isArray(entry) || !Number.isInteger(entry[0]) || entries.length !== 1) {
      throw new ImportError(`Formularz zawiera nieobsługiwany element: „${label || 'bez nazwy'}”.`);
    }
    if (type === 0 && label.toLowerCase() === 'kod uczestnika') continue;

    const choices = entry[1] || [];
    if (type >= 2 && (!Array.isArray(choices) || !choices.length
        || choices.some(choice => !Array.isArray(choice) || (choice[4] !== 1 && typeof choice[0] !== 'string')))) {
      throw new ImportError(`Nie udało się odczytać opcji pytania „${label}”.`);
    }
    const id = String(entry[0]);
    if (questionIds.has(id)) throw new ImportError('Google zwróciło powtarzające się identyfikatory pytań.');
    questionIds.add(id);
    if (type !== 5 && entry[4]?.length) {
      throw new ImportError(`Pytanie „${label}” używa dodatkowej walidacji, której importer nie obsługuje.`);
    }
    if (choices.some(choice => choice[2] != null || choice[3] != null || choice[5] != null)) {
      throw new ImportError(`Pytanie „${label}” zawiera przejście między sekcjami lub obraz w odpowiedzi, których importer nie obsługuje.`);
    }

    const otherOptions = choices.filter(choice => choice[4] === 1);
    if (otherOptions.length && (otherOptions.length !== 1 || (type !== 2 && type !== 4))) {
      throw new ImportError(`Nie udało się odczytać pola na własną odpowiedź w pytaniu „${label}”.`);
    }

    questions.push({
      id,
      kind: kinds[type],
      label,
      description: cleanLabel(description),
      required: entry[2] === 1,
      choices: choices.filter(choice => choice[4] !== 1).map(choice => choice[0]),
      scaleLabels: type === 5 && Array.isArray(entry[3]) ? entry[3].map(cleanLabel) : [],
      ...(otherOptions.length ? { hasOther: true } : {}),
    });
  }

  if (!questions.some(question => question.kind !== 'section')) {
    throw new ImportError('W tym formularzu nie znaleziono pytań do zaimportowania.');
  }

  return {
    sourceKey: form.key,
    title: cleanLabel(schema[8]) || 'Ankieta bez tytułu',
    description: cleanLabel(schema[0]),
    questions,
  };
}

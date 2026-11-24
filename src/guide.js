const screens = {
  import: [725, 342, 'Pole Link do formularza i przycisk Importuj pytania', 2],
  opublikuj: [371, 446, 'Ustawienia publikacji z przyciskiem Opublikuj ankietę na dole', 1],
  wybierz: [551, 324, 'Przykładowa ankieta na liście z przyciskiem Wypełnij ankietę', 1],
  wyslij: [805, 414, 'Zaznaczona odpowiedź i przycisk Wyślij odpowiedzi pod pytaniami', 1],
  moje: [870, 250, 'Ankieta w zakładce Moje ankiety z przyciskiem Zobacz wyniki', 1],
  wyniki: [870, 333, 'Wyniki ankiety z przyciskami Odblokuj i Pobierz CSV', 2],
};

function screenshot(name) {
  const [width, height, description, highlights] = screens[name];
  const url = `/assets/instrukcja/${name}.jpg`;
  return `<figure class="guide-figure">
    <a class="guide-shot shot-${name}" href="${url}" target="_blank" rel="noopener">
      <img src="${url}" width="${width}" height="${height}" alt="${description}. Kliknij, aby powiększyć." loading="lazy">
      ${'<span class="guide-highlight" aria-hidden="true"></span>'.repeat(highlights)}
    </a>
  </figure>`;
}

const sections = [
  ['dodaj', 'Dodaj swoją ankietę'],
  ['wypelnij', 'Wypełnij cudzą ankietę'],
  ['pobierz', 'Odblokuj i pobierz wyniki'],
  ['arkusze', 'Otwórz wyniki w Google'],
];

export function guideContents() {
  return `
    <div class="guide-intro">
      <h1>Instrukcja krok po kroku</h1>
      <p>Za wypełnienie ankiety innej osoby dostajesz <strong>1 punkt</strong>. Za 1 punkt możesz odblokować jedną odpowiedź na swoją ankietę.</p>
      <p>Zaloguj się w Ankietach. Jeśli widzisz przycisk <strong>Kontynuuj z Google</strong>, kliknij go i wybierz swoje konto Google.</p>
      <p>Czerwone ramki pokazują, gdzie kliknąć. Kliknij obraz, aby go powiększyć.</p>
    </div>
    <nav class="guide-index" aria-label="Spis treści instrukcji">
      <ul>${sections.map(([id, title]) => `<li><a href="#${id}">${title}</a></li>`).join('')}</ul>
    </nav>
    <section id="dodaj" class="card guide-section" aria-labelledby="guide-add">
      <h2 id="guide-add">Dodaj swoją ankietę</h2>
      <ol class="guide-steps">
        <li>
          <h3>Skopiuj link z Formularzy Google</h3>
          <p>Otwórz swój formularz. Jeśli widzisz przycisk <strong>Opublikuj</strong>, kliknij go. W ustawieniach publikacji sprawdź, czy dostęp ma <strong>każda osoba mająca link</strong>.</p>
          <p>Wybierz <strong>Opublikowano</strong>, a potem <strong>Kopiuj link respondenta</strong>. Możesz też użyć linku, który już wysyłasz osobom wypełniającym ankietę.</p>
        </li>
        <li>
          <h3>Wklej link w Ankietach</h3>
          <p>W menu wybierz <strong>Dodaj ankietę</strong>. Wklej adres w pole <strong>Link do formularza</strong> i kliknij <strong>Importuj pytania</strong>.</p>
          ${screenshot('import')}
        </li>
        <li>
          <h3>Opublikuj ankietę</h3>
          <p>Sprawdź pytania w podglądzie. Podaj, dla kogo jest ankieta i ilu odpowiedzi potrzebujesz.</p>
          <p>Kliknij <strong>Opublikuj ankietę</strong>. Zobaczysz ją od razu w <strong>Moich ankietach</strong>. Aby zmienić jej ustawienia, kliknij <strong>Edytuj</strong>.</p>
          ${screenshot('opublikuj')}
        </li>
      </ol>
    </section>
    <section id="wypelnij" class="card guide-section" aria-labelledby="guide-answer">
      <h2 id="guide-answer">Wypełnij cudzą ankietę</h2>
      <ol class="guide-steps">
        <li>
          <h3>Wybierz ankietę</h3>
          <p>Wejdź w <strong>Dostępne ankiety</strong>. Sprawdź, dla kogo jest ankieta, i kliknij <strong>Wypełnij ankietę</strong>.</p>
          ${screenshot('wybierz')}
        </li>
        <li>
          <h3>Odpowiedz na pytania</h3>
          <p>Uzupełnij pytania oznaczone gwiazdką. Na dole kliknij <strong>Wyślij odpowiedzi</strong>. Po wysłaniu zobaczysz informację o zdobytym punkcie.</p>
          ${screenshot('wyslij')}
        </li>
      </ol>
    </section>
    <section id="pobierz" class="card guide-section" aria-labelledby="guide-download">
      <h2 id="guide-download">Odblokuj i pobierz wyniki</h2>
      <ol class="guide-steps">
        <li>
          <h3>Otwórz wyniki swojej ankiety</h3>
          <p>W menu kliknij <strong>Moje ankiety</strong>. Przy wybranej ankiecie kliknij <strong>Zobacz wyniki</strong>.</p>
          ${screenshot('moje')}
        </li>
        <li>
          <h3>Użyj punktów</h3>
          <p>W polu <strong>Liczba odpowiedzi</strong> wpisz, ile odpowiedzi chcesz zobaczyć. Kliknij <strong>Odblokuj</strong>. Każda odpowiedź kosztuje 1 punkt.</p>
          <p>Jeśli brakuje Ci punktów, wróć do <strong>Dostępnych ankiet</strong> i wypełnij kolejną.</p>
        </li>
        <li>
          <h3>Zapisz plik z wynikami</h3>
          <p>Kliknij <strong>Pobierz CSV</strong>. Plik zawiera wszystkie odblokowane odpowiedzi. Zwykle znajdziesz go w folderze <strong>Pobrane</strong>.</p>
          ${screenshot('wyniki')}
        </li>
      </ol>
    </section>
    <section id="arkusze" class="card guide-section" aria-labelledby="guide-sheets">
      <h2 id="guide-sheets">Otwórz wyniki w Google</h2>
      <p class="guide-note">Wyniki z pliku CSV wstawisz do <strong>Arkuszy Google</strong> połączonych z formularzem. Karta <strong>Odpowiedzi</strong> w Formularzach Google pokazuje zgłoszenia wysłane przez formularz Google.</p>
      <ol class="guide-steps">
        <li>
          <h3>Otwórz arkusz z formularza</h3>
          <p>Wróć do edytora swojego formularza Google. Kliknij kartę <strong>Odpowiedzi</strong>, a potem zieloną ikonę <strong>Arkuszy Google</strong>. Jeśli Google poprosi o utworzenie arkusza, kliknij <strong>Utwórz</strong>.</p>
          <div class="guide-menu" aria-hidden="true"><span>Formularze Google</span><strong>Odpowiedzi</strong><strong>Zielona ikona Arkuszy</strong></div>
        </li>
        <li>
          <h3>Wybierz pobrany plik</h3>
          <p>W otwartym arkuszu kliknij <strong>Plik</strong>, potem <strong>Importuj</strong> i <strong>Prześlij</strong>. Wybierz pobrany plik z końcówką <strong>.csv</strong>.</p>
          <div class="guide-menu" aria-hidden="true"><span>Arkusze Google</span><strong>Plik</strong><strong>Importuj</strong><strong>Prześlij</strong></div>
        </li>
        <li>
          <h3>Wstaw wyniki w nowej zakładce</h3>
          <p>Wybierz <strong>Wstaw nowe arkusze</strong> i kliknij <strong>Importuj dane</strong>. Na dole arkusza pojawi się nowa zakładka z wynikami z Ankiet.</p>
          <div class="guide-menu" aria-hidden="true"><span>Miejsce importowania</span><strong>Wstaw nowe arkusze</strong><strong>Importuj dane</strong></div>
        </li>
      </ol>
      <p class="guide-sources"><a href="https://support.google.com/docs/answer/2917686?hl=pl">Pomoc Google dotycząca łączenia formularza z arkuszem</a></p>
    </section>
    <p class="guide-end"><a href="/" class="button primary">Wróć do Ankiet</a></p>`;
}

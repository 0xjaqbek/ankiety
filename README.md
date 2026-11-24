# Ankiety

Ankiety to polskojęzyczna aplikacja do wymiany odpowiedzi. Właściciel importuje pytania z opublikowanego formularza Google, a uczestnicy wypełniają jego ankietę w aplikacji. Ankieta zbiera zgłoszenia od razu po publikacji.

Za wypełnienie ankiety innej osoby uczestnik otrzymuje 1 punkt. Każdy punkt odblokowuje jedną odpowiedź w wybranej własnej ankiecie. Zablokowane odpowiedzi pojawiają się właścicielowi jako licznik. Widok wyników i eksport CSV zawierają odblokowane odpowiedzi.

## Uruchomienie

Potrzebny jest Node.js 24.6 lub nowszy i połączenie z Google Forms podczas importu. Aplikacja korzysta z SQLite i modułów wbudowanych w Node.js.

```sh
npm start
```

Otwórz [http://127.0.0.1:3000](http://127.0.0.1:3000). Domyślnie możesz utworzyć lokalne konto z adresem e-mail i hasłem. `npm run dev` uruchamia serwer z automatycznym przeładowaniem.

### Logowanie przez Google

Aby użytkownicy zakładali konta za pomocą Google, utwórz klienta OAuth 2.0 typu aplikacja internetowa w Google Cloud. Dodaj do dozwolonych adresów przekierowania adres aplikacji z końcówką `/google/callback`. Przy uruchomieniu ustaw `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` i `GOOGLE_REDIRECT_URI`. Po ustawieniu tych zmiennych formularz rejestracji i logowania używa Google.

Na hostingu ustaw `HOST=0.0.0.0`, port przekazany przez hosting oraz `NODE_ENV=production` przy dostępie przez HTTPS. Wskaż `DATABASE_PATH` na plik na trwałym wolumenie. Domyślnie baza jest tworzona jako `data/ankiety.sqlite`. Zachowaj osobne bazy dla testów lokalnych i publicznej instancji z Google.

## Import pytań

1. Opublikuj formularz Google i udostępnij go wszystkim osobom z linkiem.
2. W aplikacji wybierz **Dodaj ankietę** i wklej link dla respondentów. Możesz też wkleić skrócony link z `forms.gle`.
3. Sprawdź podgląd, wpisz grupę odbiorców, czas wypełnienia i liczbę potrzebnych odpowiedzi, a następnie opublikuj ankietę.

Importer odczytuje publicznie dostępny widok Google Forms. Obsługuje krótką i długą odpowiedź, jednokrotny i wielokrotny wybór, listę rozwijaną, skalę i nagłówki sekcji bez rozgałęzień. Pole krótkiej odpowiedzi „Kod uczestnika” jest pomijane, ponieważ aplikacja przypisuje każde zgłoszenie do zalogowanego konta. Formularze prywatne i nieobsługiwane elementy, takie jak przesyłanie plików, rozgałęzienia czy opcja „Inne” z polem tekstowym, powodują komunikat przed publikacją.

Import tworzy kopię pytań. Odpowiedzi wprowadzone w aplikacji są zapisywane w jej bazie. Aby przenieść odblokowane wyniki do Arkuszy Google, w menu **Moje ankiety** pobierz CSV, a następnie wybierz **Plik → Importuj** w Arkuszach.

# Poranny Pulpit: specyfikacja projektu

## Cel

Projekt edukacyjny do przećwiczenia **mikrofrontendów (Native Federation) w Angularze**. Ma być **jak najprostszy**: minimum kodu, zero rzeczy „na zapas”. Każdy plik powinien istnieć dlatego, że uczy czegoś o federacji, a nie dlatego, że „tak się robi w dużych projektach”.

Aplikacja to poranny pulpit z trzema widgetami. Każdy widget jest **osobnym mikrofrontendem** (remote), a **shell** (host) tylko je składa w jedną stronę.

## Zasady dla implementacji

- **Prostota ponad wszystko.** Bez NgRx, bez bibliotek UI, bez bibliotek do wykresów, bez bibliotek do dat. Bez warstw abstrakcji, interfejsów „na przyszłość”, fabryk, generycznych serwisów.
- Aktualny stabilny Angular i domyślne ustawienia CLI: standalone components, signals, nowa składnia control flow (`@if`, `@for`). Żadnych NgModules.
- Kod i komentarze po angielsku, **teksty w UI po polsku**.
- Komentarze tylko tam, gdzie wyjaśniają coś związanego z federacją (np. dlaczego coś jest w `shared`, skąd shell wie, gdzie jest remote).
- Bez testów jednostkowych w pierwszej wersji (usuń wygenerowane pliki `*.spec.ts`).
- Zanim zainstalujesz paczki, **sprawdź na npm aktualne wersje** Angulara i `@angular-architects/native-federation` oraz zgodność ich major version. Postępuj według aktualnego README Native Federation, a nie według pamięci; nazwy paczek i komendy schematów mogły się zmienić.

## Architektura

Jedno repo, **jeden workspace Angular CLI z wieloma aplikacjami** (`ng new poranny-pulpit --create-application=false`, potem `ng g application ...`), plus osobny folder z API w Node.

Jeden `package.json` dla aplikacji Angular oznacza te same wersje zależności we wszystkich MFE, co upraszcza naukę. Problemy z wersjami to ćwiczenie na później (patrz niżej).

```
poranny-pulpit/
├── projects/
│   ├── shell/          # host, port 4200
│   ├── mfe-weather/    # remote, port 4201
│   ├── mfe-rates/      # remote, port 4202
│   └── mfe-dog/        # remote, port 4203
├── api/                # Node + Express, port 3000
├── package.json
└── README.md
```

Federację dodaj komendami `ng add @angular-architects/native-federation` (lub aktualnym odpowiednikiem):

- `shell` jako **dynamic-host**,
- każdy `mfe-*` jako **remote**.

### Kontrakt między shellem a remote'ami

Każdy remote wystawia **dokładnie jedną rzecz**: standalone komponent pod kluczem `./Widget` w `federation.config.js`.

Komponent widgetu:

- sam pobiera swoje dane z API (`http://localhost:3000/api/...`),
- nie przyjmuje żadnych inputów,
- nie wie nic o shellu ani o innych widgetach.

Każdy remote musi też działać **samodzielnie** (`ng serve mfe-weather` pokazuje sam widget na środku strony). To ważne dla nauki: widać, że remote jest pełnoprawną aplikacją.

### Skąd shell wie, co załadować

Shell **nie ma remote'ów wpisanych na sztywno**. Przy starcie (`initFederation`) pobiera manifest z API:

```
GET http://localhost:3000/api/federation-manifest
```

```json
{
  "mfe-weather": "http://localhost:4201/remoteEntry.json",
  "mfe-rates": "http://localhost:4202/remoteEntry.json",
  "mfe-dog": "http://localhost:4203/remoteEntry.json"
}
```

Shell iteruje po kluczach manifestu i dla każdego wywołuje `loadRemoteModule(name, './Widget')`, renderując wynik (np. przez `NgComponentOutlet`). Kolejność widgetów jest taka jak w manifeście.

Usunięcie wpisu z manifestu w API (i restart API) usuwa widget z pulpitu **bez przebudowy shella**. To jedna z głównych lekcji projektu.

### Odporność na awarie

Jeśli remote nie odpowiada (np. nie jest uruchomiony), shell w miejscu widgetu pokazuje elegancką kartę-zaślepkę: „Ten widget jest chwilowo niedostępny”. Reszta pulpitu działa normalnie.

Uwaga implementacyjna: `initFederation` przy niedostępnym remote może zalogować błąd. Upewnij się, że shell mimo to się uruchamia, a błąd jest obsłużony per widget.

## API (Node)

Minimalny Express w `api/`, jeden plik `server.js` (ESM, natywny `fetch`, bez TypeScriptu). Rola: **BFF**, czyli normalizuje dane z zewnętrznych API i cache'uje je w pamięci.

| Endpoint | Źródło | Cache | Zwraca |
|---|---|---|---|
| `GET /api/federation-manifest` | stała w kodzie | – | manifest jak wyżej |
| `GET /api/weather?lat=..&lon=..` | Open-Meteo (forecast) + Nominatim (reverse geocoding) | pogoda 15 min, nazwa miejscowości 7 dni; osobno dla każdej lokalizacji | nazwa miejscowości, aktualna temp., odczuwalna, opis słowny pogody po polsku (mapowanie kodów WMO), min/max dziś, prognoza godzinowa na najbliższe 12 h (temp.) |
| `GET /api/rates` | NBP Web API, tabela A | do końca dnia | EUR, USD, CHF, GBP: aktualny kurs, zmiana vs poprzednie notowanie (wartość i %), ostatnie 10 notowań do wykresu |
| `GET /api/dog` | Dog CEO API | do końca dnia | URL zdjęcia i nazwa rasy wyciągnięta z URL-a (np. `hound-afghan` → „Hound (afghan)”) |

Szczegóły:

- **Pogoda:** współrzędne przychodzą od frontu w query params. Jeśli ich brak lub są niepoprawne, użyj domyślnej lokalizacji ze stałej na górze pliku: Warszawa (lat 52.23, lon 21.01). Do Open-Meteo wysyłaj `timezone=auto`. Klucz cache to współrzędne zaokrąglone do 2 miejsc po przecinku (~1 km); dzięki temu cache działa sensownie, a do API nie trafia dokładna pozycja. Cache to `Map` z prostym limitem wpisów (np. 100, najstarszy wylatuje). Nie loguj współrzędnych.
- **Nazwa miejscowości:** BFF pobiera ją z publicznego Nominatim (OpenStreetMap): `https://nominatim.openstreetmap.org/reverse?lat=..&lon=..&format=jsonv2&zoom=10&accept-language=pl`. Weź pierwsze dostępne z pól `address.city`, `town`, `village`, `municipality`. Wymagania regulaminu Nominatim, których trzeba przestrzegać:
  - nagłówek `User-Agent` identyfikujący aplikację, np. `poranny-pulpit/1.0 (kontakt: <email z .env>)`; bez niego Nominatim zwraca 403,
  - maksymalnie 1 zapytanie na sekundę: prosta kolejka/throttle w kodzie,
  - wynik cache'owany (te same zaokrąglone współrzędne → 7 dni), żeby nie pytać ponownie.
  Nominatim wołamy tylko z backendu, nigdy z przeglądarki. Pogodę i nazwę pobieraj równolegle (`Promise.allSettled`). Błąd geokodowania nie psuje odpowiedzi: wtedy `place: null`. Dla domyślnej lokalizacji nazwa „Warszawa” jest stałą, bez zapytania.
- Email kontaktowy do `User-Agent` w pliku `api/.env` (`NOMINATIM_CONTACT=`), z `api/.env.example` w repo; użyj wbudowanego w Node `--env-file`, bez paczki dotenv. `api/.env` musi być w `.gitignore`. Email trafia tylko do zapytań backend → Nominatim; nigdy nie zwracaj go w odpowiedziach API ani nie wysyłaj do frontu.
- **Kursy:** `https://api.nbp.pl/api/exchangerates/rates/a/{code}/last/10/?format=json`. Tylko HTTPS. W weekendy NBP nie publikuje kursów, więc pokazuj ostatnie dostępne notowanie z jego datą.
- **Pies dnia:** jeden losowy pies na dzień (cache do północy), żeby odświeżenie strony nie zmieniało psa.
- CORS włączony dla `localhost:4200–4203`.
- Prosty cache: obiekt w pamięci `{ data, expiresAt }` na endpoint. Bez Redisa, bez bibliotek.
- Gdy zewnętrzne API nie odpowiada: zwróć ostatnie dane z cache (jeśli są), w przeciwnym razie `502` z krótkim komunikatem.

## Wygląd

Minimalistycznie, ale elegancko. Spokojny, „poranny” charakter, dużo światła i powietrza.

**Design tokens:** zdefiniowane **wyłącznie w shellu** jako CSS custom properties na `:root` (w globalnym `styles.css`). Remote'y używają tylko tych zmiennych i nie definiują własnych kolorów. To też lekcja: CSS custom properties przechodzą przez granice MFE bez żadnej konfiguracji.

Żeby remote uruchomiony samodzielnie wyglądał przyzwoicie, każdy remote ma w swoim `styles.css` **kopię tych samych tokenów** jako fallback. Zaznacz w komentarzu, że to świadoma duplikacja.

Kierunek wizualny:

- **Kolory jasne:** tło ciepła złamana biel (np. `#FAF8F5`), karty białe, tekst prawie czarny (`#1C1B1A`), tekst drugorzędny ciepły szary, jeden akcent (np. przygaszony bursztyn / poranne słońce `#D98E2B`). Zmiany kursów: stonowana zieleń / stonowana czerwień, nie jaskrawe.
- **Tryb ciemny:** przez `prefers-color-scheme: dark`, ciepła ciemna paleta (nie czysta czerń).
- **Typografia:** dwa kroje z Google Fonts. Szeryfowy do nagłówka i dużych liczb (np. *Fraunces* lub *Instrument Serif*) oraz bezszeryfowy do reszty (np. *Inter*). Duże liczby (temperatura, kursy) jako wyraźne akcenty typograficzne.
- **Karty:** duże zaokrąglenia (~20 px), bardzo delikatny cień lub cienka ramka, hojny padding. Bez gradientów, bez ikon emoji.
- **Nagłówek strony:** powitanie zależne od pory dnia („Dzień dobry” / „Dobry wieczór”) i pełna data po polsku (`Intl.DateTimeFormat('pl-PL')`, np. „piątek, 30 października”).
- **Układ:** siatka 3 kolumn na desktopie, 1 kolumna na telefonie. Treść wyśrodkowana, max ~1100 px.
- **Ładowanie:** każdy widget ma skeleton (pulsujące szare bloki w kształcie treści), nie spinner.
- **Animacje:** tylko subtelne pojawienie się kart (fade + lekki ruch w górę), z `prefers-reduced-motion`.

### Widgety

**Pogoda (`mfe-weather`)**
- Lokalizacja z `navigator.geolocation.getCurrentPosition` (niska dokładność, `maximumAge` ok. 30 min, timeout ok. 5 s). Współrzędne zaokrąglij do 2 miejsc już na froncie, zanim wyślesz je do API.
- Brak zgody, timeout lub brak wsparcia: pobierz pogodę bez współrzędnych (domyślnie Warszawa). - Nazwa miejscowości jako nagłówek karty (np. „Mokotów” / „Warszawa”), krojem bezszeryfowym, drobniej niż temperatura. Przy fallbacku: „Warszawa” i dyskretny dopisek „lokalizacja domyślna”. Gdy `place` jest `null`: „Twoja okolica”.
- Widget nie blokuje się na czekaniu na zgodę: skeleton trwa najwyżej do timeoutu, potem fallback.
- Duża temperatura krojem szeryfowym, pod spodem opis słowny i „odczuwalna X°”, obok min/max.
- Mini wykres temperatury na 12 h jako **ręcznie rysowany inline SVG** (polyline, bez biblioteki).
- Na dole drobnym drukiem atrybucja z linkami (wymagane przez licencje): „Pogoda: Open-Meteo.com · Lokalizacja: © OpenStreetMap contributors”.

**Kursy (`mfe-rates`)**
- Lista 4 walut. Każdy wiersz: kod waluty, kurs w zł, zmiana w % z kolorem, mini sparkline (inline SVG) z 10 notowań.
- Drobnym drukiem data notowania i „Źródło: NBP”.

**Pies dnia (`mfe-dog`)**
- Zdjęcie wypełniające górę karty (`object-fit: cover`, stała proporcja), pod spodem rasa i krótki, losowo wybrany z ~10 zdefiniowanych żartobliwy podpis (np. „Dzisiejszy patron spokojnych poranków”).

## Uruchamianie

- `npm start` w root uruchamia wszystko naraz (`concurrently`): API, 3 remote'y i shell, z kolorowymi prefiksami w logach.
- Osobne skrypty `start:api`, `start:shell`, `start:weather`, `start:rates`, `start:dog`.
- `README.md` po polsku, krótki: jak uruchomić, schemat architektury (ASCII), lista portów i sekcja „Ćwiczenia” (skopiuj z końca tej specyfikacji).

## Poza zakresem (nie implementuj)

Routing w shellu (jedna strona), autoryzacja, baza danych, Docker, testy, i18n, ustawienia użytkownika, komunikacja między widgetami, React. Część z nich to ćwiczenia poniżej.

## Kryteria akceptacji

1. `npm start` uruchamia całość; `localhost:4200` pokazuje pulpit z trzema działającymi widgetami.
2. Każdy remote uruchomiony samodzielnie pokazuje swój widget.
3. Zatrzymanie jednego remote'a: pulpit działa, w jego miejscu jest zaślepka.
4. Usunięcie wpisu z manifestu w API i restart API usuwa widget bez przebudowy shella.
5. Zmiana tekstu w remote i przebudowanie tylko tego remote'a powoduje, że po odświeżeniu shella zmiana jest widoczna.
6. Tryb ciemny działa; układ jest poprawny na szerokości telefonu.
7. W konsoli przeglądarki nie ma błędów przy działającym komplecie.

## Ćwiczenia (dla mnie, po zbudowaniu bazy)

1. **Shared dependencies:** obejrzyj `federation.config.js` i zakładkę Network. Zobacz, że Angular ładuje się raz. Potem w jednym remote wyłącz współdzielenie jakiejś biblioteki i porównaj.
2. **Konflikt wersji:** wydziel jeden remote do osobnego `package.json` z inną wersją biblioteki i zobacz, co się dzieje.
3. **Komunikacja między MFE:** kliknięcie waluty w `mfe-rates` przelicza „ile kosztuje karma dla psa w tej walucie” w `mfe-dog`. Zrób przez `CustomEvent` na `window`, bez wspólnego serwisu.
4. **Nowy remote w innym frameworku:** dodaj `mfe-quote` w React (Native Federation ma adapter esbuild) i dopisz go do manifestu.
5. **Feature flag:** API zwraca różne manifesty zależnie od parametru (`?beta=1`).
6. **Origin i uprawnienia przeglądarki:** zezwól na lokalizację w shellu (`:4200`), a potem uruchom `mfe-weather` samodzielnie (`:4201`) i zobacz, że przeglądarka pyta ponownie. Kod remote'a załadowany przez federację wykonuje się w originie hosta, więc dziedziczy jego uprawnienia, localStorage i cookies. Zastanów się, co to oznacza dla bezpieczeństwa.
7. **Deploy:** wrzuć remote'y na osobne hostingi statyczne i podmień URL-e w manifeście.

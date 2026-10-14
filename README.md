# TTRPG Listener

Słucha rozmowy przy stole i steruje **światłem** (rzutnik, Philips Ambilight) i **muzyką** (Spotify) sesji RPG.

```
przeglądarka (mikrofon) ──PCM 16 kHz / WebSocket──► serwer Node ──PCM──► kontener STT (Docker)
                                                     │                    ├─ Silero VAD tnie mowę na wypowiedzi
                                                     │◄──── tekst ~0,5 s ─┴─ Parakeet TDT 0.6B v3 (CPU)
                                                     ├─ co 5 s nowy tekst ──► stały proces `claude` (Haiku, subskrypcja)
                                                     │                        └─► {"light": "noc", "music": "walka"}
                                                     └─ preset ──► integracje kanału (rzutnik, Ambilight, Spotify)
```

## Wymagania

- Node 22.12+
- Docker (na Windows/macOS: uruchomiony Docker Desktop)
- zalogowany [Claude Code](https://claude.com/claude-code): polecenie `claude` w PATH. Klasyfikacja korzysta z jego subskrypcji, bez klucza API.

## Uruchomienie

```bash
npm install
```

```bash
npm start
```

`npm start` stawia kontener `ttrpg-stt`, buduje panel i otwiera go w przeglądarce pod http://127.0.0.1:8888.
Za pierwszym razem Docker buduje obraz, a kontener pobiera model (~670 MB) do wolumenu Dockera. Postęp widać w panelu.
Mikrofon obsługuje przeglądarka, więc aplikacja działa tak samo na macOS i Windows.

## Na sesji

1. **Start nasłuchu** (prawy górny róg) włącza mikrofon tego okna przeglądarki. Pod adresem `127.0.0.1` przeglądarka zapyta o zgodę.
2. Kanały **Światło** i **Muzyka** są niezależne. Każdy ma własne presety i własny przełącznik **AUTO**.
   W trybie AUTO Claude co kilka sekund wybiera preset na podstawie rozmowy.
3. Kliknięcie presetu włącza go od razu i wyłącza AUTO w tym kanale, żeby AI go nie nadpisało. Przykład: ręcznie „Noc”,
   a muzyka dalej sama przechodzi między „Spokojem” a „Walką”. Ponowne włączenie AUTO oddaje kanał AI.
4. **Rzutnik** otwiera okno z kolorem światła. W Chrome/Edge otwiera się od razu na drugim ekranie, po zgodzie na
   „zarządzanie oknami”. Dwuklik przełącza pełny ekran.
   Okno działa też na innym urządzeniu (tablet, przeglądarka w TV) pod `/projector`.

Presety, ich opisy dla AI i ustawienia integracji edytuje się w zakładkach **Presety** i **Integracje**.

### Telefon jako pilot

```bash
npm run start:lan
```

Panel będzie dostępny w sieci lokalnej (adres pojawi się w konsoli). Przeglądarka daje dostęp do mikrofonu tylko pod
`localhost` albo przez HTTPS, więc telefon działa jako pilot: presety, AUTO, podgląd. Nasłuch zostaje na laptopie.
Panel nie ma hasła, więc tego trybu używaj tylko w zaufanej sieci.

## Integracje

| Integracja | Kanał | Ustawienia | W presecie | Uwagi |
|---|---|---|---|---|
| Rzutnik | światło | czas przejścia | kolor | płynne przejście w przeglądarce |
| Philips Ambilight | światło | IP, czas przejścia | kolor | „Paruj” → PIN z TV → „Potwierdź PIN” |
| Spotify | muzyka | Client ID, urządzenie | playlista, start (od początku / od losowego utworu), tasowanie | wymaga Premium; ta sama playlista nie jest restartowana |

Spotify, jednorazowo:
1. Na https://developer.spotify.com/dashboard → Create app, zaznacz Web API, dodaj Redirect URI `http://127.0.0.1:8888/callback`.
2. Client ID wklej w Integracje → Spotify, potem „Połącz”.

Po przesiadce z wersji pythonowej kliknij „Połącz ponownie”. Start od losowego utworu potrzebuje dodatkowego
uprawnienia do odczytu playlist; bez niego losowy start idzie przez tasowanie Spotify.
Przed sesją uruchom aplikację Spotify. „Pokaż urządzenia” pokaże, czy jest widoczna.

### Nowa integracja

1. Nowy plik w `server/integrations/`, klasa dziedzicząca po `Integration`:
   `id`, `name`, `channel`, `settingsFields`, `presetFields`, `apply(settings, preset)`, opcjonalnie `actions()`/`runAction()` i `status()`.
2. Dopisz klasę do `INTEGRATIONS` w `server/integrations/registry.ts`.

Formularze w panelu generują się z pól. Do płynnych kolorów jest `ColorFader`.

## Jakość rozpoznawania

- **Opisy presetów**: z nich AI wie, kiedy co wybrać. Opisuj, jak brzmi rozmowa, gdy preset pasuje, a nie samą nazwę.
- **Kontekst kampanii** (Ustawienia): nazwy własne i setting. Pomaga Claude'owi zrozumieć przekręcone słowa.
- **Poprawki transkrypcji** (Ustawienia): pary `źle => dobrze`, np. `pistonkrik => Piston Creek`.
- Przy słabym mikrofonie zwykle pomagają redukcja szumu i automatyczne wzmocnienie (Ustawienia).
- Wątki CPU kontenera: wpisz `STT_THREADS=8` do pliku `.env` w folderze projektu (domyślnie 4) i uruchom
  `docker compose up -d --force-recreate`.

## Dane i sprzątanie

Dane aplikacji leżą w `%APPDATA%\TtrpgListener` (Windows) albo `~/Library/Application Support/TtrpgListener` (macOS):
`settings.json` (ustawienia i presety), `secrets.json` (parowanie TV, tokeny Spotify) i `logs/` (log JSONL z każdego uruchomienia).
Model mowy jest tylko w wolumenie Dockera.

Ustawienia z wersji pythonowej (`config.json`) importują się przy pierwszym starcie. Każda dawna scena staje się
presetem światła i presetem muzyki.

Pełne usunięcie: `docker compose down -v --rmi local` (kontener, obraz i model), potem folder projektu i folder danych.

## Debugowanie

Zakładka **Debug**:
- poziom mikrofonu i stan detekcji mowy,
- „Wstrzyknij” / „Klasyfikuj teraz”: test bez mówienia,
- „Transkrybuj plik…”: dowolny plik audio przechodzi przez ten sam kontener STT co mikrofon,
- scenariusze (`server/debug/scenarios.json`): skryptowane linie z oczekiwanym presetem na kanał; liczona trafność,
- lista zdarzeń; kliknięcie pokazuje szczegóły (pełny prompt, tokeny, czasy),
- statystyki: szybkość STT, czas i tokeny Claude, trafność.

Próbki audio (TTS, polskie głosy na zmianę) generuje na Windows `tools\generate-debug-wavs.ps1` do `debug-samples\`.

## Rozwój

W dwóch terminalach:

```bash
npm run dev
```

```bash
npm run dev:web
```

Pierwsze polecenie uruchamia serwer z przeładowaniem, drugie panel z hot reload pod http://localhost:5173.
`npm run typecheck` sprawdza typy.

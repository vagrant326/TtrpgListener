# TTRPG Listener (PoC)

Słucha rozmowy przy stole, rozpoznaje nastrój i odpala scenę na włączonych integracjach
(rzutnik, Philips Ambilight, Spotify).

```
mikrofon ──► app (Windows, tkinter) ──10s PCM──► whisper (Docker, faster-whisper small, CPU)
                 │◄────────── tekst ──────────────┘
                 ├─ co 45s nowy tekst ──► claude -p --model haiku ──► klucz nastroju
                 └─ scena ──► każda włączona integracja (osobny wątek)
```

## Uruchomienie

```powershell
.\run.ps1
```

Tworzy `.venv` w folderze projektu, stawia kontener `ttrpg-whisper` i odpala aplikację.
Konfiguracja zapisuje się automatycznie w `%APPDATA%\TtrpgListener\config.json`.

Sprzątanie: `docker compose down -v`, usunięcie folderu projektu i `%APPDATA%\TtrpgListener`.

## Integracje

Zakładka **Integracje**: włączanie, ustawienia, akcje (parowanie, połącz, pokaż rzutnik).
Zakładka **Nastroje i sceny**: co dana scena robi w każdej integracji.

| Integracja | Ustawienia | W scenie | Uwagi |
|---|---|---|---|
| Rzutnik | monitor, czas przejścia | kolor | płynne przejście 30 fps, Esc zamyka okno |
| Philips Ambilight | IP, czas przejścia | kolor | „Paruj” → PIN z TV; przejście ~6 kl./s (każda klatka to request do TV) |
| Spotify | Client ID, urządzenie | playlista | wymaga Premium; ta sama playlista nie jest restartowana |

Spotify, jednorazowo: https://developer.spotify.com/dashboard → Create app, Redirect URI
`http://127.0.0.1:8888/callback`, Web API. Client ID wklej w Integracje → Połącz.
Przed sesją uruchom aplikację Spotify („Pokaż urządzenia” pokaże, czy jest widoczna).

### Nowa integracja

1. Nowy plik w `app/integrations/`, klasa dziedzicząca po `Integration`:
   `id`, `name`, `settings_fields`, `scene_fields`, `apply(scene, mood)`, opcjonalnie `actions()` i `status()`.
2. Dopisz klasę do `INTEGRATIONS` w `app/integrations/registry.py`.

UI i zapis konfiguracji generują się z pól. Do płynnych kolorów jest `ColorFader`.

## Debugowanie

Zakładka **Debug**:
- miernik poziomu mikrofonu z progiem ciszy (do ustawienia `silence_rms`),
- „Wstrzyknij tekst” / „Klasyfikuj teraz”: test bez mówienia,
- „Transkrybuj WAV…”: przepuszcza plik przez Whispera tak jak mikrofon,
- scenariusze (`app/debug_scenarios.json`): skryptowane linie z oczekiwanym nastrojem, liczona trafność,
- tabela wszystkich zdarzeń; kliknięcie pokazuje szczegóły (pełny prompt, tokeny, czasy),
- statystyki: szybkość Whispera, średnie tokeny/czas na zapytanie, trafność.

Każde uruchomienie zapisuje log JSONL w `%APPDATA%\TtrpgListener\logs\`.

Próbki audio (TTS, dwa polskie głosy na zmianę) generuje `tools\generate-debug-wavs.ps1` do `debug-samples\`.

## Tokeny

Do Claude idzie tylko tekst powiedziany od ostatniej klasyfikacji (max 1500 znaków) + obecny nastrój.
Cisza nie trafia do Whispera, krótkie fragmenty (<60 znaków) czekają na więcej tekstu. Myślenie modelu jest wyłączone.
Jedno zapytanie to ~850 tokenów wejścia i ~5 wyjścia.

## Dokładniejsza transkrypcja

```powershell
$env:WHISPER_MODEL="medium"; docker compose up -d --force-recreate
```
Wolniej (~3×) i mocniej obciąża CPU. Na tej maszynie `small` robi 10 s audio w ~2.2 s.

# ProjektInstagram – bot do rolek i postów

Generuje rolki (MP4 1080×1920) i posty (JPG 1080×1350) z plików JSON — bez zewnętrznych narzędzi AI.
Szablony to strony HTML/CSS + three.js, nagrywane klatka po klatce w Chromium i składane przez FFmpeg.

## Wymagania
- Node.js 20+
- FFmpeg w `PATH`
- `npm install` (instaluje `three` i `playwright`; przeglądarkę: `npx playwright install chromium`, jeśli jej nie masz)

## Użycie
```bash
npm run render -- content/queue/przyklad-rolka.json      # -> output/przyklad-rolka.mp4 + _cover.jpg
npm run render -- content/queue/przyklad-post.json       # -> output/przyklad-post.jpg
npm run render -- content/queue/przyklad-rolka.json --still 5   # podgląd jednej klatki (sekunda 5)
npm run render -- content/queue/przyklad-rolka.json --fps 15    # szybki render roboczy
```

## Jak to działa
1. **Spec (JSON)** w `content/queue/` opisuje treść: szablon, kolory marki, sceny, podpis, hashtagi.
2. **Szablon** (`templates/<nazwa>/index.html`) wystawia kontrakt:
   - czyta `window.__SPEC__`,
   - ustawia `window.__DURATION__` (sekundy) i `window.__READY__ = true`,
   - udostępnia `window.__renderFrame(t)` – rysuje stan dla czasu `t`. Animacje są funkcją czasu,
     więc render jest deterministyczny i płynny niezależnie od szybkości maszyny.
3. **Renderer** (`src/render/render.js`) otwiera szablon w headless Chromium, dla każdej klatki wywołuje
   `__renderFrame(t)`, robi zrzut i przekazuje go do FFmpeg (H.264 + AAC, `+faststart` – format akceptowany przez Instagram).

## Format sceny (`reel-kinetic-3d`)
| pole | opis |
|---|---|
| `type` | `hook` (otwarcie), `point` (numerowany punkt), `cta` (zakończenie) |
| `kicker` | mała etykieta nad tytułem |
| `title`, `body` | tekst; `*słowo*` = wyróżnienie kolorem akcentu |
| `button` | przycisk (scena `cta`) |
| `duration` | czas sceny w sekundach (domyślnie 3.5) |

## Struktura
```
content/queue/   specyfikacje postów i rolek
templates/       szablony (shared/ = wspólne animacje i fonty)
assets/          fonty, muzyka
src/render/      renderer (Playwright + FFmpeg)
src/publish/     (etap 2) publikacja przez Instagram Graph API
output/          wygenerowane pliki (poza gitem)
```

## Plan
- [x] Etap 1 – renderer, szablon rolki z three.js, szablon posta
- [ ] Etap 2 – publikacja przez oficjalne Instagram Graph API (kontener → status → `media_publish`)
- [ ] Etap 3 – kolejka + harmonogram (GitHub Actions cron), akceptacja przed publikacją
- [ ] Etap 4 – więcej szablonów, karuzele, generowanie treści przez Claude API

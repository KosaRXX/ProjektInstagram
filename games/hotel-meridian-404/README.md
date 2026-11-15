# HOTEL MERIDIAN: POKÓJ 404

Kinowy escape room 3D w Three.js (React + TypeScript + Vite + Zustand). Jedna osoba, około 25–35 minut.
Moduł jest samodzielny: można go uruchomić osobno albo osadzić w większej aplikacji (np. DuoVerse).

## Uruchomienie

```bash
cd games/hotel-meridian-404
npm install
npm run dev        # wersja developerska (http://localhost:5173)
npm run build      # tsc + vite build -> dist/
npm run preview    # podgląd builda (http://localhost:4173)
npm test           # testy logiki, zapisu i API (Vitest)
```

Parametr `?debug=1` udostępnia `window.__hm404` (store, API, diagnostyka). Nie jest potrzebny do gry.
Parametr `?uid=...` przekazuje identyfikator użytkownika z aplikacji nadrzędnej (nie trafia do zapisu).

## Sterowanie

| Komputer | Telefon / dotyk |
|---|---|
| WASD – ruch, mysz – rozglądanie (kliknij scenę, by przechwycić kursor) | lewy dolny róg – joystick; przeciąganie po prawej – rozglądanie |
| E lub klik – interakcja | dotknięcie obiektu – interakcja; przycisk E |
| Tab – ekwipunek, J – dziennik, H – podpowiedź, Esc – pauza | przyciski Tab / J / H / II (pauza) |

## Zagadki i zależności

Źródłem prawdy jest tabela w `src/data/puzzles.ts` (komentarz nad `PUZZLES`) i reducer w `src/game/logic.ts`.

| Zagadka | Wymaga | Daje |
|---|---|---|
| 1. Zegar o 23:47 | odebrany telefon | notatka z symbolami, prawda `time` |
| 2. Książki | zegar, notatka | mały kluczyk, prawda `books` |
| 3. Radio z przyszłości | książki | żelazna zasuwa, prawda `radio` |
| 4. Lustro pamięci | książki | odblokowanie drzwi lustra, prawda `mirror` |
| 5. Pokój, który się zmienia | radio + lustro | prawda `experiment`, decyzja gracza |
| 6. Ostatnie drzwi | pokój przywrócony | zakończenie |

Zagadka 5 uruchamia się sama, gdy rozwiązane są lustro i radio. Trzeba cofnąć obraz, fotel i zegar, a następnie podjąć decyzję.

## Zakończenia

- **UCIECZKA** – główne drzwi: kod z klucza (`1311`) i zasuwa z radia.
- **PRAWDA** – drzwi lustra: decyzja „Zachowaj wspomnienie” i co najmniej 4 prawdy w dzienniku.
- **PĘTLA** – drzwi „404”: pułapka, dostępna po rozpoczęciu historii.

Każda gałąź kończy się zakończeniem, więc gra nie może się zablokować (testy to sprawdzają).

## Podpowiedzi

Każda zagadka ma trzy poziomy: delikatna sugestia, konkretne naprowadzenie, instrukcja.
Pierwsza podpowiedź pojawia się po 3 minutach bez postępu, kolejna po 90 sekundach lub na żądanie (H).
Podpowiedzi można wyłączyć w ustawieniach.

## Zapis

Zapis przechodzi przez `SaveAdapter` (`src/game/saveAdapter.ts`). Domyślnie używa `localStorage`,
a gdy jest niedostępny, pamięci. Zapis zawiera wyłącznie stan rozgrywki (bez danych użytkownika)
i ma wersję formatu. Uszkodzony zapis jest odrzucany, a gra startuje od nowa.
Autozapis następuje przy każdej rozwiązanej zagadce i przy zakończeniu.

## API integracyjne (`src/game/gameApi.ts`)

```ts
import { startGame, pauseGame, resumeGame, saveGame, loadGame, getGameState, exitGame } from './game/gameApi';

startGame({ userId, continue: true, quality: 'medium', onExit(result) {}, onEvent(e) {}, returnUrl })
pauseGame(); resumeGame();
saveGame();            // -> boolean
loadGame();            // -> boolean
getGameState();        // kopia stanu tylko do odczytu
exitGame();            // -> { ending, elapsedMs, solvedPuzzles, truths, decision, completed }
```

- `userId` jest nieprzezroczystym identyfikatorem z aplikacji nadrzędnej. Nie trafia do zapisu.
- `onEvent` dostaje `puzzleSolved`, `ending` i `saved`.
- Adapter zapisu można podmienić (`saveAdapter`), np. na Firebase albo DuoVerse, bez zmian w logice.

## Struktura

```
src/
  data/       treść zagadek, prawdy, narracja (PL)
  game/       typy, reducer (logika), zapis, API (store Zustand)
  engine/     Three.js: pokój, efekty, kamera FPS, sceny zakończeń, silnik
  audio/      dźwięk proceduralny (Web Audio, przestrzenny)
  ui/         React: ekrany, HUD, panele zagadek, sterowanie dotykowe
  styles/     CSS (paleta art deco)
tests/        Vitest: zagadki, zakończenia, podpowiedzi, zapis, API
```

## Wydajność i jakość

- Jakość Low / Medium / High / Ultra: cienie, bloom, rozdzielczość, liczba cząsteczek.
- Na urządzeniach dotykowych domyślnie niższa rozdzielczość i bez cieni w niskiej jakości.
- Dynamiczne skalowanie rozdzielczości, gdy klatkowanie spada.
- Wszystkie tekstury są proceduralne (canvas), więc gra nie wymaga żadnych plików graficznych ani audio.

## Znane ograniczenia

- Brak plików GLB/audio: wszystko jest proceduralne (świadoma decyzja, bez udawania zasobów).
- Zmiana jakości grafiki przebudowuje silnik (pozycja gracza zostaje, stan gry też).
- Pełny przebieg w przeglądarce najlepiej testować na sprzęcie: środowisko bez GPU (SwiftShader) jest wolne.

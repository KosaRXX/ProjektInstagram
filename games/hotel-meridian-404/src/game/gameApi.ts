/**
 * Publiczne API modułu gry (integracja z aplikacją nadrzędną, np. DuoVerse).
 *
 *   startGame(config)  – nowa gra (lub kontynuacja, gdy config.continue = true i zapis istnieje)
 *   pauseGame()        – pauza (menu ESC)
 *   resumeGame()       – wznowienie
 *   saveGame()         – zapis postępu przez adapter
 *   loadGame()         – wczytanie zapisu
 *   getGameState()     – tylko do odczytu (kopia stanu)
 *   exitGame()         – zakończenie rozgrywki, zwraca wynik i wywołuje onExit
 *
 * Logika nie zna Firebase ani DuoVerse – komunikuje się wyłącznie przez SaveAdapter i callbacki.
 */
import { createStore } from 'zustand/vanilla';
import { PUZZLE_ORDER } from '../data/puzzles';
import { createInitialState, reduce, solvedCount, DEFAULT_SETTINGS } from './logic';
import { createSaveAdapter, type SaveAdapter } from './saveAdapter';
import type { Ending, GameEvent, GameState, PuzzleId, Quality, Settings } from './types';

export type OverlayKind =
  | 'phone'
  | 'clock'
  | 'books'
  | 'mirror'
  | 'radio'
  | 'keypad'
  | 'journal'
  | 'inventory'
  | 'pause'
  | 'settings'
  | 'hint'
  | 'note'
  | 'decision'
  | 'sign'
  | 'message';

export interface Overlay {
  kind: OverlayKind;
  text?: string;
  title?: string;
  /** Obiekt 3D, z którego otwarto panel (kamera wraca tam po zamknięciu). */
  source?: string;
}

export type CinemaKind = Ending;

/** Konfiguracja przekazywana przez aplikację nadrzędną. Nie zawiera ani nie zapisuje danych osobowych. */
export interface GameConfig {
  /** Nieprzezroczysty identyfikator użytkownika z aplikacji nadrzędnej. Nie trafia do zapisu gry. */
  userId?: string;
  /** Kontynuuj zapis, jeśli istnieje (w przeciwnym razie nowa gra). */
  continue?: boolean;
  quality?: Quality;
  settings?: Partial<Settings>;
  saveAdapter?: SaveAdapter;
  /** Wywoływane przy zakończeniu rozgrywki z wynikiem. */
  onExit?: (result: GameResult) => void;
  /** Zdarzenia dla aplikacji nadrzędnej (zagadka rozwiązana, zakończenie). */
  onEvent?: (event: HostEvent) => void;
  /** Adres powrotu do aplikacji nadrzędnej (np. po zakończeniu). */
  returnUrl?: string;
}

export type HostEvent =
  | { type: 'puzzleSolved'; puzzle: PuzzleId; solved: number }
  | { type: 'ending'; ending: Ending }
  | { type: 'saved'; ok: boolean };

export interface GameResult {
  ending: Ending | null;
  elapsedMs: number;
  solvedPuzzles: number;
  truths: number;
  decision: GameState['decision'];
  completed: boolean;
}

export interface GameStoreState {
  game: GameState;
  overlay: Overlay | null;
  subtitle: { text: string; id: number } | null;
  toast: { text: string; id: number } | null;
  /** Podpowiedź widoczna na ekranie (po H lub automatycznie). */
  hint: { text: string; level: number; id: number } | null;
  /** Etykieta obiektu pod celownikiem (np. „Ustaw zegar”). */
  prompt: string | null;
  /** Aktywna sekwencja filmowa zakończenia. */
  cinema: CinemaKind | null;
  hasSave: boolean;
  started: boolean;
  config: GameConfig;
  saveAdapter: SaveAdapter;
  dispatch: (event: GameEvent) => void;
  setOverlay: (overlay: Overlay | null) => void;
  showSubtitle: (text: string, ms?: number) => void;
  showToast: (text: string, ms?: number) => void;
  showHint: (text: string, level: number) => void;
  setPrompt: (prompt: string | null) => void;
  setCinema: (cinema: CinemaKind | null) => void;
}

let uid = 0;
const defaultAdapter = createSaveAdapter();

function hostEmit(config: GameConfig, event: HostEvent): void {
  try {
    config.onEvent?.(event);
  } catch {
    /* błąd w aplikacji nadrzędnej nie może zatrzymać gry */
  }
}

export const gameStore = createStore<GameStoreState>()((set, get) => ({
  game: createInitialState(DEFAULT_SETTINGS),
  overlay: null,
  subtitle: null,
  toast: null,
  hint: null,
  prompt: null,
  cinema: null,
  hasSave: defaultAdapter.read() !== null,
  started: false,
  config: {},
  saveAdapter: defaultAdapter,

  dispatch(event) {
    const prev = get().game;
    const next = reduce(prev, event);
    if (next === prev) return;
    set({ game: next });

    const solvedBefore = PUZZLE_ORDER.filter((id) => prev.puzzles[id] === 'solved');
    for (const id of PUZZLE_ORDER) {
      if (next.puzzles[id] === 'solved' && !solvedBefore.includes(id)) {
        hostEmit(get().config, { type: 'puzzleSolved', puzzle: id, solved: solvedCount(next) });
        get().showToast(`Zagadka rozwiązana`);
        // Autozapis przy każdym postępie – punkt kontrolny.
        const ok = get().saveAdapter.write(next);
        set({ hasSave: ok || get().hasSave });
      }
    }
    if (next.ending && next.ending !== prev.ending) {
      hostEmit(get().config, { type: 'ending', ending: next.ending });
      get().saveAdapter.write(next);
      set({ hasSave: true });
    }
  },

  setOverlay(overlay) {
    set({ overlay });
  },

  showSubtitle(text, ms = 6000) {
    const id = ++uid;
    set({ subtitle: { text, id } });
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (get().subtitle?.id === id) set({ subtitle: null });
      }, ms);
    }
  },

  showHint(text, level) {
    uid += 1;
    set({ hint: { text, level, id: uid } });
  },

  setPrompt(prompt) {
    if (get().prompt !== prompt) set({ prompt });
  },

  setCinema(cinema) {
    set({ cinema });
  },

  showToast(text, ms = 2200) {
    const id = ++uid;
    set({ toast: { text, id } });
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, ms);
    }
  },
}));

// ---------- Publiczne API ----------

export function startGame(config: GameConfig = {}): GameState {
  const adapter = config.saveAdapter ?? defaultAdapter;
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...(config.settings ?? {}),
    ...(config.quality ? { quality: config.quality } : {}),
  };
  const saved = config.continue ? adapter.read() : null;
  // Zakończona gra nie jest kontynuowana – zaczynamy od nowa.
  const game = saved && !saved.ending ? saved : createInitialState(settings);
  game.phase = 'playing';
  gameStore.setState({
    config: { ...config, userId: config.userId },
    saveAdapter: adapter,
    game,
    overlay: null,
    subtitle: null,
    hint: null,
    cinema: null,
    started: true,
    hasSave: adapter.read() !== null,
  });
  uid += 1;
  return game;
}

export function pauseGame(): void {
  const game = gameStore.getState().game;
  if (game.phase !== 'playing') return;
  gameStore.getState().dispatch({ type: 'setPhase', phase: 'paused' });
  gameStore.setState({ overlay: { kind: 'pause' } });
}

export function resumeGame(): void {
  const game = gameStore.getState().game;
  if (game.phase !== 'paused') return;
  gameStore.getState().dispatch({ type: 'setPhase', phase: 'playing' });
  gameStore.setState({ overlay: null });
}

export function saveGame(): boolean {
  const { game, saveAdapter, config } = gameStore.getState();
  const ok = saveAdapter.write(game);
  gameStore.setState({ hasSave: ok || saveAdapter.read() !== null });
  hostEmit(config, { type: 'saved', ok });
  return ok;
}

export function loadGame(): boolean {
  const { saveAdapter } = gameStore.getState();
  const loaded = saveAdapter.read();
  if (!loaded || loaded.ending) return false;
  gameStore.setState({ game: loaded, overlay: null, started: true });
  return true;
}

export function hasSavedGame(): boolean {
  return gameStore.getState().saveAdapter.read() !== null;
}

/** Kopia stanu tylko do odczytu – zmiany nie wpływają na grę. */
export function getGameState(): Readonly<GameState> {
  return JSON.parse(JSON.stringify(gameStore.getState().game)) as GameState;
}

export function resetGame(): void {
  const { saveAdapter } = gameStore.getState();
  saveAdapter.clear();
  gameStore.setState({ hasSave: false });
}

export function exitGame(): GameResult {
  const { game, config } = gameStore.getState();
  const result: GameResult = {
    ending: game.ending,
    elapsedMs: game.elapsedMs,
    solvedPuzzles: solvedCount(game),
    truths: game.truths.length,
    decision: game.decision,
    completed: game.ending !== null,
  };
  gameStore.setState({ overlay: null, started: false });
  gameStore.getState().dispatch({ type: 'setPhase', phase: 'playing' });
  config.onExit?.(result);
  if (config.returnUrl && typeof window !== 'undefined') {
    window.location.assign(config.returnUrl);
  }
  return result;
}

import {
  BOOK_ORDER,
  CLOCK_TARGET,
  EXIT_CODE,
  HINT_FIRST_DELAY_MS,
  HINT_NEXT_DELAY_MS,
  MIRROR_DIFFERENCES,
  PUZZLES,
  PUZZLE_ORDER,
  RADIO_CORRECT_ORDER,
  RADIO_STATIONS,
  TRUTHS,
} from '../data/puzzles';
import type {
  ClockTime,
  Decision,
  GameEvent,
  GameFlags,
  GameState,
  ItemId,
  PuzzleId,
  PuzzleStatus,
  Settings,
  TruthId,
} from './types';

export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  hintsEnabled: true,
  subtitles: true,
  quality: 'medium',
  sensitivity: 1,
  showTimer: false,
  muted: false,
};

const INITIAL_FLAGS: GameFlags = {
  storyStarted: false,
  phoneHeard: false,
  bookPullsWrong: 0,
  roomReversed: false,
  paintingFlipped: false,
  chairMoved: false,
  clockReversed: false,
  trapTouched: false,
  keypadTried: false,
};

export function createInitialState(settings: Settings = DEFAULT_SETTINGS, now = 0): GameState {
  const state: GameState = {
    version: SAVE_VERSION,
    phase: 'playing',
    puzzles: Object.fromEntries(PUZZLE_ORDER.map((id) => [id, 'locked'])) as Record<PuzzleId, PuzzleStatus>,
    inventory: [],
    truths: [],
    flags: { ...INITIAL_FLAGS },
    clock: { hour12: 11, minute: 12, pm: false },
    progress: { bookOrder: [], mirrorFound: [], radioTuned: [], radioOrder: [] },
    decision: null,
    ending: null,
    elapsedMs: 0,
    lastProgressAtMs: 0,
    hintLevels: {},
    lastHintAtMs: -HINT_NEXT_DELAY_MS,
    settings: { ...settings },
  };
  void now;
  return refreshPuzzles(state);
}

/** Klon stanu – stan jest mały, więc prosta kopia JSON wystarcza i gwarantuje brak współdzielenia. */
function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function allSolved(state: GameState, ids: PuzzleId[]): boolean {
  return ids.every((id) => state.puzzles[id] === 'solved');
}

/** Przelicza statusy zagadek (locked/active) na podstawie zależności z tabeli. Zakończone pozostają zakończone. */
export function refreshPuzzles(input: GameState): GameState {
  const state = clone(input);
  for (const id of PUZZLE_ORDER) {
    if (state.puzzles[id] === 'solved') continue;
    const def = PUZZLES[id];
    const canStart =
      allSolved(state, def.prereqs) &&
      def.requiredFlags.every((f) => state.flags[f]) &&
      def.requiredItems.every((item) => state.inventory.includes(item));
    state.puzzles[id] = canStart ? 'active' : 'locked';
  }
  // Pokój odwraca się dokładnie w chwili, gdy zagadka „shift” staje się aktywna (po lustrze i radiu).
  if (state.puzzles.shift === 'active' && !state.flags.roomReversed) {
    state.flags.roomReversed = true;
    state.flags.paintingFlipped = true;
    state.flags.chairMoved = true;
    state.flags.clockReversed = true;
  }
  return state;
}

function addItem(state: GameState, item: ItemId): void {
  if (!state.inventory.includes(item)) state.inventory.push(item);
}

function addTruth(state: GameState, truth: TruthId): void {
  if (!state.truths.includes(truth)) state.truths.push(truth);
}

function markProgress(state: GameState): void {
  state.lastProgressAtMs = state.elapsedMs;
}

/** Oznacza zagadkę jako rozwiązaną i nalicza jej nagrody (przedmioty, prawdę). */
function solve(state: GameState, id: PuzzleId): void {
  if (state.puzzles[id] === 'solved') return;
  state.puzzles[id] = 'solved';
  const def = PUZZLES[id];
  def.rewardItems.forEach((item) => addItem(state, item));
  if (def.rewardTruth) addTruth(state, def.rewardTruth);
  markProgress(state);
}

function isClockTarget(clock: ClockTime): boolean {
  return clock.hour12 === CLOCK_TARGET.hour12 && clock.minute === CLOCK_TARGET.minute && clock.pm === CLOCK_TARGET.pm;
}

function isShiftRestored(state: GameState): boolean {
  return !state.flags.paintingFlipped && !state.flags.chairMoved && !state.flags.clockReversed;
}

/** Zamienia zdarzenie na nowy stan. Funkcja jest czysta: nie modyfikuje argumentu. */
export function reduce(input: GameState, event: GameEvent): GameState {
  let state = clone(input);
  if (state.phase === 'ending' && event.type !== 'setSettings' && event.type !== 'setPhase') return state;

  switch (event.type) {
    case 'storyStarted':
      state.flags.storyStarted = true;
      break;

    case 'phoneAnswered':
      state.flags.storyStarted = true;
      state.flags.phoneHeard = true;
      break;

    case 'itemFound':
      addItem(state, event.item);
      markProgress(state);
      break;

    case 'clockSet': {
      state.clock = { ...event.clock };
      if (state.flags.clockReversed && isClockTarget(state.clock)) state.flags.clockReversed = false;
      if (state.puzzles.clock === 'active' && isClockTarget(state.clock)) solve(state, 'clock');
      break;
    }

    case 'bookPulled': {
      if (state.puzzles.books !== 'active') break;
      const expected = BOOK_ORDER[state.progress.bookOrder.length];
      if (event.symbol === expected) {
        state.progress.bookOrder.push(event.symbol);
        if (state.progress.bookOrder.length === BOOK_ORDER.length) solve(state, 'books');
      } else {
        // Zła kolejność: wszystkie wyciągnięte książki wracają na półkę.
        state.progress.bookOrder = [];
        state.flags.bookPullsWrong += 1;
      }
      break;
    }

    case 'radioTuned': {
      if (state.puzzles.radio !== 'active') break;
      if (event.station in RADIO_STATIONS && !state.progress.radioTuned.includes(event.station)) {
        state.progress.radioTuned.push(event.station);
      }
      break;
    }

    case 'radioOrder': {
      if (state.puzzles.radio !== 'active') break;
      state.progress.radioOrder = [...event.order];
      const tunedAll = RADIO_CORRECT_ORDER.every((s) => state.progress.radioTuned.includes(s));
      const orderOk =
        event.order.length === RADIO_CORRECT_ORDER.length &&
        event.order.every((s, i) => s === RADIO_CORRECT_ORDER[i]);
      if (tunedAll && orderOk) solve(state, 'radio');
      break;
    }

    case 'mirrorSpot': {
      if (state.puzzles.mirror !== 'active') break;
      if ((MIRROR_DIFFERENCES as readonly string[]).includes(event.spot) && !state.progress.mirrorFound.includes(event.spot)) {
        state.progress.mirrorFound.push(event.spot);
        if (state.progress.mirrorFound.length === MIRROR_DIFFERENCES.length) solve(state, 'mirror');
      }
      break;
    }

    case 'paintingFlipped':
      if (state.puzzles.shift === 'active') state.flags.paintingFlipped = !state.flags.paintingFlipped;
      break;

    case 'chairMoved':
      if (state.puzzles.shift === 'active') state.flags.chairMoved = !state.flags.chairMoved;
      break;

    case 'decision':
      if (state.puzzles.shift === 'active' && isShiftRestored(state)) {
        state.decision = event.choice;
        solve(state, 'shift');
      }
      break;

    case 'keypadEntered': {
      if (state.puzzles.exit !== 'active') break;
      state.flags.keypadTried = true;
      if (event.code === EXIT_CODE && state.inventory.includes('bolt')) {
        solve(state, 'exit');
        state = endGame(state, 'escape');
      }
      break;
    }

    case 'mirrorDoorOpened': {
      if (state.puzzles.exit !== 'active') break;
      const canPass = state.puzzles.mirror === 'solved' && state.decision === 'keep' && state.truths.length >= 4;
      if (canPass) {
        solve(state, 'exit');
        state = endGame(state, 'truth');
      }
      break;
    }

    case 'trapDoorOpened':
      if (state.flags.storyStarted) {
        state.flags.trapTouched = true;
        state = endGame(state, 'loop');
      }
      break;

    case 'elapsed':
      state.elapsedMs += Math.max(0, event.ms);
      break;

    case 'hintShown': {
      const current = state.hintLevels[event.puzzle] ?? 0;
      state.hintLevels[event.puzzle] = Math.min(PUZZLES[event.puzzle].hints.length, current + 1);
      state.lastHintAtMs = state.elapsedMs;
      break;
    }

    case 'setSettings':
      state.settings = { ...state.settings, ...event.patch };
      break;

    case 'setPhase':
      state.phase = event.phase;
      break;

    case 'newGame':
      return createInitialState(event.settings, event.now);
  }

  return refreshPuzzles(state);
}

function endGame(state: GameState, ending: GameState['ending']): GameState {
  state.ending = ending;
  state.phase = 'ending';
  return state;
}

// ---------- Podpowiedzi ----------

/** Pierwsza aktywna (nierozwiązana, dostępna) zagadka w kolejności tabeli – to na nią wskazują podpowiedzi. */
export function currentPuzzle(state: GameState): PuzzleId | null {
  return PUZZLE_ORDER.find((id) => state.puzzles[id] === 'active') ?? null;
}

/** Czy należy automatycznie pokazać kolejną podpowiedź (po 3 min bez postępu, potem co 90 s). */
export function isAutoHintDue(state: GameState): boolean {
  if (!state.settings.hintsEnabled || state.phase !== 'playing') return false;
  const puzzle = currentPuzzle(state);
  if (!puzzle) return false;
  const level = state.hintLevels[puzzle] ?? 0;
  if (level >= PUZZLES[puzzle].hints.length) return false;
  if (level === 0) return state.elapsedMs - state.lastProgressAtMs >= HINT_FIRST_DELAY_MS;
  return state.elapsedMs - state.lastHintAtMs >= HINT_NEXT_DELAY_MS;
}

/** Tekst podpowiedzi dla aktualnej zagadki na poziomie następnym (lub ostatnim, jeśli wyczerpane). */
export function nextHint(state: GameState): { puzzle: PuzzleId; level: number; text: string } | null {
  const puzzle = currentPuzzle(state);
  if (!puzzle) return null;
  const shown = state.hintLevels[puzzle] ?? 0;
  const hints = PUZZLES[puzzle].hints;
  const level = Math.min(hints.length, shown + 1);
  return { puzzle, level, text: hints[level - 1] };
}

// ---------- Zapytania pomocnicze (używane przez UI i testy) ----------

export function solvedCount(state: GameState): number {
  return PUZZLE_ORDER.filter((id) => state.puzzles[id] === 'solved').length;
}

export function canOpenMirrorDoor(state: GameState): boolean {
  return state.puzzles.exit === 'active' && state.puzzles.mirror === 'solved' && state.decision === 'keep' && state.truths.length >= 4;
}

export function hasTruth(state: GameState, truth: TruthId): boolean {
  return state.truths.includes(truth);
}

export function truthText(truth: TruthId): string {
  return TRUTHS[truth];
}

export function decisionLabel(decision: Decision | null): string {
  if (decision === 'keep') return 'Zachowaj wspomnienie';
  if (decision === 'forget') return 'Zapomnij';
  return 'Brak decyzji';
}

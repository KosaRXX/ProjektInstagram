// Typy stanu gry. Stan jest w całości serializowalny (JSON) i NIE zawiera danych osobowych.

export type PuzzleId = 'clock' | 'books' | 'mirror' | 'radio' | 'shift' | 'exit';
export type PuzzleStatus = 'locked' | 'active' | 'solved';
export type ItemId = 'key' | 'note' | 'drawerKey' | 'bolt';
export type TruthId = 'time' | 'books' | 'mirror' | 'radio' | 'experiment';
export type Ending = 'escape' | 'truth' | 'loop';
export type Decision = 'keep' | 'forget';
export type Phase = 'menu' | 'playing' | 'paused' | 'ending';
export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface Settings {
  hintsEnabled: boolean;
  subtitles: boolean;
  quality: Quality;
  sensitivity: number; // 0.5 – 2
  showTimer: boolean;
  muted: boolean;
}

export interface ClockTime {
  hour12: number; // 1–12
  minute: number; // 0–59
  pm: boolean;
}

export interface GameFlags {
  storyStarted: boolean;
  phoneHeard: boolean;
  bookPullsWrong: number;
  roomReversed: boolean; // odwrócenie pokoju aktywne (światło wróciło)
  paintingFlipped: boolean;
  chairMoved: boolean;
  clockReversed: boolean;
  trapTouched: boolean;
  keypadTried: boolean;
}

export interface GameState {
  version: number;
  phase: Phase;
  puzzles: Record<PuzzleId, PuzzleStatus>;
  inventory: ItemId[];
  truths: TruthId[];
  flags: GameFlags;
  clock: ClockTime;
  /** Postęp wieloetapowych zagadek (kolejność ksiąg, znalezione różnice, dostrojone stacje). */
  progress: {
    bookOrder: string[]; // symbole wyciągnięte w kolejności
    mirrorFound: string[];
    radioTuned: string[];
    radioOrder: string[];
  };
  decision: Decision | null;
  ending: Ending | null;
  elapsedMs: number;
  /** Czas gry (ms) w chwili ostatniego postępu – do podpowiedzi. */
  lastProgressAtMs: number;
  /** Ile podpowiedzi odkryto na każdą zagadkę (0 = żadnej). */
  hintLevels: Partial<Record<PuzzleId, number>>;
  lastHintAtMs: number;
  settings: Settings;
}

export type GameEvent =
  | { type: 'storyStarted' }
  | { type: 'phoneAnswered' }
  | { type: 'itemFound'; item: ItemId }
  | { type: 'clockSet'; clock: ClockTime }
  | { type: 'bookPulled'; symbol: string }
  | { type: 'mirrorSpot'; spot: string }
  | { type: 'radioTuned'; station: string }
  | { type: 'radioOrder'; order: string[] }
  | { type: 'paintingFlipped' }
  | { type: 'chairMoved' }
  | { type: 'decision'; choice: Decision }
  | { type: 'keypadEntered'; code: string }
  | { type: 'mirrorDoorOpened' }
  | { type: 'trapDoorOpened' }
  | { type: 'elapsed'; ms: number }
  | { type: 'hintShown'; puzzle: PuzzleId }
  | { type: 'setSettings'; patch: Partial<Settings> }
  | { type: 'setPhase'; phase: Phase }
  | { type: 'newGame'; now: number; settings: Settings };

import { PUZZLE_ORDER } from '../data/puzzles';
import { SAVE_VERSION, createInitialState } from './logic';
import type { GameState } from './types';

/** Minimalny kontrakt magazynu klucz–wartość. Gra nie zna konkretnego dostawcy (localStorage, Firebase, DuoVerse…). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Adapter zapisu gry – to jedyne miejsce, z którego logika zapisu korzysta. */
export interface SaveAdapter {
  read(): GameState | null;
  write(state: GameState): boolean;
  clear(): void;
  /** Krótka etykieta do UI/diagnostyki, np. „localStorage” lub „pamięć”. */
  readonly backend: string;
}

export const SAVE_KEY = 'hotel-meridian-404:save:v1';

/** Magazyn w pamięci – używany, gdy przeglądarka blokuje localStorage (tryb prywatny, testy). */
export function createMemoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** Magazyn oparty o localStorage; `null`, jeśli dostęp jest niedostępny lub rzuca wyjątek. */
export function createBrowserStore(): KeyValueStore | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = '__hm404_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
    };
  } catch {
    return null;
  }
}

/** Serializacja z wersją. Zapisywany jest wyłącznie stan rozgrywki – bez danych użytkownika. */
export function serializeSave(state: GameState): string {
  const { version: _v, ...rest } = state;
  void _v;
  return JSON.stringify({ format: 'hm404-save', version: SAVE_VERSION, savedAt: Date.now(), state: { ...rest, version: SAVE_VERSION } });
}

/** Walidacja zapisu. Niepoprawny lub nowszy format jest odrzucany (zamiast wywalać grę). */
export function parseSave(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { format?: string; version?: number; state?: GameState };
    if (data.format !== 'hm404-save' || data.version !== SAVE_VERSION || !data.state) return null;
    const s = data.state;
    const base = createInitialState(s.settings);
    const validPuzzles = PUZZLE_ORDER.every((id) => ['locked', 'active', 'solved'].includes(s.puzzles?.[id]));
    if (!validPuzzles || !Array.isArray(s.inventory) || !Array.isArray(s.truths)) return null;
    // Scalenie z wartościami domyślnymi: brakujące pola nie psują stanu.
    const merged: GameState = {
      ...base,
      ...s,
      version: SAVE_VERSION,
      phase: s.phase === 'ending' ? 'ending' : 'playing',
      flags: { ...base.flags, ...s.flags },
      progress: { ...base.progress, ...s.progress },
      settings: { ...base.settings, ...s.settings },
      clock: { ...base.clock, ...s.clock },
      hintLevels: { ...(s.hintLevels ?? {}) },
    };
    return merged;
  } catch {
    return null;
  }
}

export function createSaveAdapter(
  store: KeyValueStore | null = createBrowserStore(),
  key = SAVE_KEY,
): SaveAdapter {
  const backend = store ? 'localStorage' : 'pamięć';
  const fallback = store ?? createMemoryStore();
  return {
    backend,
    read() {
      try {
        return parseSave(fallback.getItem(key));
      } catch {
        return null;
      }
    },
    write(state) {
      try {
        fallback.setItem(key, serializeSave(state));
        return true;
      } catch {
        return false; // pełny magazyn / zablokowany zapis – gra działa dalej bez zapisu
      }
    },
    clear() {
      try {
        fallback.removeItem(key);
      } catch {
        /* ignorujemy – brak zapisu nie blokuje gry */
      }
    },
  };
}

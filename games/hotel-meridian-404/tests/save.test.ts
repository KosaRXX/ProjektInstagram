import { describe, expect, it } from 'vitest';
import { createMemoryStore, createSaveAdapter, parseSave, serializeSave, SAVE_KEY } from '../src/game/saveAdapter';
import { createInitialState, reduce } from '../src/game/logic';
import { gameStore, startGame, saveGame, loadGame, getGameState, exitGame, pauseGame, resumeGame, resetGame, hasSavedGame } from '../src/game/gameApi';

describe('zapis i odczyt', () => {
  it('serializacja i parsowanie zachowują stan', () => {
    const s = reduce(createInitialState(), { type: 'phoneAnswered' });
    const back = parseSave(serializeSave(s));
    expect(back?.puzzles.clock).toBe('active');
    expect(back?.flags.phoneHeard).toBe(true);
  });

  it('odrzuca uszkodzony lub obcy zapis', () => {
    expect(parseSave('{nie json')).toBeNull();
    expect(parseSave(JSON.stringify({ format: 'inne', version: 1, state: {} }))).toBeNull();
    expect(parseSave(JSON.stringify({ format: 'hm404-save', version: 99, state: {} }))).toBeNull();
    expect(parseSave(null)).toBeNull();
  });

  it('zapis nie zawiera danych użytkownika', () => {
    const store = createMemoryStore();
    const adapter = createSaveAdapter(store);
    startGame({ userId: 'user-secret-123', saveAdapter: adapter });
    saveGame();
    const raw = store.getItem(SAVE_KEY) ?? '';
    expect(raw).not.toContain('user-secret-123');
    expect(raw).not.toContain('userId');
  });

  it('adapter bez działającego magazynu nie rzuca wyjątku', () => {
    const broken = {
      getItem: () => { throw new Error('zablokowane'); },
      setItem: () => { throw new Error('pełne'); },
      removeItem: () => { throw new Error('zablokowane'); },
    };
    const adapter = createSaveAdapter(broken);
    expect(adapter.read()).toBeNull();
    expect(adapter.write(createInitialState())).toBe(false);
    expect(() => adapter.clear()).not.toThrow();
  });

  it('kontynuacja po „odświeżeniu” wraca do tego samego miejsca', () => {
    const store = createMemoryStore();
    const adapter = createSaveAdapter(store);
    startGame({ saveAdapter: adapter });
    gameStore.getState().dispatch({ type: 'phoneAnswered' });
    gameStore.getState().dispatch({ type: 'clockSet', clock: { hour12: 11, minute: 47, pm: true } });
    expect(gameStore.getState().game.puzzles.clock).toBe('solved');
    // symulacja odświeżenia: nowy adapter na tym samym magazynie
    const reloaded = startGame({ saveAdapter: createSaveAdapter(store), continue: true });
    expect(reloaded.puzzles.clock).toBe('solved');
    expect(reloaded.inventory).toContain('note');
  });

  it('reset usuwa zapis, a nowa gra zaczyna od zera', () => {
    const adapter = createSaveAdapter(createMemoryStore());
    startGame({ saveAdapter: adapter });
    saveGame();
    expect(hasSavedGame()).toBe(true);
    resetGame();
    expect(hasSavedGame()).toBe(false);
    const fresh = startGame({ saveAdapter: adapter, continue: true });
    expect(fresh.puzzles.clock).toBe('locked');
  });
});

describe('publiczne API', () => {
  it('pauza i wznowienie zmieniają fazę', () => {
    startGame({ saveAdapter: createSaveAdapter(createMemoryStore()) });
    pauseGame();
    expect(getGameState().phase).toBe('paused');
    resumeGame();
    expect(getGameState().phase).toBe('playing');
  });

  it('getGameState zwraca kopię – zmiana kopii nie zmienia gry', () => {
    startGame({ saveAdapter: createSaveAdapter(createMemoryStore()) });
    const copy = getGameState() as { inventory: string[] };
    copy.inventory.push('bolt');
    expect(getGameState().inventory).not.toContain('bolt');
  });

  it('loadGame wczytuje zapis; bez zapisu zwraca false', () => {
    const adapter = createSaveAdapter(createMemoryStore());
    startGame({ saveAdapter: adapter });
    expect(loadGame()).toBe(false);
    saveGame();
    expect(loadGame()).toBe(true);
  });

  it('exitGame zwraca wynik i wywołuje onExit oraz zdarzenia gospodarza', () => {
    const exits: unknown[] = [];
    const host: string[] = [];
    startGame({
      saveAdapter: createSaveAdapter(createMemoryStore()),
      onExit: (r) => exits.push(r),
      onEvent: (e) => host.push(e.type),
    });
    gameStore.getState().dispatch({ type: 'phoneAnswered' });
    gameStore.getState().dispatch({ type: 'clockSet', clock: { hour12: 11, minute: 47, pm: true } });
    const result = exitGame();
    expect(result.solvedPuzzles).toBe(1);
    expect(result.completed).toBe(false);
    expect(exits).toHaveLength(1);
    expect(host).toContain('puzzleSolved');
  });

  it('błąd w callbacku gospodarza nie zatrzymuje gry', () => {
    startGame({ saveAdapter: createSaveAdapter(createMemoryStore()), onEvent: () => { throw new Error('host'); } });
    expect(() => gameStore.getState().dispatch({ type: 'phoneAnswered' })).not.toThrow();
    expect(getGameState().flags.phoneHeard).toBe(true);
  });
});

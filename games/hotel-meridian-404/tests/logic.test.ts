import { describe, expect, it } from 'vitest';
import { createInitialState, nextHint, reduce, isAutoHintDue, canOpenMirrorDoor, currentPuzzle } from '../src/game/logic';
import type { GameEvent, GameState } from '../src/game/types';
import { BOOK_ORDER, HINT_FIRST_DELAY_MS, RADIO_CORRECT_ORDER, PUZZLE_ORDER, PUZZLES, MIRROR_DIFFERENCES } from '../src/data/puzzles';

const run = (s: GameState, events: GameEvent[]) => events.reduce(reduce, s);
const CLOCK_OK = { hour12: 11, minute: 47, pm: true };

/** Pełne, poprawne przejście gry – „ścieżka escape”. */
const WALKTHROUGH: GameEvent[] = [
  { type: 'phoneAnswered' },
  { type: 'clockSet', clock: CLOCK_OK },
  { type: 'bookPulled', symbol: BOOK_ORDER[0] },
  { type: 'bookPulled', symbol: BOOK_ORDER[1] },
  { type: 'bookPulled', symbol: BOOK_ORDER[2] },
  { type: 'bookPulled', symbol: BOOK_ORDER[3] },
  { type: 'radioTuned', station: 'st-1974' },
  { type: 'radioTuned', station: 'st-1989' },
  { type: 'radioTuned', station: 'st-2026' },
  { type: 'radioOrder', order: [...RADIO_CORRECT_ORDER] },
  { type: 'mirrorSpot', spot: 'lamp' },
  { type: 'mirrorSpot', spot: 'chair' },
  { type: 'mirrorSpot', spot: 'painting' },
  { type: 'paintingFlipped' },
  { type: 'chairMoved' },
  { type: 'clockSet', clock: CLOCK_OK },
  { type: 'decision', choice: 'forget' },
];

describe('zależności zagadek (tabela)', () => {
  it('startuje z zagadką zegara dopiero po odebraniu telefonu', () => {
    const s0 = createInitialState();
    expect(s0.puzzles.clock).toBe('locked');
    const s1 = reduce(s0, { type: 'phoneAnswered' });
    expect(s1.puzzles.clock).toBe('active');
    expect(s1.puzzles.books).toBe('locked');
  });

  it('każda zagadka ma zdefiniowane wymagania zgodne z tabelą', () => {
    for (const id of PUZZLE_ORDER) {
      for (const pre of PUZZLES[id].prereqs) expect(PUZZLE_ORDER).toContain(pre);
      expect(PUZZLES[id].hints).toHaveLength(3);
    }
  });

  it('zagadka książek wymaga notatki z zegara, radio i lustro po książkach', () => {
    let s = run(createInitialState(), [{ type: 'phoneAnswered' }]);
    s = run(s, [{ type: 'clockSet', clock: CLOCK_OK }]);
    expect(s.puzzles.books).toBe('active');
    expect(s.puzzles.radio).toBe('locked');
    s = run(s, [{ type: 'bookPulled', symbol: BOOK_ORDER[0] }]);
    expect(s.puzzles.radio).toBe('locked'); // jeszcze nie rozwiązana
  });
});

describe('zagadka 1 – zegar', () => {
  it('nie rozwiązuje się przy złej godzinie i daje notatkę + prawdę po poprawnym ustawieniu', () => {
    let s = run(createInitialState(), [{ type: 'phoneAnswered' }]);
    s = run(s, [{ type: 'clockSet', clock: { hour12: 11, minute: 47, pm: false } }]);
    expect(s.puzzles.clock).toBe('active');
    s = run(s, [{ type: 'clockSet', clock: CLOCK_OK }]);
    expect(s.puzzles.clock).toBe('solved');
    expect(s.inventory).toContain('note');
    expect(s.truths).toContain('time');
  });
});

describe('zagadka 2 – książki', () => {
  it('poprawna kolejność otwiera skrytkę; zła resetuje tacę', () => {
    let s = run(createInitialState(), [{ type: 'phoneAnswered' }, { type: 'clockSet', clock: CLOCK_OK }]);
    s = run(s, [{ type: 'bookPulled', symbol: 'OKO' }]);
    expect(s.progress.bookOrder).toEqual([]);
    expect(s.flags.bookPullsWrong).toBe(1);
    s = run(s, BOOK_ORDER.map((symbol) => ({ type: 'bookPulled', symbol }) as GameEvent));
    expect(s.puzzles.books).toBe('solved');
    expect(s.inventory).toContain('drawerKey');
  });
});

describe('zagadka 3 – lustro', () => {
  it('wymaga wszystkich różnic', () => {
    let s = run(createInitialState(), [{ type: 'phoneAnswered' }, { type: 'clockSet', clock: CLOCK_OK }, ...BOOK_ORDER.map((symbol) => ({ type: 'bookPulled', symbol }) as GameEvent)]);
    s = run(s, [{ type: 'mirrorSpot', spot: 'lamp' }, { type: 'mirrorSpot', spot: 'lamp' }, { type: 'mirrorSpot', spot: 'nie-ma' }]);
    expect(s.puzzles.mirror).toBe('active');
    s = run(s, MIRROR_DIFFERENCES.map((spot) => ({ type: 'mirrorSpot', spot }) as GameEvent));
    expect(s.puzzles.mirror).toBe('solved');
    expect(s.truths).toContain('mirror');
  });
});

describe('zagadka 4 – radio', () => {
  it('wymaga dostrojenia wszystkich stacji i chronologicznej kolejności', () => {
    let s = run(createInitialState(), [{ type: 'phoneAnswered' }, { type: 'clockSet', clock: CLOCK_OK }, ...BOOK_ORDER.map((symbol) => ({ type: 'bookPulled', symbol }) as GameEvent)]);
    s = run(s, [{ type: 'radioTuned', station: 'st-1974' }, { type: 'radioOrder', order: [...RADIO_CORRECT_ORDER] }]);
    expect(s.puzzles.radio).toBe('active');
    s = run(s, [{ type: 'radioTuned', station: 'st-1989' }, { type: 'radioTuned', station: 'st-2026' }, { type: 'radioOrder', order: ['st-2026', 'st-1974', 'st-1989'] }]);
    expect(s.puzzles.radio).toBe('active');
    s = run(s, [{ type: 'radioOrder', order: [...RADIO_CORRECT_ORDER] }]);
    expect(s.puzzles.radio).toBe('solved');
    expect(s.inventory).toContain('bolt');
  });
});

describe('zagadka 5 – pokój, który się zmienia', () => {
  it('uruchamia odwrócenie po lustrze i radiu; wymaga cofnięcia wszystkiego i decyzji', () => {
    let s = run(createInitialState(), WALKTHROUGH.slice(0, 13));
    expect(s.puzzles.shift).toBe('active');
    expect(s.flags.roomReversed).toBe(true);
    expect(s.flags.paintingFlipped && s.flags.chairMoved && s.flags.clockReversed).toBe(true);
    // decyzja przed cofnięciem jest ignorowana
    s = run(s, [{ type: 'decision', choice: 'keep' }]);
    expect(s.puzzles.shift).toBe('active');
    s = run(s, [{ type: 'paintingFlipped' }, { type: 'chairMoved' }, { type: 'clockSet', clock: CLOCK_OK }]);
    expect(s.puzzles.shift).toBe('active');
    s = run(s, [{ type: 'decision', choice: 'keep' }]);
    expect(s.puzzles.shift).toBe('solved');
    expect(s.puzzles.exit).toBe('active');
    expect(s.truths).toContain('experiment');
  });
});

describe('zakończenia', () => {
  it('ESCAPE: poprawny kod + zasuwa z radia otwierają główne drzwi', () => {
    const s = run(createInitialState(), [...WALKTHROUGH, { type: 'keypadEntered', code: '1311' }]);
    expect(s.ending).toBe('escape');
    expect(s.phase).toBe('ending');
    expect(s.puzzles.exit).toBe('solved');
  });

  it('bez zasuwy kod nie otwiera drzwi', () => {
    const base = run(createInitialState(), WALKTHROUGH);
    const withoutBolt = { ...base, inventory: base.inventory.filter((i) => i !== 'bolt') };
    expect(withoutBolt.puzzles.exit).toBe('active');
    const s = run(withoutBolt, [{ type: 'keypadEntered', code: '1311' }]);
    expect(s.ending).toBeNull();
    expect(s.flags.keypadTried).toBe(true);
    // zły kod też nie kończy gry
    expect(run(base, [{ type: 'keypadEntered', code: '0000' }]).ending).toBeNull();
  });

  it('TRUTH: lustro otwiera się tylko przy decyzji „zachowaj” i ≥4 prawdach', () => {
    const forget = run(createInitialState(), [...WALKTHROUGH.slice(0, -1), { type: 'decision', choice: 'forget' }, { type: 'mirrorDoorOpened' }]);
    expect(forget.ending).toBeNull();
    const keep = run(createInitialState(), [...WALKTHROUGH.slice(0, -1), { type: 'decision', choice: 'keep' }]);
    expect(canOpenMirrorDoor(keep)).toBe(true);
    const truth = reduce(keep, { type: 'mirrorDoorOpened' });
    expect(truth.ending).toBe('truth');
  });

  it('LOOP: drzwi 404 prowadzą do pętli po rozpoczęciu historii', () => {
    const before = reduce(createInitialState(), { type: 'trapDoorOpened' });
    expect(before.ending).toBeNull();
    const after = reduce(run(createInitialState(), [{ type: 'phoneAnswered' }]), { type: 'trapDoorOpened' });
    expect(after.ending).toBe('loop');
  });

  it('po zakończeniu gra ignoruje zdarzenia rozgrywki', () => {
    const ended = run(createInitialState(), [{ type: 'phoneAnswered' }, { type: 'trapDoorOpened' }]);
    const again = reduce(ended, { type: 'clockSet', clock: CLOCK_OK });
    expect(again.ending).toBe('loop');
    expect(again.puzzles.clock).toBe('active');
  });
});

describe('podpowiedzi', () => {
  it('auto-podpowiedź pojawia się po 3 minutach bez postępu, a potem na żądanie', () => {
    let s = run(createInitialState(), [{ type: 'phoneAnswered' }]);
    expect(isAutoHintDue(s)).toBe(false);
    s = reduce(s, { type: 'elapsed', ms: HINT_FIRST_DELAY_MS });
    expect(isAutoHintDue(s)).toBe(true);
    const h = nextHint(s);
    expect(h?.puzzle).toBe('clock');
    expect(h?.level).toBe(1);
    s = reduce(s, { type: 'hintShown', puzzle: 'clock' });
    expect(isAutoHintDue(s)).toBe(false);
    expect(nextHint(s)?.level).toBe(2);
  });

  it('podpowiedzi można wyłączyć w ustawieniach', () => {
    let s = run(createInitialState(), [{ type: 'phoneAnswered' }, { type: 'setSettings', patch: { hintsEnabled: false } }]);
    s = reduce(s, { type: 'elapsed', ms: HINT_FIRST_DELAY_MS * 3 });
    expect(isAutoHintDue(s)).toBe(false);
  });

  it('wskazówki odpowiadają aktualnej zagadce', () => {
    const s = run(createInitialState(), [{ type: 'phoneAnswered' }, { type: 'clockSet', clock: CLOCK_OK }]);
    expect(currentPuzzle(s)).toBe('books');
    expect(nextHint(s)?.puzzle).toBe('books');
  });
});

describe('ekwipunek i ustawienia', () => {
  it('przedmioty nie dublują się w ekwipunku', () => {
    const s = run(createInitialState(), [{ type: 'itemFound', item: 'key' }, { type: 'itemFound', item: 'key' }]);
    expect(s.inventory.filter((i) => i === 'key')).toHaveLength(1);
  });

  it('ustawienia są scalane, a inne pola zostają bez zmian', () => {
    const s = run(createInitialState(), [{ type: 'setSettings', patch: { quality: 'high', subtitles: false } }]);
    expect(s.settings.quality).toBe('high');
    expect(s.settings.subtitles).toBe(false);
    expect(s.settings.hintsEnabled).toBe(true);
  });

  it('zdarzenia z błędnej fazy są ignorowane (np. zagadka po zakończeniu)', () => {
    const ended = run(createInitialState(), [{ type: 'phoneAnswered' }, { type: 'trapDoorOpened' }]);
    const after = reduce(ended, { type: 'bookPulled', symbol: 'KLUCZ' });
    expect(after.progress.bookOrder).toEqual([]);
  });

  it('wartości spoza tabeli zagadek nie zmieniają postępu', () => {
    let s = run(createInitialState(), [{ type: 'phoneAnswered' }, { type: 'clockSet', clock: CLOCK_OK }]);
    s = run(s, [{ type: 'radioTuned', station: 'st-nieistnieje' }, { type: 'mirrorSpot', spot: 'x' }]);
    expect(s.progress.radioTuned).toEqual([]);
    expect(s.progress.mirrorFound).toEqual([]);
  });

  it('pełna ścieżka rozwiązywalna: każda zagadka kończy się zakończeniem bez blokady', () => {
    const endings = new Set<string>();
    const escape = run(createInitialState(), [...WALKTHROUGH, { type: 'keypadEntered', code: '1311' }]);
    const truth = run(createInitialState(), [...WALKTHROUGH.slice(0, -1), { type: 'decision', choice: 'keep' }, { type: 'mirrorDoorOpened' }]);
    const loop = run(createInitialState(), [{ type: 'phoneAnswered' }, { type: 'trapDoorOpened' }]);
    [escape, truth, loop].forEach((s) => s.ending && endings.add(s.ending));
    expect([...endings].sort()).toEqual(['escape', 'loop', 'truth']);
  });
});

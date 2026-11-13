import type { ItemId, PuzzleId, TruthId } from '../game/types';

/**
 * TABELA ZALEŻNOŚCI ZAGADEK (źródło prawdy dla silnika).
 *
 *  Zagadka  | Wymaga (status)      | Wymaga (flagi / przedmioty) | Daje
 *  ---------+----------------------+-----------------------------+------------------------------------------
 *  clock    | —                    | storyStarted + phoneHeard   | przedmiot note, prawda `time`
 *  books    | clock                | przedmiot note              | przedmiot drawerKey, prawda `books`
 *  radio    | books                | —                           | przedmiot bolt (zasuwa), prawda `radio`
 *  mirror   | books                | —                           | odblokowuje drzwi lustra, prawda `mirror`
 *  shift    | mirror + radio       | (uruchamia odwrócenie)      | prawda `experiment`, decyzja gracza
 *  exit     | shift                | bolt + kod 1311 LUB lustro  | zakończenie: escape / truth
 *
 * Zakończenie `loop` jest dostępne zawsze po rozpoczęciu historii (pułapka: drzwi „404”).
 * Każda gałąź kończy się zakończeniem: nie ma stanu bez wyjścia (brak blokady).
 */

export const PUZZLE_ORDER: PuzzleId[] = ['clock', 'books', 'radio', 'mirror', 'shift', 'exit'];

export interface PuzzleDef {
  id: PuzzleId;
  title: string;
  prereqs: PuzzleId[];
  requiredFlags: Array<'storyStarted' | 'phoneHeard'>;
  requiredItems: ItemId[];
  rewardItems: ItemId[];
  rewardTruth: TruthId | null;
  /** Trzy poziomy podpowiedzi: 1 delikatna, 2 konkretna, 3 instrukcja. */
  hints: [string, string, string];
}

export const PUZZLES: Record<PuzzleId, PuzzleDef> = {
  clock: {
    id: 'clock',
    title: 'Zegar o 23:47',
    prereqs: [],
    requiredFlags: ['phoneHeard'],
    requiredItems: [],
    rewardItems: ['note'],
    rewardTruth: 'time',
    hints: [
      'Zegar na ścianie nie zgadza się z tym, co zapisano na kluczu. Przyjrzyj się dacie i godzinie wyrytej na nim.',
      'Na kluczu jest godzina w formacie 24-godzinnym. Zegar ma tarczę 12-godzinną – sprawdź, czy wskazówki i znacznik AM/PM odpowiadają porze nocnej.',
      'Ustaw godzinę na 11 z oznaczeniem PM (po południu, czyli 23) i minuty na 47. Użyj przycisków pod tarczą lub przeciągnij wskazówki.',
    ],
  },
  books: {
    id: 'books',
    title: 'Książki, których nie napisano',
    prereqs: ['clock'],
    requiredFlags: [],
    requiredItems: ['note'],
    rewardItems: ['drawerKey'],
    rewardTruth: 'books',
    hints: [
      'Niektóre grzbiety książek mają wytłoczone symbole. Te same symbole widziałeś w pokoju.',
      'Notatka z zegara wymienia symbole w określonej kolejności. Wyciągaj książki z symbolami dokładnie w tej kolejności.',
      'Kolejność z notatki: KLUCZ → OKO → FALA → KSIĘŻYC. Dwie pozostałe książki to zmyłka – nie ruszaj ich.',
    ],
  },
  radio: {
    id: 'radio',
    title: 'Radio z przyszłości',
    prereqs: ['books'],
    requiredFlags: [],
    requiredItems: [],
    rewardItems: ['bolt'],
    rewardTruth: 'radio',
    hints: [
      'Radio łapie audycje z różnych lat. Pokrętło przesuwa wskaźnik po skali częstotliwości.',
      'Wszystkie trzy stacje trzeba dostroić. Każda ma rok nadania na etykiecie. Fragmenty ułożą się dopiero, gdy poukładasz je chronologicznie.',
      'Dostrój 92.4, 101.8 i 88.6 MHz. Następnie ustaw przyciski lat w kolejności rosnącej: 1974 → 1989 → 2026.',
    ],
  },
  mirror: {
    id: 'mirror',
    title: 'Lustro pamięci',
    prereqs: ['books'],
    requiredFlags: [],
    requiredItems: [],
    rewardItems: [],
    rewardTruth: 'mirror',
    hints: [
      'Odbicie w lustrze nie jest identyczne z pokojem. Porównaj obie części obrazu.',
      'W odbiciu trzy rzeczy są w innych miejscach niż naprawdę: sprawdź lampę, krzesło i obraz.',
      'Kliknij na odbiciu: lampę, krzesło i pejzaż nad biurkiem – to różnice. Nie ma kary za pomyłkę, ale liczy się dokładność.',
    ],
  },
  shift: {
    id: 'shift',
    title: 'Pokój, który się zmienia',
    prereqs: ['mirror', 'radio'],
    requiredFlags: [],
    requiredItems: [],
    rewardItems: [],
    rewardTruth: 'experiment',
    hints: [
      'Światło wróciło, ale pokój jest inny. Wszystko, co stoi „po drugiej stronie”, wygląda jak odbicie.',
      'Odwrócone są: obraz (zdjęty i obrócony), krzesło (przesunięte na drugą stronę) oraz zegar (cofa się). Każdą rzecz trzeba cofnąć osobno.',
      'Kliknij obraz, by go obrócić, kliknij krzesło, by wróciło na zarys na podłodze, i ustaw zegar na 23:47. Potem telefon zapyta o decyzję.',
    ],
  },
  exit: {
    id: 'exit',
    title: 'Ostatnie drzwi',
    prereqs: ['shift'],
    requiredFlags: [],
    requiredItems: [],
    rewardItems: [],
    rewardTruth: null,
    hints: [
      'Są trzy wyjścia z pokoju. Każde wymaga czegoś, czego się nauczyłeś.',
      'Główne drzwi potrzebują kodu z klucza (data wygrawerowana na kluczu) i zasuwy z radia. Lustro prowadzi gdzie indziej, ale tylko przy odpowiedniej decyzji.',
      'Kod do drzwi to data z klucza: 13.11 → 1311. Zasuwę masz już w ekwipunku. Drzwi z numerem 404 to pułapka – nie otwieraj ich bez namysłu.',
    ],
  },
};

export const TRUTHS: Record<TruthId, string> = {
  time: 'Zegar nie mierzy czasu. Mierzy to, co pominęliśmy.',
  books: 'Pamiętam tylko to, co zapisałem.',
  radio: 'Pamięć wraca w kolejności, w jakiej ją porzuciłeś.',
  mirror: 'W odbiciu pokój jest prawdziwy. W tobie – już nie.',
  experiment: 'To ja zaprojektowałem ten pokój, żeby odzyskać to, co straciłem.',
};

export const ITEM_NAMES: Record<ItemId, string> = {
  key: 'Klucz z wygrawerowaną datą',
  note: 'Notatka z symbolami',
  drawerKey: 'Mały kluczyk do szuflady',
  bolt: 'Żelazna zasuwa z radia',
};

/** Kod do głównych drzwi: data wygrawerowana na kluczu (13.11). */
export const EXIT_CODE = '1311';
/** Symbole na grzbietach książek, w kolejności z notatki. */
export const BOOK_ORDER = ['KLUCZ', 'OKO', 'FALA', 'KSIĘŻYC'] as const;
/** Stacje radiowe: częstotliwość (MHz) i rok nadania. Kolejność chronologiczna = 1974, 1989, 2026. */
export const RADIO_STATIONS = {
  'st-1974': { freq: 92.4, year: 1974, fragment: 'Nie każdy pokój ma numer. Ten zapamiętał za wszystkich.' },
  'st-1989': { freq: 101.8, year: 1989, fragment: 'Liczy się tylko to, co zostanie w pamięci, nie to, co było.' },
  'st-2026': { freq: 88.6, year: 2026, fragment: 'Nie każde wyjście prowadzi na zewnątrz. Pamiętaj, kim byłeś.' },
} as const;
export const RADIO_CORRECT_ORDER = ['st-1974', 'st-1989', 'st-2026'] as const;
export const RADIO_TOLERANCE_MHZ = 0.4;
/** Różnice między odbiciem a pokojem w lustrze (identyfikatory punktów). */
export const MIRROR_DIFFERENCES = ['lamp', 'chair', 'painting'] as const;
export const CLOCK_TARGET = { hour12: 11, minute: 47, pm: true } as const;
/** Minuty bez postępu po których pojawia się pierwsza podpowiedź. */
export const HINT_FIRST_DELAY_MS = 3 * 60 * 1000;
export const HINT_NEXT_DELAY_MS = 90 * 1000;

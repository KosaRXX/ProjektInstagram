import type { Decision, Ending } from '../game/types';

/** Cała narracja po polsku. Ton: subtelny, psychologiczny – bez tanich efektów. */

/** Treść notatki z zagadki 1 – kolejność symboli dla zagadki 2. */
export const NOTE_TEXT = 'Najpierw KLUCZ. Potem OKO. Następnie FALA. Na końcu KSIĘŻYC. Nie wyciągaj niczego, czego nie ma w tej kolejności.';

export const TEXT = {
  intro: [
    'Budzisz się w pokoju 404. Nie pamiętasz, jak tu trafiłeś.',
    'Na stoliku leży klucz z datą, której jeszcze nie było.',
    'Zegar wskazuje 23:47. Za oknem deszcz pada w górę.',
  ],
  radioNoise: 'Radio szumi. Gdzieś w środku szumu ktoś mówi twoje imię.',
  keyText: 'Na kluczu wygrawerowano: 13 · XI. Pod spodem, drobniej: 23:47.',
  keyTaken: 'Klucz jest zimny. Data na nim wciąż jest jutrzejsza.',
  phoneAnswer: [
    'Halo? Nie poznajesz mojego głosu. Dobrze. To nie ma znaczenia.',
    'Zegar w pokoju nie pokazuje tego, co było. Pokazuje to, co pominąłeś. Ustaw go na godzinę, którą widzisz na kluczu.',
    'Pamiętaj: w tym hotelu noc zaczyna się o 23:47.',
  ],
  phoneAfterClock: 'Dobrze. Teraz notatka. I książki – tylko w dobrej kolejności.',
  phoneAfterAll: 'Wszystko wróciło na miejsce. Prawie wszystko. Zdecyduj, co chcesz zachować.',
  phoneWaiting: 'Nadal tu jestem. Odwracanie nie jest jeszcze skończone.',
  phoneDecisionKeep: 'Zachowasz wspomnienie, nawet jeśli boli. To rzadki wybór.',
  phoneDecisionForget: 'Zapomnisz. Drzwi będą wtedy łatwiejsze do otwarcia – i trudniejsze do zrozumienia.',
  phoneWrongBooks: 'Pomyliłeś się przy książkach. Pamięć to wybacza. Nie zawsze.',
  lightsOut: 'Światło gaśnie.',
  roomChanged: 'Pokój wrócił, ale nie taki sam.',
  bookWrong: 'Książka wraca na półkę. Kolejność się nie zgadza.',
  bookSolved: 'Półka cicho przesuwa się w bok.',
  bookEmpty: 'Książki stoją równo. Coś jeszcze musi się wydarzyć.',
  bookDone: 'Półka jest już pusta.',
  mirrorEmpty: 'Odbicie jest puste. Na razie nic nie ma do porównania.',
  mirrorLocked: 'Lustro pokazuje tylko pokój. Jeszcze nie to, czego szukasz.',
  mirrorNeedsDecision: 'Odbicie nie puszcza. Coś w tobie chce zostać.',
  mirrorNeedsTruths: 'Jeszcze nie pamiętasz wszystkiego. Lustro to widzi.',
  radioSilent: 'Radio milczy. Może jeszcze nie jest czas.',
  paintingFlavor: 'Obraz wisi krzywo. Księżyc na nim ma dziś inną fazę.',
  chairFlavor: 'Fotel stoi na wyblakłym zarysie. Ktoś go tam kiedyś postawił.',
  doorMainLocked: 'Drzwi są zamknięte. Ktoś zatrzasnął je od środka.',
  doorMainSign: 'NIE KAŻDE WYJŚCIE PROWADZI NA ZEWNĄTRZ.',
  doorTrap: 'Drzwi z numerem 404. Kołatka jest zimna, ale ktoś po drugiej stronie puka.',
  doorTrapNotYet: 'Drzwi z numerem 404. Jeszcze nie.',
  keypadWrong: 'Kod nie pasuje.',
  keypadNoBolt: 'Kod się zgadza, ale zasuwa wciąż blokuje drzwi.',
  keypadRight: 'Zasuwa puszcza. Drzwi uchylają się.',
  clockHint: 'Wskazówki stoją. Ustaw je na godzinę z klucza.',
  clockReversed: 'Wskazówki cofają się. Ustaw je na 23:47, zanim zniknie noc.',
  knockFar: 'Z drugiej strony drzwi ktoś puka – trzy razy, równo.',
  uvHint: 'Na ścianie coś błyska tuszem UV: CZAS COFA SIĘ, ALE NIE ZAPOMINA.',
  stationTuned: (year: number) => `Słychać audycję z ${year} roku.`,
  stationFragment: (fragment: string) => fragment,
  truthFound: (text: string) => `Prawda: ${text}`,
  restoreTodo: 'Do cofnięcia: obraz, fotel i zegar.',
} as const;

export const ENDINGS: Record<Ending, { title: string; text: string }> = {
  escape: {
    title: 'UCIECZKA',
    text: 'Wychodzisz w noc. Deszcz pada w górę. Na wieży zegar wskazuje 23:47 – dokładnie wtedy, kiedy wszystko się zaczęło.',
  },
  truth: {
    title: 'PRAWDA',
    text: 'Wchodzisz w odbicie i przypominasz sobie: to ty zaprojektowałeś ten pokój, żeby odzyskać to, co straciłeś. Eksperyment się udał. Wspomnienie wróciło.',
  },
  loop: {
    title: 'PĘTLA',
    text: 'Otwierasz drzwi z numerem 404 i wracasz do tego samego pokoju. Na łóżku ktoś śpi. Wygląda dokładnie jak ty.',
  },
};

export const CINEMA_CAPTIONS: Record<Ending, string[]> = {
  escape: ['Ulica jest mokra. Deszcz pada, a krople spływają w górę po latarniach.', 'Na wieży zegar wskazuje 23:47.'],
  truth: ['Odbicie przyjmuje cię bez słowa.', 'Pamiętasz: sam zaprojektowałeś ten pokój.'],
  loop: ['Drzwi otwierają się na ten sam pokój.', 'Na łóżku śpi ktoś, kto wygląda jak ty.'],
};

export function decisionComment(decision: Decision, wrongBooks: number): string {
  const base = decision === 'keep' ? TEXT.phoneDecisionKeep : TEXT.phoneDecisionForget;
  return wrongBooks >= 2 ? `${base} ${TEXT.phoneWrongBooks}` : base;
}

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gameStore, type Overlay } from '../game/gameApi';
import { canOpenMirrorDoor, isAutoHintDue, nextHint } from '../game/logic';
import { CINEMA_CAPTIONS, TEXT } from '../data/narrative';
import { TRUTHS } from '../data/puzzles';
import type { Quality } from '../game/types';
import { buildRoom, type RoomWorld } from './room';
import { createEffects, type Effects } from './effects';
import { EYE_HEIGHT, FirstPersonController, stepTween, type CameraTween } from './camera';
import { buildSleeper, buildStreetScene, type CinemaPath } from './cinematics';
import { AudioSystem } from '../audio/audio';

/**
 * Silnik gry: renderer, pętla, wejście, interakcje, widoki szczegółowe, zakończenia.
 * Reguły gry żyją w `game/logic.ts`; tutaj tylko przekładamy zdarzenia na świat 3D i z powrotem.
 */

const START_POSE = { pos: new THREE.Vector3(0, EYE_HEIGHT, 2.1), yaw: 0, pitch: -0.05 };
/** Ostatnia pozycja gracza – przeżywa przebudowę silnika (np. zmianę jakości grafiki). */
let rememberedPose: { pos: THREE.Vector3; yaw: number; pitch: number } | null = null;
const RUG = { x: 1.5, z: 1.3 };
const KEY_SPOTS: [number, number, number][] = [
  [-1.6, 0.73, -0.1],
  [-1.45, 0.73, 0.05],
  [-1.75, 0.73, -0.25],
  [-1.5, 0.73, -0.3],
];

export interface EngineOptions {
  quality: Quality;
  mobile: boolean;
}

interface Timed {
  at: number;
  fn: () => void;
}

interface CinemaRun {
  kind: 'escape' | 'truth' | 'loop';
  scene: THREE.Scene;
  path: CinemaPath;
  elapsed: number;
  sleeper?: THREE.Group;
}

export class GameEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.05, 60);
  private readonly room: RoomWorld;
  private readonly effects: Effects;
  private readonly controller: FirstPersonController;
  private readonly audio = new AudioSystem();
  private readonly raycaster = new THREE.Raycaster();
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private readonly quality: Quality;
  private mobile: boolean;
  private pmrem: THREE.PMREMGenerator;
  private envTex: THREE.Texture | null = null;
  private readonly timeline: Timed[] = [];
  /** Czas animacji (przycinany krok) i czas rzeczywisty dla harmonogramu zdarzeń. */
  private t = 0;
  private wall = 0;
  private raf = 0;
  private running = false;
  private tween: CameraTween | null = null;
  private savedPose: { pos: THREE.Vector3; yaw: number; pitch: number } | null = null;
  private cinema: CinemaRun | null = null;
  private hover: { id: string; obj: THREE.Object3D } | null = null;
  private keyUnseen = 0;
  private keyMoveTimer = 0;
  private keySpot = 0;
  private elapsedAcc = 0;
  private prevState: ReturnType<typeof gameStore.getState> | null = null;
  private started = false;
  private ringing = false;
  private touchMove = { x: 0, y: 0 };
  private keys = new Set<string>();
  private unsubscribe: (() => void) | null = null;
  private frameMs: number[] = [];
  private pixelRatio = 1;
  private readonly onResize = () => this.resize();
  private readonly onKeyDown = (e: KeyboardEvent) => this.handleKey(e, true);
  private readonly onKeyUp = (e: KeyboardEvent) => this.handleKey(e, false);
  private readonly onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement === this.renderer.domElement && this.canControl()) this.look(e.movementX, e.movementY);
  };
  private readonly onLockChange = () => {
    if (document.pointerLockElement !== this.renderer.domElement && gameStore.getState().game.phase === 'playing' && this.started) {
      // Przy wyjściu z blokady kursora (ESC przeglądarki) otwieramy pauzę.
      if (!gameStore.getState().overlay) gameStore.getState().setOverlay({ kind: 'pause' });
    }
  };

  constructor(private readonly canvas: HTMLCanvasElement, opts: EngineOptions) {
    this.quality = opts.quality;
    this.mobile = opts.mobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.shadowsOn();
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.35;
    this.scene.background = new THREE.Color(0x101923);
    this.scene.fog = new THREE.FogExp2(0x101923, 0.03);

    this.room = buildRoom({ shadows: this.shadowsOn(), detail: this.quality });
    this.scene.add(this.room.root);
    this.effects = createEffects(this.quality);
    this.scene.add(this.effects.root);

    this.controller = new FirstPersonController(this.camera, this.room.colliders);
    if (rememberedPose) this.controller.setPose(rememberedPose.pos, rememberedPose.yaw, rememberedPose.pitch);
    else this.controller.setPose(START_POSE.pos, START_POSE.yaw, START_POSE.pitch);

    // Oznacz obiekty interaktywne (korzeń obiektu niesie identyfikator)
    for (const it of this.room.interactables.values()) {
      for (const o of it.objects) o.userData.interactId = it.id;
    }
    this.setupComposer();
    this.resize();
    this.pixelRatio = this.quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, this.mobile ? 1.25 : 1.75);
    this.renderer.setPixelRatio(this.pixelRatio);
  }

  private shadowsOn(): boolean {
    return this.quality !== 'low';
  }

  private bloomOn(): boolean {
    return this.quality === 'high' || this.quality === 'ultra';
  }

  private setupComposer(): void {
    this.composer?.dispose();
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(this.renderPass);
    if (this.bloomOn()) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 0.92);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
  }

  // ---------- Cykl życia ----------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.unsubscribe = gameStore.subscribe((s) => this.onStoreChange(s));
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    this.resize();
    this.prevState = gameStore.getState();
    this.loop();
  }

  dispose(): void {
    rememberedPose = { pos: this.controller.position.clone(), yaw: this.controller.yaw, pitch: this.controller.pitch };
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.unsubscribe?.();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.audio.dispose();
    this.room.dispose();
    this.effects.dispose();
    this.envTex?.dispose();
    this.pmrem.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }

  /** Wywoływane z gestu użytkownika (przycisk ROZPOCZNIJ / KONTYNUUJ): odblokowuje dźwięk i ustawia start. */
  begin(): void {
    this.audio.init();
    this.started = true;
    this.timeline.length = 0;
    this.keyUnseen = 0;
    this.keySpot = 0;
    this.controller.setPose(START_POSE.pos, START_POSE.yaw, START_POSE.pitch);
    this.room.keyGroup.position.set(KEY_SPOTS[0][0], KEY_SPOTS[0][1], KEY_SPOTS[0][2]);
    this.room.keyGroup.visible = !gameStore.getState().game.inventory.includes('key');
    this.savedPose = null;
    this.tween = null;
    this.cinema = null;
    if (!gameStore.getState().game.flags.storyStarted) this.scheduleIntro();
    gameStore.getState().setCinema(null);
    this.resume();
  }

  /** Przywraca sesję po przebudowie silnika, bez restartu historii (bez odtwarzania intro). */
  resumeSession(): void {
    this.audio.init();
    this.started = true;
  }

  /** Powrót do menu głównego: kamera wraca do widoku z menu, dźwięk zostaje. */
  end(): void {
    this.started = false;
    this.keys.clear();
    this.touchMove = { x: 0, y: 0 };
    this.tween = null;
    this.cinema = null;
    this.savedPose = null;
    this.timeline.length = 0;
    this.room.setRinging(false);
    this.room.keyGroup.visible = true;
    rememberedPose = null;
    this.controller.setPose(START_POSE.pos, START_POSE.yaw, START_POSE.pitch);
  }

  /** Ustawia kamerę dla menu (pokój widziany z lekkim obrotem). */
  private menuCamera(t: number): void {
    const r = 2.0;
    const yaw = Math.sin(t * 0.05) * 0.6;
    this.camera.position.set(-1.0 + Math.sin(yaw) * 0.6, 1.6, 2.4 + (Math.cos(yaw) - 1) * 0.4);
    this.camera.lookAt(-0.6 + Math.cos(t * 0.03) * 0.4, 1.5, -r);
  }

  private resize(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Na wąskim ekranie (telefon) węższy kąt widzenia wygląda lepiej
    this.camera.fov = w / h < 0.75 ? 72 : 62;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    this.bloom?.resolution.set(w, h);
  }

  setSensitivity(s: number): void {
    this.controller.sensitivity = s;
  }

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
  }

  // ---------- Wejście ----------

  canControl(): boolean {
    const { game, overlay, cinema } = gameStore.getState();
    return this.started && game.phase === 'playing' && !overlay && !cinema && !this.tween;
  }

  setMove(x: number, y: number): void {
    this.touchMove = { x, y };
  }

  look(dx: number, dy: number): void {
    if (!this.canControl()) return;
    this.controller.look(dx, dy);
  }

  /** Dotknięcie ekranu / klik w punkcie – zwraca czy trafiono obiekt. */
  pointerActivate(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.pick(this.raycaster);
    if (hit) this.activate(hit.id, hit.obj);
    return !!hit;
  }

  /** Interakcja z obiektem pod celownikiem (klawisz E / klik przy blokadzie kursora). */
  activateCenter(): boolean {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hit = this.pick(this.raycaster);
    if (hit) this.activate(hit.id, hit.obj);
    return !!hit;
  }

  requestLock(): void {
    try {
      void this.canvas.requestPointerLock?.();
    } catch {
      /* brak blokady – sterowanie dotykiem/myszą nadal działa */
    }
  }

  private handleKey(e: KeyboardEvent, down: boolean): void {
    const code = e.code;
    if (!down) {
      this.keys.delete(code);
      return;
    }
    const state = gameStore.getState();
    if (e.repeat) return;
    if (code === 'Escape') {
      e.preventDefault();
      if (state.overlay && state.overlay.kind !== 'pause') state.setOverlay(null);
      else if (state.overlay?.kind === 'pause') this.resume();
      else this.pause();
      return;
    }
    if (!this.started || state.game.phase === 'menu') return;
    this.keys.add(code);
    if (code === 'KeyE') {
      if (state.overlay) return;
      this.activateCenter();
    } else if (code === 'Tab') {
      e.preventDefault();
      state.setOverlay(state.overlay?.kind === 'inventory' ? null : { kind: 'inventory' });
    } else if (code === 'KeyH') {
      this.requestHint();
    } else if (code === 'KeyJ') {
      state.setOverlay(state.overlay?.kind === 'journal' ? null : { kind: 'journal' });
    }
  }

  pause(): void {
    const state = gameStore.getState();
    if (state.game.phase !== 'playing') return;
    state.dispatch({ type: 'setPhase', phase: 'paused' });
    state.setOverlay({ kind: 'pause' });
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
  }

  resume(): void {
    const state = gameStore.getState();
    if (state.game.phase === 'paused') state.dispatch({ type: 'setPhase', phase: 'playing' });
    if (state.overlay?.kind === 'pause') state.setOverlay(null);
  }

  requestHint(): void {
    const state = gameStore.getState();
    if (!state.game.settings.hintsEnabled) {
      state.showToast('Podpowiedzi są wyłączone w ustawieniach.');
      return;
    }
    const next = nextHint(state.game);
    if (!next) {
      state.showToast('Na razie nie ma zagadki do podpowiedzi.');
      return;
    }
    state.dispatch({ type: 'hintShown', puzzle: next.puzzle });
    state.showHint(next.text, next.level);
  }

  // ---------- Interakcje ----------

  private pick(raycaster: THREE.Raycaster): { id: string; obj: THREE.Object3D } | null {
    const roots: THREE.Object3D[] = [];
    for (const it of this.room.interactables.values()) roots.push(...it.objects);
    const hits = raycaster.intersectObjects(roots, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.interactId) o = o.parent;
      if (!o) continue;
      const id = o.userData.interactId as string;
      const it = this.room.interactables.get(id);
      if (!it) continue;
      if (h.distance > it.range + 0.5) return null;
      return { id, obj: o };
    }
    return null;
  }

  private promptFor(id: string, obj: THREE.Object3D): string | null {
    const { game } = gameStore.getState();
    const shiftActive = game.puzzles.shift === 'active';
    switch (id) {
      case 'phone':
        return game.flags.phoneHeard ? 'Telefon' : 'Odbierz telefon';
      case 'key':
        return game.inventory.includes('key') ? null : 'Podnieś klucz';
      case 'clock':
        return 'Ustaw zegar';
      case 'books':
        return game.puzzles.books === 'active' ? `Wyciągnij książkę: ${obj.userData.bookSymbol ?? ''}`.trim() : 'Książki';
      case 'radio':
        return 'Dostrój radio';
      case 'mirror':
        return game.puzzles.mirror === 'solved' && game.puzzles.exit === 'active' ? 'Przejdź przez lustro' : 'Zbadaj lustro';
      case 'painting':
        return shiftActive ? 'Obróć obraz' : 'Obraz';
      case 'chair':
        return shiftActive ? 'Przesuń fotel' : 'Fotel';
      case 'door-main':
        return game.puzzles.exit === 'active' ? 'Klawiatura drzwi' : 'Drzwi';
      case 'door-trap':
        return '404';
      default:
        return null;
    }
  }

  private wobble(obj: THREE.Object3D): void {
    obj.userData.wobbleUntil = this.t + 0.5;
  }

  /** Krótkie wprowadzenie po starcie – napisy pojawiają się po kolei. */
  private scheduleIntro(): void {
    const say = (text: string, ms: number) => gameStore.getState().showSubtitle(text, ms);
    TEXT.intro.forEach((line, i) => this.timeline.push({ at: this.wall + 1 + i * 7, fn: () => say(line, 6500) }));
    this.timeline.push({ at: this.wall + 23, fn: () => say(TEXT.radioNoise, 5000) });
  }

  activate(id: string, obj: THREE.Object3D): void {
    const state = gameStore.getState();
    const game = state.game;
    if (game.phase !== 'playing' || state.overlay || state.cinema) return;
    const say = (text: string, ms?: number) => state.showSubtitle(text, ms ?? 5200);

    switch (id) {
      case 'phone': {
        if (!game.flags.phoneHeard) {
          state.dispatch({ type: 'phoneAnswered' });
          this.room.setRinging(false);
          this.audio.oneShot('click');
          this.openOverlay({ kind: 'phone', source: 'phone' });
          this.timeline.push({ at: this.wall + 0.6, fn: () => say(TEXT.phoneAnswer[0], 7000) });
          this.timeline.push({ at: this.wall + 7, fn: () => say(TEXT.phoneAnswer[1], 9000) });
          this.timeline.push({ at: this.wall + 16.5, fn: () => say(TEXT.phoneAnswer[2], 6000) });
          return;
        }
        this.openOverlay({ kind: 'phone', source: 'phone' });
        return;
      }
      case 'key': {
        if (game.inventory.includes('key')) return;
        state.dispatch({ type: 'itemFound', item: 'key' });
        this.room.keyGroup.visible = false;
        this.audio.oneShot('click');
        state.showToast('Zdobyto: klucz z wygrawerowaną datą');
        state.setOverlay({ kind: 'message', title: 'Klucz', text: TEXT.keyText });
        return;
      }
      case 'clock': {
        this.openOverlay({ kind: 'clock', source: 'clock' });
        return;
      }
      case 'books': {
        const symbol = (obj.userData.bookSymbol as string | undefined) ?? 'DECOY';
        if (game.puzzles.books !== 'active') {
          say(game.puzzles.books === 'solved' ? TEXT.bookDone : TEXT.bookEmpty);
          return;
        }
        state.dispatch({ type: 'bookPulled', symbol });
        const after = gameStore.getState().game;
        if (after.progress.bookOrder.length === 0 && symbol !== 'DECOY') {
          // zła kolejność – książka wraca na półkę
          this.wobble(obj);
          say(TEXT.bookWrong, 3600);
        } else if (symbol === 'DECOY') {
          this.wobble(obj);
          say(TEXT.bookWrong, 3600);
        } else if (after.puzzles.books === 'solved') {
          this.audio.oneShot('creak');
          say(TEXT.bookSolved, 4200);
        }
        return;
      }
      case 'radio': {
        if (game.puzzles.radio !== 'active' && game.puzzles.radio !== 'solved') {
          say(TEXT.radioSilent);
          return;
        }
        this.openOverlay({ kind: 'radio', source: 'radio' });
        return;
      }
      case 'mirror': {
        if (game.puzzles.mirror === 'solved') {
          if (game.puzzles.exit !== 'active') {
            say(TEXT.mirrorLocked);
            return;
          }
          if (game.decision !== 'keep') {
            say(TEXT.mirrorNeedsDecision);
            return;
          }
          if (game.truths.length < 4) {
            say(TEXT.mirrorNeedsTruths);
            return;
          }
          if (canOpenMirrorDoor(game)) {
            this.room.setDoorOpen('mirror', 1);
            state.dispatch({ type: 'mirrorDoorOpened' });
          }
          return;
        }
        if (game.puzzles.mirror === 'active') {
          this.openOverlay({ kind: 'mirror', source: 'mirror' });
          return;
        }
        say(TEXT.mirrorEmpty);
        return;
      }
      case 'painting': {
        if (game.puzzles.shift === 'active') {
          state.dispatch({ type: 'paintingFlipped' });
          this.audio.oneShot('creak');
          this.checkShiftDone();
        } else say(TEXT.paintingFlavor);
        return;
      }
      case 'chair': {
        if (game.puzzles.shift === 'active') {
          state.dispatch({ type: 'chairMoved' });
          this.audio.oneShot('creak');
          this.checkShiftDone();
        } else say(TEXT.chairFlavor);
        return;
      }
      case 'door-main': {
        if (game.puzzles.exit === 'active') {
          this.openOverlay({ kind: 'keypad', source: 'door-main' });
          return;
        }
        if (game.puzzles.exit === 'solved') return;
        say(TEXT.doorMainLocked);
        return;
      }
      case 'door-trap': {
        if (!game.flags.storyStarted) {
          say(TEXT.doorTrapNotYet);
          return;
        }
        this.room.setDoorOpen('trap', 1);
        state.dispatch({ type: 'trapDoorOpened' });
        return;
      }
      default:
        return;
    }
  }

  /** Po ruchu w zagadce 5 – sprawdza, czy wszystko wróciło na miejsce, i pokazuje pytanie o decyzję. */
  private checkShiftDone(): void {
    const game = gameStore.getState().game;
    if (game.puzzles.shift !== 'active') return;
    const restored = !game.flags.paintingFlipped && !game.flags.chairMoved && !game.flags.clockReversed;
    if (restored) {
      gameStore.getState().showSubtitle(TEXT.phoneAfterAll, 6000);
      this.timeline.push({ at: this.wall + 2.5, fn: () => this.openOverlay({ kind: 'decision', source: 'phone' }) });
    } else {
      gameStore.getState().showSubtitle(TEXT.restoreTodo, 4200);
    }
  }

  openOverlay(o: Overlay): void {
    gameStore.getState().setOverlay(o);
  }

  // ---------- Reakcje na zmiany stanu ----------

  private onStoreChange(next: ReturnType<typeof gameStore.getState>): void {
    const prev = this.prevState ?? next;
    this.prevState = next;
    const pg = prev.game;
    const ng = next.game;

    // Panel → widok szczegółowy; zamknięcie → powrót kamery
    if (next.overlay && next.overlay.source && (!prev.overlay || prev.overlay.source !== next.overlay.source)) {
      this.startCloseup(next.overlay.source);
    }
    if (!next.overlay && prev.overlay && prev.overlay.source) {
      this.endCloseup();
    }

    // Zaciemnienie przy odwróceniu pokoju (zagadka 5)
    if (pg.puzzles.shift !== 'active' && ng.puzzles.shift === 'active') {
      this.timeline.push({ at: this.wall + 0.2, fn: () => this.room.setBlackout(1) });
      this.timeline.push({ at: this.wall + 0.4, fn: () => this.audio.oneShot('creak') });
      this.timeline.push({ at: this.wall + 0.6, fn: () => gameStore.getState().showSubtitle(TEXT.lightsOut, 3200) });
      this.timeline.push({ at: this.wall + 4.6, fn: () => this.room.setBlackout(0) });
      this.timeline.push({ at: this.wall + 5.0, fn: () => gameStore.getState().showSubtitle(TEXT.roomChanged, 5000) });
      this.timeline.push({ at: this.wall + 10.5, fn: () => gameStore.getState().showSubtitle(TEXT.restoreTodo, 5000) });
    }
    if (pg.puzzles.shift !== 'solved' && ng.puzzles.shift === 'solved') {
      this.room.setDoorOpen('mirror', 0);
    }

    // Komunikaty o nowo odkrytych prawdach
    for (const truth of ng.truths) {
      if (!pg.truths.includes(truth)) {
        gameStore.getState().showToast(`Odkryto: ${TRUTHS[truth].slice(0, 60)}…`, 3200);
      }
    }

    // Komunikat o dostrojeniu radia / zasuwie
    if (ng.inventory.includes('bolt') && !pg.inventory.includes('bolt')) {
      gameStore.getState().showToast('Zdobyto: żelazna zasuwa z radia');
    }

    // Zakończenie – sekwencja filmowa
    if (!pg.ending && ng.ending) {
      this.startCinema(ng.ending);
    }

    // Kluczowe przejścia: ukryj klucz, gdy został podniesiony
    if (!pg.inventory.includes('key') && ng.inventory.includes('key')) this.room.keyGroup.visible = false;

    // Pauza / wznowienie
    if (ng.phase === 'paused' || (next.overlay && next.overlay.kind === 'pause')) {
      this.keys.clear();
      this.touchMove = { x: 0, y: 0 };
    }
  }

  private startCloseup(source: string): void {
    const it = this.room.interactables.get(source);
    if (!it) return;
    if (!this.savedPose) {
      this.savedPose = {
        pos: this.controller.position.clone(),
        yaw: this.controller.yaw,
        pitch: this.controller.pitch,
      };
    }
    this.tween = {
      fromPos: this.camera.position.clone(),
      toPos: it.closeup.pos.clone(),
      fromLook: this.lookTarget(),
      toLook: it.closeup.look.clone(),
      duration: 0.8,
      elapsed: 0,
    };
  }

  private endCloseup(): void {
    if (!this.savedPose) return;
    const s = this.savedPose;
    this.savedPose = null;
    const target = new THREE.Vector3(
      s.pos.x - Math.sin(s.yaw) * Math.cos(s.pitch),
      s.pos.y + Math.sin(s.pitch),
      s.pos.z - Math.cos(s.yaw) * Math.cos(s.pitch),
    );
    this.tween = {
      fromPos: this.camera.position.clone(),
      toPos: s.pos.clone(),
      fromLook: this.lookTarget(),
      toLook: target,
      duration: 0.6,
      elapsed: 0,
      onDone: () => this.controller.setPose(s.pos, s.yaw, s.pitch),
    };
  }

  /** Punkt, na który aktualnie patrzy kamera (do interpolacji przejść). */
  private lookTarget(): THREE.Vector3 {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return this.camera.position.clone().add(dir.multiplyScalar(2));
  }

  // ---------- Sekwencje zakończeń ----------

  private startCinema(ending: 'escape' | 'truth' | 'loop'): void {
    const store = gameStore.getState();
    // Zaplanowane wcześniej napisy (np. wstęp) nie mogą nakładać się na sekwencję.
    this.timeline.length = 0;
    this.overlayClose();
    this.keys.clear();
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    const captions = CINEMA_CAPTIONS[ending];
    if (ending === 'escape') {
      this.room.setDoorOpen('main', 1);
      this.audio.oneShot('door');
      const { scene, path } = buildStreetScene();
      this.timeline.push({ at: this.wall + 1.2, fn: () => this.beginCinemaRun({ kind: ending, scene, path, elapsed: 0 }) });
    } else if (ending === 'truth') {
      this.room.setDoorOpen('mirror', 1);
      const path: CinemaPath = {
        positions: [this.camera.position.clone(), new THREE.Vector3(2.0, 1.6, -0.2), new THREE.Vector3(2.45, 1.7, -1.05)],
        looks: [new THREE.Vector3(2.96, 1.75, -1.2), new THREE.Vector3(2.96, 1.75, -1.2), new THREE.Vector3(2.99, 1.75, -1.2)],
        duration: 9,
      };
      this.timeline.push({ at: this.wall + 1.0, fn: () => this.beginCinemaRun({ kind: ending, scene: this.scene, path, elapsed: 0 }) });
    } else {
      this.room.setDoorOpen('trap', 1);
      const sleeper = buildSleeper();
      this.room.root.add(sleeper);
      const path: CinemaPath = {
        positions: [new THREE.Vector3(1.5, 1.55, 2.4), new THREE.Vector3(1.5, 1.55, 1.5), new THREE.Vector3(1.9, 1.5, 0.4)],
        looks: [new THREE.Vector3(1.5, 1.4, 2.96), new THREE.Vector3(2.0, 0.8, 1.75), new THREE.Vector3(2.0, 0.6, 1.75)],
        duration: 10,
      };
      this.timeline.push({ at: this.wall + 1.2, fn: () => this.beginCinemaRun({ kind: ending, scene: this.scene, path, elapsed: 0, sleeper }) });
    }
    captions.forEach((line, i) => this.timeline.push({ at: this.wall + 2.5 + i * 5.5, fn: () => store.showSubtitle(line, 5000) }));
    store.setCinema(ending);
  }

  private beginCinemaRun(run: CinemaRun): void {
    this.cinema = run;
    this.camera.position.copy(run.path.positions[0]);
  }

  private overlayClose(): void {
    gameStore.getState().setOverlay(null);
  }

  private finishCinema(): void {
    const run = this.cinema;
    this.cinema = null;
    if (run?.sleeper) {
      this.room.root.remove(run.sleeper);
    }
    gameStore.getState().setCinema(null);
    gameStore.getState().setOverlay(null);
    if (run?.scene && run.scene !== this.scene) {
      run.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      });
    }
  }

  // ---------- Pętla ----------

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const raw = this.clockDt();
    const dt = Math.min(0.05, raw);
    this.t += dt;
    this.wall += raw;
    this.tick(dt);
    this.render(dt);
  };

  private lastNow = performance.now();
  private clockDt(): number {
    const now = performance.now();
    const d = (now - this.lastNow) / 1000;
    this.lastNow = now;
    this.frameMs.push(d * 1000);
    if (this.frameMs.length > 120) this.frameMs.shift();
    return d;
  }

  private tick(dt: number): void {
    const state = gameStore.getState();
    const game = state.game;

    // Timeline (zdarzenia zaplanowane w czasie)
    for (let i = this.timeline.length - 1; i >= 0; i--) {
      const item = this.timeline[i];
      if (this.wall >= item.at) {
        this.timeline.splice(i, 1);
        item.fn();
      }
    }

    // Start historii: telefon zaczyna dzwonić po chwili
    this.ringing = this.started && !game.flags.phoneHeard && this.wall > 3 && game.phase === 'playing';
    this.room.setRinging(this.ringing);

    // Sekwencja filmowa
    if (this.cinema) {
      const run = this.cinema;
      run.elapsed += dt;
      const { path } = run;
      const n = path.positions.length - 1;
      const k = Math.min(0.9999, run.elapsed / path.duration);
      const seg = Math.min(n - 1, Math.floor(k * n));
      const local = k * n - seg;
      const ease = local < 0.5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2;
      this.camera.position.lerpVectors(path.positions[seg], path.positions[seg + 1], ease);
      const look = new THREE.Vector3().lerpVectors(path.looks[seg], path.looks[seg + 1], ease);
      this.camera.lookAt(look);
      if (run.elapsed >= path.duration) this.finishCinema();
      return;
    }

    // Widok szczegółowy
    if (this.tween) {
      const done = stepTween(this.tween, this.camera, dt);
      if (done) {
        const onDone = this.tween.onDone;
        this.tween = null;
        onDone?.();
      }
      return;
    }

    if (!this.started) {
      this.menuCamera(this.t);
      return;
    }

    // Ruch: klawiatura + joystick
    const kb = { x: 0, y: 0 };
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) kb.y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) kb.y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kb.x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kb.x -= 1;
    const move = { x: Math.max(-1, Math.min(1, kb.x + this.touchMove.x)), y: Math.max(-1, Math.min(1, kb.y + this.touchMove.y)) };
    const canMove = this.canControl();
    if (canMove) this.controller.move(move, dt);
    const moving = canMove && Math.hypot(move.x, move.y) > 0.1;

    // Podświetlenie i podpowiedź pod celownikiem
    if (canMove || (game.phase === 'playing' && !state.overlay)) {
      this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
      const hit = this.pick(this.raycaster);
      if (hit?.id !== this.hover?.id || hit?.obj !== this.hover?.obj) {
        this.setHighlight(this.hover?.obj ?? null, false);
        this.hover = hit;
        this.setHighlight(hit?.obj ?? null, true);
      }
      state.setPrompt(hit ? this.promptFor(hit.id, hit.obj) : null);
    } else {
      this.setHighlight(this.hover?.obj ?? null, false);
      this.hover = null;
      state.setPrompt(null);
    }

    // Klucz przesuwa się, gdy gracz na niego nie patrzy
    this.updateKeyDrift(dt);

    // Odgłosy
    const clockPos = { x: 2.1, y: 2.3, z: -2.85 };
    const knockPos = { x: 1.5, y: 1.2, z: 2.96 };
    const surface = Math.abs(this.controller.position.x) < RUG.x && Math.abs(this.controller.position.z) < RUG.z ? 'rug' : 'wood';
    const radioActive = game.puzzles.radio === 'active';
    this.audio.setListener(this.controller.position, this.controller.yaw);
    this.audio.update(dt, {
      clockPos,
      clockRunning: game.flags.storyStarted,
      knockPos: game.flags.storyStarted ? knockPos : undefined,
      ringing: this.ringing,
      musicLevel: game.truths.length,
      staticLevel: radioActive ? 0.8 : 0.15,
      moving,
      surface,
      stepPos: this.controller.position,
    });

    // Zegar sekundowy – postęp rozgrywki
    this.elapsedAcc += dt;
    if (this.elapsedAcc >= 1) {
      state.dispatch({ type: 'elapsed', ms: this.elapsedAcc * 1000 });
      this.elapsedAcc = 0;
    }
    if (game.phase === 'playing' && isAutoHintDue(gameStore.getState().game)) {
      const next = nextHint(gameStore.getState().game);
      if (next) {
        state.dispatch({ type: 'hintShown', puzzle: next.puzzle });
        state.showHint(next.text, next.level);
      }
    }
  }

  private updateKeyDrift(dt: number): void {
    const game = gameStore.getState().game;
    if (game.inventory.includes('key') || !this.room.keyGroup.visible) return;
    const kpos = this.room.keyGroup.position.clone();
    this.projView.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    const seen = this.frustum.containsPoint(kpos) && this.camera.position.distanceTo(kpos) < 6;
    if (seen) {
      this.keyUnseen = 0;
      return;
    }
    this.keyUnseen += dt;
    this.keyMoveTimer += dt;
    if (this.keyUnseen > 2 && this.keyMoveTimer > 2.5) {
      this.keyMoveTimer = 0;
      this.keySpot = (this.keySpot + 1 + Math.floor(Math.random() * 2)) % KEY_SPOTS.length;
      const [x, y, z] = KEY_SPOTS[this.keySpot];
      this.room.keyGroup.position.set(x, y, z);
      this.room.keyGroup.rotation.z = 0.3 + this.keySpot * 0.5;
    }
  }

  private setHighlight(obj: THREE.Object3D | null, on: boolean): void {
    if (!obj) return;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mm) => {
        const std = mm as THREE.MeshStandardMaterial;
        if (!std.emissive) return;
        if (std.userData.baseEmissive === undefined) {
          std.userData.baseEmissive = std.emissive.getHex();
          std.userData.baseEmissiveIntensity = std.emissiveIntensity;
        }
        if (on) {
          std.emissive.setHex(0xe7b76a);
          std.emissiveIntensity = Math.max(std.userData.baseEmissiveIntensity, 0.16);
        } else {
          std.emissive.setHex(std.userData.baseEmissive);
          std.emissiveIntensity = std.userData.baseEmissiveIntensity;
        }
      });
    });
  }

  private render(dt: number): void {
    const state = gameStore.getState();
    const game = state.game;
    const { cinemaScene, cam } = this.activeScene();
    this.effects.update(this.t, dt, cam.position);
    this.room.update(game, this.t, dt);
    // „Wobble” książki po złym wyborze
    for (const b of this.room.books) {
      const u = b.group.userData.wobbleUntil as number | undefined;
      if (u && this.t < u) b.group.rotation.z = Math.sin(this.t * 40) * 0.08;
      else b.group.rotation.z = 0;
    }
    if (this.renderPass) {
      this.renderPass.scene = cinemaScene;
      this.renderPass.camera = cam;
    }
    this.composer?.render(dt);
    this.adaptQuality();
  }

  private activeScene(): { cinemaScene: THREE.Scene; cam: THREE.PerspectiveCamera } {
    if (this.cinema && this.cinema.scene !== this.scene) return { cinemaScene: this.cinema.scene, cam: this.camera };
    return { cinemaScene: this.scene, cam: this.camera };
  }

  /** Dynamiczne skalowanie jakości: przy słabej klatkowości zmniejsza rozdzielczość renderu. */
  private adaptQuality(): void {
    if (this.frameMs.length < 90 || this.quality === 'low') return;
    const avg = this.frameMs.reduce((a, b) => a + b, 0) / this.frameMs.length;
    if (avg > 30 && this.pixelRatio > 0.6) {
      this.pixelRatio = Math.max(0.6, this.pixelRatio - 0.1);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.frameMs.length = 0;
    }
  }

  get statsDebug(): { fps: number; pixelRatio: number; triangles: number } {
    const avg = this.frameMs.reduce((a, b) => a + b, 0) / Math.max(1, this.frameMs.length);
    return { fps: avg ? Math.round(1000 / avg) : 0, pixelRatio: this.pixelRatio, triangles: this.renderer.info.render.triangles };
  }

  /** Diagnostyka (tylko ?debug=1): ustawia kamerę przy obiekcie i zwraca jego identyfikator. */
  debugLookAt(id: string): boolean {
    const it = this.room.interactables.get(id);
    if (!it) return false;
    this.controller.setPose(it.closeup.pos.clone(), 0, 0);
    this.controller.lookAtPoint(it.closeup.look);
    return true;
  }

  /** Diagnostyka (tylko ?debug=1): wykonuje interakcję tak, jakby gracz kliknął obiekt. */
  debugActivate(id: string, bookSymbol?: string): boolean {
    const it = this.room.interactables.get(id);
    if (!it) return false;
    const obj = bookSymbol ? this.room.books.find((b) => b.symbol === bookSymbol)?.group ?? it.objects[0] : it.objects[0];
    this.activate(id, obj);
    return true;
  }

  /** Zapewnia, że gracz widzi wejścia tylko wtedy, gdy jest w grze (pomocnicze dla testów). */
  get debugPosition(): THREE.Vector3 {
    return this.controller.position.clone();
  }
}

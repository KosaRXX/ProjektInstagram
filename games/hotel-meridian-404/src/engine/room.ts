import * as THREE from 'three';
import type { GameState } from '../game/types';
import { bookSpineTexture, cityTexture, clockFaceTexture, labelTexture, mirrorSheenTexture, paintingTexture, rugTexture, softDotTexture, wallpaperTexture, woodFloorTexture } from './textures';
import { PALETTE } from './palette';

/**
 * Pokój 404 – geometria i rekwizyty budowane proceduralnie.
 *
 * Układ (współrzędne świata, pokój 6×6 m, wysokość 3.4 m):
 *   tylna ściana z=-3: okno (środek), obraz (lewo), biurko + zegar (prawo)
 *   lewa ściana x=-3: biblioteczka (z 0.2…2.2), komoda z radiem (z -1.9…-0.4)
 *   prawa ściana x=+3: lustro (z -2…-0.4), kinkiet, łóżko
 *   przednia ściana z=+3: drzwi główne z klawiaturą (lewo), drzwi „404” (prawo)
 *
 * Moduł nie zna reguł gry: tylko wizualizuje `GameState` i wystawia obiekty interaktywne.
 */

export type DoorId = 'main' | 'trap' | 'mirror';

export interface Interactable {
  id: string;
  objects: THREE.Object3D[];
  /** Maksymalny dystans (m) od kamery, z którego można wejść w interakcję. */
  range: number;
  /** Widok szczegółowy: pozycja kamery i punkt, na który patrzy. */
  closeup: { pos: THREE.Vector3; look: THREE.Vector3 };
}

export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface BookRef {
  id: string;
  symbol: string;
  group: THREE.Object3D;
  rest: number;
}

export interface RoomWorld {
  root: THREE.Group;
  interactables: Map<string, Interactable>;
  colliders: Collider[];
  books: BookRef[];
  keyGroup: THREE.Object3D;
  keyBase: THREE.Vector3;
  /** Obrót fotela/obrazu/lustra używany przez interakcje. */
  update(game: GameState, t: number, dt: number): void;
  setBlackout(level: number): void;
  setDoorOpen(id: DoorId, open: number): void;
  setLampOn(on: boolean): void;
  setRinging(ringing: boolean): void;
  dispose(): void;
}

// ---------- Materiały i helpery ----------

const mat = (color: number, roughness = 0.7, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const brass = () => mat(PALETTE.gold, 0.32, 0.9);
const walnut = () => mat(0x2a1d13, 0.5, 0.05);
const velvet = (color: number) => mat(color, 0.95, 0);

function box(w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, parent?: THREE.Object3D): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent?.add(mesh);
  return mesh;
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D, seg = 24): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent?.add(mesh);
  return mesh;
}

/** Każdy przedmiot dostaje własne materiały, żeby podświetlenie nie przeciekało na inne obiekty. */
function ownMaterials(objects: THREE.Object3D[]): void {
  objects.forEach((o) =>
    o.traverse((child) => {
      const m = child as THREE.Mesh;
      if (m.isMesh) {
        m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : (m.material as THREE.Material).clone();
      }
    }),
  );
}

function radialBlobTexture(): THREE.CanvasTexture {
  const tex = softDotTexture();
  return tex;
}

// ---------- Budowa ----------

export function buildRoom(opts: { shadows: boolean; detail: 'low' | 'medium' | 'high' | 'ultra' }): RoomWorld {
  const root = new THREE.Group();
  root.name = 'room404';
  const interactables = new Map<string, Interactable>();
  const colliders: Collider[] = [
    { minX: 1.5, maxX: 2.7, minZ: -2.8, maxZ: -2.1 }, // biurko
    { minX: -3, maxX: -2.4, minZ: -1.9, maxZ: -0.4 }, // komoda z radiem
    { minX: -3, maxX: -2.4, minZ: 0.2, maxZ: 2.2 }, // biblioteczka
    { minX: 1.0, maxX: 3, minZ: 1.0, maxZ: 2.5 }, // łóżko
    { minX: -1.3, maxX: -0.5, minZ: 0.2, maxZ: 1.0 }, // fotel
    { minX: -1.95, maxX: -1.25, minZ: -0.45, maxZ: 0.25 }, // stolik
  ];
  const register = (id: string, objects: THREE.Object3D[], closeup: { pos: [number, number, number]; look: [number, number, number] }, range = 2.4) => {
    ownMaterials(objects);
    interactables.set(id, {
      id,
      objects,
      range,
      closeup: { pos: new THREE.Vector3(...closeup.pos), look: new THREE.Vector3(...closeup.look) },
    });
  };

  // --- Podłoga, sufit, ściany ---
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat(0xffffff, 0.55, 0, { map: woodFloorTexture() }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat(PALETTE.graphite, 0.9));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 3.4;
  root.add(ceiling);

  const wallMat = mat(0xffffff, 0.9, 0, { map: wallpaperTexture() });
  const addWall = (x: number, z: number, ry: number) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.4), wallMat);
    w.position.set(x, 1.7, z);
    w.rotation.y = ry;
    w.receiveShadow = true;
    root.add(w);
  };
  addWall(0, -3, 0);
  addWall(0, 3, Math.PI);
  addWall(-3, 0, Math.PI / 2);
  addWall(3, 0, -Math.PI / 2);

  // Listwy i gzyms
  const trim = mat(PALETTE.gold, 0.4, 0.6);
  box(6, 0.12, 0.04, trim, 0, 0.06, -2.98);
  box(6, 0.12, 0.04, trim, 0, 0.06, 2.98);
  box(0.04, 0.12, 6, trim, -2.98, 0.06, 0);
  box(0.04, 0.12, 6, trim, 2.98, 0.06, 0);
  box(6, 0.08, 0.1, trim, 0, 3.36, -2.94);
  box(6, 0.08, 0.1, trim, 0, 3.36, 2.94);
  box(0.1, 0.08, 6, trim, -2.94, 3.36, 0);
  box(0.1, 0.08, 6, trim, 2.94, 3.36, 0);

  // Dywan i zarys miejsca fotela (wskazówka dla zagadki 5 – widoczny od początku)
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.6), mat(0xffffff, 0.95, 0, { map: rugTexture() }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.006;
  rug.receiveShadow = true;
  root.add(rug);
  const outlineMat = new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 0.35, roughness: 0.5 });
  const outline = new THREE.Group();
  const OX = -0.9;
  const OZ = 0.6;
  box(0.9, 0.01, 0.04, outlineMat, OX, 0.02, OZ - 0.5, outline);
  box(0.9, 0.01, 0.04, outlineMat, OX, 0.02, OZ + 0.5, outline);
  box(0.04, 0.01, 1.0, outlineMat, OX - 0.45, 0.02, OZ, outline);
  box(0.04, 0.01, 1.0, outlineMat, OX + 0.45, 0.02, OZ, outline);
  root.add(outline);

  // Cień niezależny od obiektów (dryfuje po podłodze) i mgła przy podłodze
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false, map: radialBlobTexture() });
  const independentShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), blobMat);
  independentShadow.rotation.x = -Math.PI / 2;
  independentShadow.position.y = 0.012;
  root.add(independentShadow);
  const mistMat = new THREE.MeshBasicMaterial({ color: PALETTE.steel, transparent: true, opacity: 0.08, depthWrite: false, map: radialBlobTexture() });
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mistMat);
  mist.rotation.x = -Math.PI / 2;
  mist.position.y = 0.3;
  root.add(mist);

  // --- Okno (tylna ściana, środek) z widokiem na miasto ---
  const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.0), new THREE.MeshBasicMaterial({ map: cityTexture() }));
  windowPane.position.set(0, 1.9, -2.96);
  root.add(windowPane);
  const frame = brass();
  box(2.6, 0.08, 0.08, frame, 0, 2.95, -2.95);
  box(2.6, 0.08, 0.08, frame, 0, 0.9, -2.95);
  box(0.08, 2.1, 0.08, frame, -1.25, 1.92, -2.95);
  box(0.08, 2.1, 0.08, frame, 1.25, 1.92, -2.95);
  box(0.05, 2.0, 0.05, frame, 0, 1.92, -2.94);
  box(2.4, 0.05, 0.05, frame, 0, 1.92, -2.94);
  const curtain = velvet(0x1d2a35);
  box(0.42, 2.8, 0.12, curtain, -1.45, 1.6, -2.84);
  box(0.42, 2.8, 0.12, curtain, 1.45, 1.6, -2.84);
  box(3.0, 0.04, 0.04, brass(), 0, 3.0, -2.8);

  // Krople deszczu za oknem lecą w górę – dodane w effects.ts (efekt niezależny od sceny)

  // --- Biurko (tylna ściana, prawo) ---
  const desk = new THREE.Group();
  box(1.2, 0.06, 0.7, walnut(), 0, 0.78, 0, desk);
  box(1.14, 0.12, 0.64, walnut(), 0, 0.68, 0, desk);
  for (const [x, z] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) box(0.06, 0.68, 0.06, walnut(), x, 0.34, z, desk);
  for (let i = 0; i < 3; i++) {
    box(0.36, 0.1, 0.02, walnut(), 0.3, 0.6 - i * 0.11, 0.32, desk);
    cyl(0.012, 0.012, 0.06, brass(), 0.3, 0.6 - i * 0.11, 0.345, desk).rotation.x = Math.PI / 2;
  }
  desk.position.set(2.1, 0, -2.45);
  root.add(desk);

  // Lampa na biurku – fizycznie: punktowe światło z klosza
  const lampGroup = new THREE.Group();
  cyl(0.12, 0.14, 0.04, brass(), 0, 0.82, 0, lampGroup);
  cyl(0.015, 0.015, 0.5, brass(), 0, 1.07, 0, lampGroup);
  const shadeMat = new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 0.55, side: THREE.DoubleSide, roughness: 0.8 });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.22, 24, 1, true), shadeMat);
  shade.position.set(0, 1.3, 0);
  shade.rotation.x = Math.PI;
  lampGroup.add(shade);
  lampGroup.position.set(1.7, 0, -2.3);
  root.add(lampGroup);
  const deskLight = new THREE.PointLight(PALETTE.amber, 16, 7, 2);
  deskLight.position.set(1.7, 1.2, -2.3);
  deskLight.castShadow = opts.shadows && opts.detail !== 'low';
  deskLight.shadow.mapSize.set(512, 512);
  root.add(deskLight);

  // Telefon: podstawa, słuchawka, dzwonek
  const phone = new THREE.Group();
  const phoneBlack = mat(0x2a2f36, 0.35, 0.2);
  const phoneMat = phoneBlack;
  cyl(0.15, 0.17, 0.08, phoneBlack, 0, 0, 0, phone, 32);
  const handset = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.2, 6, 12), phoneBlack);
  handset.rotation.z = Math.PI / 2;
  handset.position.set(0, 0.1, 0);
  handset.castShadow = true;
  phone.add(handset);
  cyl(0.04, 0.04, 0.02, brass(), 0, 0.05, 0, phone, 16);
  phone.position.set(1.85, 0.81, -2.5);
  root.add(phone);
  register('phone', [phone], { pos: [1.3, 1.45, -1.2], look: [1.85, 0.85, -2.5] });

  // --- Zegar mechaniczny (nad biurkiem) ---
  const clock = new THREE.Group();
  const caseMat = walnut();
  box(0.8, 1.05, 0.22, caseMat, 0, 0, 0, clock);
  box(0.9, 0.14, 0.26, caseMat, 0, 0.6, 0, clock);
  box(0.98, 0.05, 0.3, brass(), 0, 0.68, 0, clock);
  const faceMat = mat(0xffffff, 0.35, 0, { map: clockFaceTexture() });
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.33, 48), faceMat);
  face.position.set(0, 0.04, 0.115);
  clock.add(face);
  const pmMat = mat(0xffffff, 0.5, 0, { map: labelTexture(['AM'], { w: 256, h: 128, size: 60, bg: '#e9e4d9', fg: '#17191d' }) });
  const pmPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.09), pmMat);
  pmPlate.position.set(0, -0.28, 0.12);
  clock.add(pmPlate);
  const hourHand = new THREE.Group();
  box(0.035, 0.2, 0.012, mat(0x17191d, 0.4, 0.4), 0, 0.1, 0.13, hourHand);
  hourHand.position.set(0, 0.04, 0.13);
  clock.add(hourHand);
  const minuteHand = new THREE.Group();
  box(0.025, 0.3, 0.012, mat(0x17191d, 0.4, 0.4), 0, 0.14, 0.14, minuteHand);
  minuteHand.position.set(0, 0.04, 0.14);
  clock.add(minuteHand);
  cyl(0.025, 0.025, 0.03, brass(), 0, 0.04, 0.15, clock).rotation.x = Math.PI / 2;
  const pendulum = new THREE.Group();
  cyl(0.008, 0.008, 0.5, brass(), 0, -0.25, 0, pendulum);
  cyl(0.06, 0.06, 0.02, brass(), 0, -0.52, 0, pendulum).rotation.x = Math.PI / 2;
  pendulum.position.set(0, -0.2, 0.05);
  clock.add(pendulum);
  // Szuflada w podstawie zegara (schowek po zagadce 1)
  const drawer = new THREE.Group();
  box(0.5, 0.12, 0.2, walnut(), 0, -0.6, 0, drawer);
  cyl(0.02, 0.02, 0.04, brass(), 0, -0.6, 0.11, drawer).rotation.x = Math.PI / 2;
  clock.add(drawer);
  clock.position.set(2.1, 2.3, -2.85);
  root.add(clock);
  register('clock', [clock], { pos: [1.0, 1.7, -1.2], look: [2.1, 2.2, -2.95] }, 2.6);

  // --- Obraz z ukrytym mechanizmem (tylna ściana, lewo) ---
  const paintingMat = mat(0xffffff, 0.6, 0, { map: paintingTexture(0.5) });
  const painting = new THREE.Group();
  const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), paintingMat);
  painting.add(canvasMesh);
  box(1.3, 0.06, 0.05, brass(), 0, 0.72, -0.01, painting);
  box(1.3, 0.06, 0.05, brass(), 0, -0.72, -0.01, painting);
  box(0.06, 1.5, 0.05, brass(), -0.6, 0, -0.01, painting);
  box(0.06, 1.5, 0.05, brass(), 0.6, 0, -0.01, painting);
  painting.position.set(-2.3, 1.75, -2.96);
  root.add(painting);
  register('painting', [painting], { pos: [-1.4, 1.7, -1.2], look: [-2.3, 1.75, -2.96] });

  // --- Lustro (prawa ściana, z=-1.2) – po zagadce 3 jest też drzwiami ---
  const mirror = new THREE.Group();
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x2c3a46, roughness: 0.06, metalness: 1, envMapIntensity: 1.4 });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), glassMat);
  glass.rotation.y = -Math.PI / 2; // normalna w stronę pokoju (-x)
  mirror.add(glass);
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), new THREE.MeshBasicMaterial({ map: mirrorSheenTexture(), transparent: true, depthWrite: false }));
  sheen.rotation.y = -Math.PI / 2;
  sheen.position.x = -0.002;
  mirror.add(sheen);
  box(0.05, 1.9, 0.05, brass(), 0, 0, -0.56, mirror);
  box(0.05, 1.9, 0.05, brass(), 0, 0, 0.56, mirror);
  box(0.05, 0.05, 1.2, brass(), 0, 0.94, 0, mirror);
  box(0.05, 0.05, 1.2, brass(), 0, -0.94, 0, mirror);
  mirror.position.set(2.96, 1.75, -1.2);
  root.add(mirror);
  register('mirror', [mirror], { pos: [1.6, 1.6, -0.6], look: [2.96, 1.75, -1.2] });

  // Kinkiet (prawa ściana, z=0.5) – delikatnie migocze
  const sconceGroup = new THREE.Group();
  cyl(0.06, 0.09, 0.2, brass(), 0, 0, 0, sconceGroup);
  const sconceShadeMat = new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 0.7 });
  const sconceShade = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), sconceShadeMat);
  sconceShade.position.set(0, 0.12, 0);
  sconceGroup.add(sconceShade);
  sconceGroup.position.set(2.92, 2.2, 0.5);
  sconceGroup.rotation.y = -Math.PI / 2;
  root.add(sconceGroup);
  const sconceLight = new THREE.PointLight(PALETTE.amber, 6, 5, 2);
  sconceLight.position.set(2.7, 2.2, 0.5);
  root.add(sconceLight);

  // Żyrandol art deco
  const chand = new THREE.Group();
  cyl(0.02, 0.02, 0.5, brass(), 0, 0.25, 0, chand);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 8, 48), brass());
  ring.rotation.x = Math.PI / 2;
  chand.add(ring);
  const bulbMat = new THREE.MeshStandardMaterial({ color: PALETTE.ivory, emissive: PALETTE.ivory, emissiveIntensity: 0.9 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), bulbMat);
    bulb.position.set(Math.cos(a) * 0.4, -0.02, Math.sin(a) * 0.4);
    chand.add(bulb);
  }
  chand.position.set(0, 3.0, 0);
  root.add(chand);
  const ceilingLight = new THREE.PointLight(PALETTE.ivory, 5, 8, 2);
  ceilingLight.position.set(0, 2.8, 0);
  root.add(ceilingLight);

  // --- Biblioteczka (lewa ściana, z 0.2…2.2) ---
  const shelf = new THREE.Group();
  const woodMat = walnut();
  box(0.1, 2.3, 2.0, woodMat, 0, 1.15, 0, shelf); // plecy (przy ścianie x=-3)
  box(0.45, 2.3, 0.05, woodMat, 0.2, 1.15, -1.0, shelf);
  box(0.45, 2.3, 0.05, woodMat, 0.2, 1.15, 1.0, shelf);
  for (const y of [0.05, 0.6, 1.15, 1.7, 2.25]) box(0.45, 0.04, 2.0, woodMat, 0.2, y, 0, shelf);
  // Ukryty panel za książkami – odsuwa się po zagadce 2
  const secretPanel = box(0.02, 0.5, 1.9, mat(0x0f1218, 0.9, 0), 0.02, 1.17, 0, shelf);
  shelf.position.set(-2.95, 0, 1.2);
  root.add(shelf);

  const books: BookRef[] = [];
  const bookDefs: Array<{ id: string; symbol: string; label: string; bg: string }> = [
    { id: 'book-KLUCZ', symbol: 'KLUCZ', label: 'KLUCZ', bg: '#17191d' },
    { id: 'book-OKO', symbol: 'OKO', label: 'OKO', bg: '#101923' },
    { id: 'book-FALA', symbol: 'FALA', label: 'FALA', bg: '#527a91' },
    { id: 'book-KSIEZYC', symbol: 'KSIĘŻYC', label: 'KSIĘŻYC', bg: '#2b3a46' },
    { id: 'book-decoy-1', symbol: 'DECOY', label: 'MENU', bg: '#3b2a1c' },
    { id: 'book-decoy-2', symbol: 'DECOY', label: 'ATLAS', bg: '#44301f' },
  ];
  // Pozycje wzdłuż półki (oś z): książki symboliczne i zmyłki pomieszane
  const bookZ = [-0.85, -0.6, -0.35, -0.1, 0.2, 0.45];
  const SHELF_Y = 1.15 + 0.22 + 0.04;
  bookDefs.forEach((def, i) => {
    const group = new THREE.Group();
    const spineMat = mat(0xffffff, 0.6, 0, { map: bookSpineTexture(def.label, def.bg) });
    const coverMat = mat(parseInt(def.bg.slice(1), 16), 0.8, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.1), [spineMat, coverMat, coverMat, coverMat, coverMat, coverMat]);
    mesh.castShadow = true;
    group.add(mesh);
    group.position.set(0.25, SHELF_Y, bookZ[i]);
    group.userData.bookSymbol = def.symbol;
    shelf.add(group);
    books.push({ id: def.id, symbol: def.symbol, group, rest: 0.25 });
  });
  // Zwykłe książki-wypełniacze
  [0.7, 0.86].forEach((z, i) => {
    box(0.1, 0.36 + i * 0.04, 0.09, mat(0x1f2a33 + i * 0x0a0a0a, 0.8, 0), 0.25, 0.05 + 0.2 + 0.02, z, shelf);
  });
  register('books', books.map((b) => b.group), { pos: [-1.4, 1.5, 1.2], look: [-2.8, 1.5, 1.2] }, 2.6);

  // --- Komoda z radiem (lewa ściana, z=-1.15) ---
  const cred = new THREE.Group();
  box(0.6, 0.8, 1.5, walnut(), 0, 0.4, 0, cred);
  box(0.02, 0.5, 1.4, walnut(), 0.31, 0.4, 0, cred);
  cred.position.set(-2.7, 0, -1.15);
  root.add(cred);

  const radio = new THREE.Group();
  box(0.5, 0.32, 0.22, walnut(), 0, 0, 0, radio);
  const dialCanvas = document.createElement('canvas');
  dialCanvas.width = 1024;
  dialCanvas.height = 160;
  const dctx = dialCanvas.getContext('2d') as CanvasRenderingContext2D;
  dctx.fillStyle = '#2a1d13';
  dctx.fillRect(0, 0, 1024, 160);
  dctx.fillStyle = 'rgba(231,183,106,0.95)';
  dctx.font = '28px serif';
  dctx.textAlign = 'center';
  for (let f = 88; f <= 106; f += 1) {
    const x = ((f - 88) / 18) * 980 + 22;
    dctx.fillRect(x, 60, 2, f % 2 === 0 ? 40 : 22);
    if (f % 2 === 0) dctx.fillText(String(f), x, 40);
  }
  const dialTex = new THREE.CanvasTexture(dialCanvas);
  dialTex.colorSpace = THREE.SRGBColorSpace;
  const dialMat = new THREE.MeshStandardMaterial({ map: dialTex, emissiveMap: dialTex, emissive: PALETTE.amber, emissiveIntensity: 0.7, roughness: 0.6 });
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.065), dialMat);
  dial.position.set(0, 0.06, 0.112);
  radio.add(dial);
  const needle = box(0.008, 0.07, 0.01, mat(0xb85a3a, 0.4, 0.2), 0, 0.06, 0.12, radio);
  const knob = cyl(0.05, 0.06, 0.05, brass(), 0.17, -0.07, 0.12, radio);
  knob.rotation.x = Math.PI / 2;
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.12), mat(0x17191d, 0.8, 0.2));
  grille.position.set(-0.1, -0.07, 0.112);
  radio.add(grille);
  radio.position.set(-2.7, 0.92, -1.15);
  radio.rotation.y = Math.PI / 2;
  root.add(radio);
  register('radio', [radio], { pos: [-1.4, 1.4, -0.8], look: [-2.7, 0.95, -1.15] }, 2.2);

  // --- Stolik z kluczem ---
  const table = new THREE.Group();
  cyl(0.32, 0.32, 0.04, walnut(), 0, 0.7, 0, table, 32);
  cyl(0.04, 0.06, 0.7, walnut(), 0, 0.35, 0, table, 12);
  cyl(0.2, 0.2, 0.03, walnut(), 0, 0.02, 0, table, 24);
  table.position.set(-1.6, 0, -0.1);
  root.add(table);
  const keyGroup = new THREE.Group();
  const keyMat = brass();
  const bow = cyl(0.06, 0.06, 0.012, keyMat, 0, 0, 0, keyGroup, 20);
  bow.rotation.x = Math.PI / 2;
  box(0.14, 0.02, 0.01, keyMat, 0.16, 0, 0, keyGroup);
  box(0.03, 0.04, 0.012, keyMat, 0.2, -0.02, 0, keyGroup);
  // Gratka na kluczu – data wygrawerowana (13.11): tu tylko wizualnie
  box(0.05, 0.005, 0.014, mat(0x6b5230, 0.6, 0.6), 0.02, 0.006, 0, keyGroup);
  keyGroup.position.set(-1.6, 0.73, -0.1);
  keyGroup.rotation.x = -Math.PI / 2;
  keyGroup.rotation.z = 0.3;
  root.add(keyGroup);
  register('key', [keyGroup], { pos: [-1.1, 1.3, 0.6], look: [-1.6, 0.75, -0.1] }, 2.0);

  // --- Fotel (przesuwa się w zagadce 5; obrys = miejsce A) ---
  const chair = new THREE.Group();
  const chairMat = velvet(0x2b3a46);
  box(0.8, 0.22, 0.8, chairMat, 0, 0.42, 0, chair);
  box(0.8, 0.7, 0.14, chairMat, 0, 0.8, -0.34, chair);
  box(0.12, 0.42, 0.7, chairMat, -0.36, 0.6, 0, chair);
  box(0.12, 0.42, 0.7, chairMat, 0.36, 0.6, 0, chair);
  for (const [x, z] of [[-0.34, 0.34], [0.34, 0.34], [-0.34, -0.34], [0.34, -0.34]]) cyl(0.03, 0.03, 0.3, walnut(), x, 0.15, z, chair, 10);
  chair.position.set(OX, 0, OZ);
  root.add(chair);
  register('chair', [chair], { pos: [-0.2, 1.4, 1.8], look: [-0.9, 0.6, 0.6] }, 2.4);

  // --- Łóżko (prawo) – w zakończeniu C pojawia się na nim postać ---
  const bed = new THREE.Group();
  box(2.0, 0.3, 1.5, walnut(), 0, 0.2, 0, bed);
  box(1.9, 0.18, 1.4, mat(PALETTE.ivory, 0.9, 0), 0, 0.42, 0, bed);
  box(0.1, 1.0, 1.6, walnut(), 0.98, 0.5, 0, bed);
  box(0.36, 0.12, 0.5, mat(PALETTE.ivory, 0.95, 0), -0.7, 0.6, 0.35, bed);
  box(0.36, 0.12, 0.5, mat(PALETTE.ivory, 0.95, 0), -0.7, 0.6, -0.35, bed);
  bed.position.set(2.0, 0, 1.75);
  root.add(bed);

  // --- Drzwi główne (przód, lewo) – zawias na lewej krawędzi (x=-2.1) ---
  const mainHinge = new THREE.Group();
  mainHinge.position.set(-2.1, 0, 2.96);
  root.add(mainHinge);
  const mainDoor = new THREE.Group();
  mainDoor.position.set(0.475, 0, 0);
  mainHinge.add(mainDoor);
  box(0.95, 2.3, 0.07, walnut(), 0, 1.15, 0, mainDoor);
  box(0.7, 0.9, 0.02, walnut(), 0, 1.65, 0.045, mainDoor);
  box(0.7, 0.9, 0.02, walnut(), 0, 0.65, 0.045, mainDoor);
  cyl(0.02, 0.02, 0.14, brass(), 0.35, 1.1, 0.06, mainDoor).rotation.x = Math.PI / 2;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), mat(0xffffff, 0.5, 0, { map: labelTexture(['NIE KAŻDE WYJŚCIE', 'PROWADZI NA ZEWNĄTRZ'], { w: 512, h: 128, size: 30 }) }));
  plaque.position.set(-1.6, 2.6, 2.93);
  plaque.rotation.y = Math.PI;
  root.add(plaque);
  // Panel z klawiaturą obok drzwi
  const keypad = new THREE.Group();
  box(0.3, 0.5, 0.05, mat(0x17191d, 0.4, 0.5), 0, 0, 0, keypad);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.07), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
  screen.position.set(0, 0.16, 0.03);
  keypad.add(screen);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const b = cyl(0.02, 0.02, 0.02, brass(), -0.08 + c * 0.08, 0.04 - r * 0.07, 0.03, keypad, 10);
      b.rotation.x = Math.PI / 2;
    }
  }
  keypad.position.set(-0.9, 1.2, 2.94);
  keypad.rotation.y = Math.PI;
  root.add(keypad);
  register('door-main', [mainDoor, keypad], { pos: [-1.2, 1.5, 1.6], look: [-1.6, 1.2, 2.96] });

  // --- Drzwi „404” (pułapka) – zawias x=1.0 ---
  const trapHinge = new THREE.Group();
  trapHinge.position.set(1.0, 0, 2.96);
  root.add(trapHinge);
  const trapDoor = new THREE.Group();
  trapDoor.position.set(0.475, 0, 0);
  trapHinge.add(trapDoor);
  box(0.95, 2.3, 0.07, walnut(), 0, 1.15, 0, trapDoor);
  const trapPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), mat(0xffffff, 0.4, 0.4, { map: labelTexture(['404'], { w: 256, h: 128, size: 80, bg: '#b79a61', fg: '#101923' }) }));
  trapPlate.position.set(0, 1.9, 0.04);
  trapDoor.add(trapPlate);
  cyl(0.02, 0.02, 0.14, brass(), 0.35, 1.1, 0.06, trapDoor).rotation.x = Math.PI / 2;
  register('door-trap', [trapDoor], { pos: [1.5, 1.5, 1.6], look: [1.47, 1.2, 2.96] });

  // Dekoracja: roślina w rogu
  const plant = new THREE.Group();
  cyl(0.2, 0.15, 0.4, mat(0x2b3a46, 0.7, 0), 0, 0.2, 0, plant, 20);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 6), mat(0x2f4a3a, 0.8, 0));
    leaf.position.set(Math.cos(a) * 0.1, 0.65, Math.sin(a) * 0.1);
    leaf.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
    leaf.castShadow = true;
    plant.add(leaf);
  }
  plant.position.set(-2.4, 0, -2.6);
  root.add(plant);

  // Ambient occlusion przybliżony kontaktowymi cieniami pod meblami (tani, bez post-processingu)
  const contactMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false, map: blobMat.map });
  const contact = (x: number, z: number, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), contactMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.008, z);
    root.add(m);
  };
  contact(2.1, -2.45, 1.45, 0.95); // biurko
  contact(-0.9, 0.6, 1.15, 1.15); // fotel
  contact(2.0, 1.75, 2.3, 1.85); // łóżko
  contact(-2.7, -1.15, 0.95, 1.85); // komoda
  contact(-2.55, 1.2, 0.85, 2.45); // biblioteczka
  contact(-1.6, -0.1, 0.9, 0.9); // stolik
  contact(-2.4, -2.6, 0.7, 0.7); // roślina

  // --- Oświetlenie: chłodne światło z okna (księżyc), wypełnienie, lampy ---
  const hemi = new THREE.HemisphereLight(PALETTE.steel, PALETTE.graphite, 0.35);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.steel, 1.1);
  sun.position.set(-0.6, 4, -6);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = opts.shadows;
  const mapSize = opts.detail === 'ultra' ? 2048 : 1024;
  sun.shadow.mapSize.set(mapSize, mapSize);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
  sun.shadow.bias = -0.0005;
  root.add(sun);
  root.add(sun.target);

  // Ukryta wiadomość tuszem UV – widoczna tylko podczas odwrócenia pokoju
  const uvText = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.5),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, map: labelTexture(['CZAS COFA SIĘ, ALE NIE ZAPOMINA'], { w: 1024, h: 200, size: 52, bg: '#00000000', fg: '#7fe7ff' }) }),
  );
  uvText.position.set(0, 2.7, -2.95);
  root.add(uvText);

  // ---------- Stan wizualny ----------
  let blackout = 0;
  let ringing = false;
  let lampOn = true;
  let paintingNow = 0;
  let paintingMoon = -1;
  let chairNow = 0;
  let reverseAngle = 0;
  let drawerNow = 0;
  let shelfNow = 0;
  let radioNow = 92;
  let pmShown: boolean | null = null;
  const doorTarget: Record<DoorId, number> = { main: 0, trap: 0, mirror: 0 };
  const doorNow: Record<DoorId, number> = { main: 0, trap: 0, mirror: 0 };
  const phoneBase = phone.position.clone();
  const keyBase = keyGroup.position.clone();

  const setPmPlate = (pm: boolean) => {
    if (pm === pmShown) return;
    pmShown = pm;
    const old = pmMat.map;
    pmMat.map = labelTexture([pm ? 'PM' : 'AM'], { w: 256, h: 128, size: 60, bg: '#e9e4d9', fg: '#17191d' });
    pmMat.needsUpdate = true;
    old?.dispose();
  };

  const setPainting = (hour12: number) => {
    const moon = (hour12 % 12) / 12;
    if (Math.abs(moon - paintingMoon) < 1e-6) return;
    paintingMoon = moon;
    const old = paintingMat.map;
    paintingMat.map = paintingTexture(moon);
    paintingMat.needsUpdate = true;
    old?.dispose();
  };

  const update = (game: GameState, t: number, dt: number) => {
    // Obraz: fazę księżyca zmienia godzina zegara; obrót = odwrócenie pokoju
    setPainting(game.clock.hour12);
    const paintingTarget = game.flags.paintingFlipped ? Math.PI : 0;
    paintingNow += (paintingTarget - paintingNow) * Math.min(1, dt * 6);
    painting.rotation.z = paintingNow;

    // Fotel: A (obrys) ↔ B (po drugiej stronie pokoju)
    const chairTarget = game.flags.chairMoved ? 1 : 0;
    chairNow += (chairTarget - chairNow) * Math.min(1, dt * 3);
    chair.position.set(OX + (0.2 - OX) * chairNow, 0, OZ + (-0.9 - OZ) * chairNow);
    chair.rotation.y = chairNow * (Math.PI / 2);

    // Zegar: wskazówki z GameState; podczas odwrócenia cofają się
    if (game.flags.clockReversed) reverseAngle -= dt * 1.1;
    else reverseAngle += (0 - reverseAngle) * Math.min(1, dt * 2);
    const hourAngle = ((game.clock.hour12 % 12) + game.clock.minute / 60) * (Math.PI / 6) + reverseAngle / 12;
    const minuteAngle = (game.clock.minute / 60) * Math.PI * 2 + reverseAngle;
    hourHand.rotation.z = -hourAngle;
    minuteHand.rotation.z = -minuteAngle;
    setPmPlate(game.clock.pm);
    pendulum.rotation.z = Math.sin(t * 2.2) * 0.28;

    // Szuflada zegara otwiera się po zagadce 1
    drawerNow += ((game.puzzles.clock === 'solved' ? 1 : 0) - drawerNow) * Math.min(1, dt * 3);
    drawer.position.z = drawerNow * 0.2;

    // Panel na półce odsuwa się po zagadce 2
    shelfNow += ((game.puzzles.books === 'solved' ? 1 : 0) - shelfNow) * Math.min(1, dt * 2);
    secretPanel.position.z = 0.02 + shelfNow * 0.6;

    // Książki: wysunięte są te, których symbol jest w bieżącej kolejności
    for (const b of books) {
      const pulled = b.symbol !== 'DECOY' && game.progress.bookOrder.includes(b.symbol);
      const targetX = pulled ? b.rest + 0.22 : b.rest;
      b.group.position.x += (targetX - b.group.position.x) * Math.min(1, dt * 8);
    }

    // Radio: wskaźnik i pokrętło idą za liczbą dostrojonych stacji (postęp)
    const target = 88 + (game.progress.radioTuned.length / 3) * 10;
    radioNow += (target - radioNow) * Math.min(1, dt * 2);
    needle.position.x = ((radioNow - 88) / 18 - 0.5) * 0.42;
    knob.rotation.z = (radioNow - 88) * 0.12;
    dialMat.emissiveIntensity = 0.55 + Math.sin(t * 3) * 0.05 + (game.progress.radioTuned.length ? 0.2 : 0);

    // Lustro po rozwiązaniu świeci mocniej
    glassMat.envMapIntensity = game.puzzles.mirror === 'solved' ? 2.2 : 1.4;

    // Drzwi – płynne animacje
    for (const k of ['main', 'trap', 'mirror'] as DoorId[]) doorNow[k] += (doorTarget[k] - doorNow[k]) * Math.min(1, dt * 1.8);
    mainHinge.rotation.y = -doorNow.main * 1.55;
    trapHinge.rotation.y = doorNow.trap * 1.55;
    mirror.rotation.y = -doorNow.mirror * 0.9;
    mirror.position.x = 2.96 - doorNow.mirror * 0.1;

    // Telefon: drżenie słuchawki przy dzwonieniu
    if (ringing) {
      phone.position.set(phoneBase.x + Math.sin(t * 40) * 0.004, phoneBase.y, phoneBase.z);
      phone.rotation.y = Math.sin(t * 30) * 0.06;
      phoneMat.emissive.setHex(PALETTE.amber);
      phoneMat.emissiveIntensity = 0.25 + Math.sin(t * 6) * 0.2;
    } else {
      phone.position.copy(phoneBase);
      phone.rotation.y = 0;
      phoneMat.emissiveIntensity = 0;
    }

    // Cień i mgła – ruch niezależny od obiektów (efekt „zapomnianego”)
    independentShadow.position.set(Math.sin(t * 0.13) * 1.6 + 0.2, 0.012, Math.cos(t * 0.09) * 0.9 - 0.2);
    independentShadow.rotation.z = t * 0.05;
    mist.position.x = Math.sin(t * 0.05) * 0.4;
    mist.position.z = Math.cos(t * 0.04) * 0.4;
    mistMat.opacity = 0.07 + Math.sin(t * 0.3) * 0.02;

    // Tekst UV: tylko podczas odwrócenia
    const reversedActive = game.flags.roomReversed && game.puzzles.shift === 'active';
    const uvMat = uvText.material as THREE.MeshBasicMaterial;
    uvMat.opacity = reversedActive ? 0.25 + Math.sin(t * 2) * 0.1 : 0;

    // Światła: wygaszenie, lampa, migotanie w czasie odwrócenia
    const flick = reversedActive ? 0.85 + Math.sin(t * 17) * 0.05 : 1;
    const dim = 1 - blackout;
    const lampLevel = lampOn ? 1 : 0;
    deskLight.intensity = 16 * dim * flick * lampLevel;
    shadeMat.emissiveIntensity = 0.55 * dim * lampLevel + 0.02;
    sconceLight.intensity = 6 * dim * flick * (0.95 + Math.sin(t * 1.3) * 0.05);
    sconceShadeMat.emissiveIntensity = 0.7 * dim;
    ceilingLight.intensity = 5 * dim * flick;
    sun.intensity = 1.1 * (0.25 + 0.75 * dim);
    hemi.intensity = 0.35 * (0.5 + 0.5 * dim);
  };

  return {
    root,
    interactables,
    colliders,
    books,
    keyGroup,
    keyBase,
    update,
    setBlackout(level: number) {
      blackout = Math.max(0, Math.min(1, level));
    },
    setDoorOpen(id: DoorId, open: number) {
      doorTarget[id] = open;
    },
    setLampOn(on: boolean) {
      lampOn = on;
    },
    setRinging(r: boolean) {
      ringing = r;
    },
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mm) => {
          (mm as THREE.MeshStandardMaterial).map?.dispose();
          mm.dispose();
        });
      });
    },
  };
}
